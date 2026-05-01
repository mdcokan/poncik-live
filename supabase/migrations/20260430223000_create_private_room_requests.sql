create table if not exists public.private_room_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  streamer_id uuid not null references auth.users(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  viewer_note text,
  streamer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint private_room_requests_status_check check (status in ('pending', 'accepted', 'rejected', 'cancelled', 'expired')),
  constraint private_room_requests_viewer_note_length check (length(coalesce(viewer_note, '')) <= 300),
  constraint private_room_requests_streamer_note_length check (length(coalesce(streamer_note, '')) <= 300),
  constraint private_room_requests_viewer_streamer_diff check (viewer_id <> streamer_id)
);

create index if not exists private_room_requests_room_status_created_idx
on public.private_room_requests (room_id, status, created_at desc);

create index if not exists private_room_requests_streamer_status_created_idx
on public.private_room_requests (streamer_id, status, created_at desc);

create index if not exists private_room_requests_viewer_status_created_idx
on public.private_room_requests (viewer_id, status, created_at desc);

create unique index if not exists private_room_requests_one_pending_per_pair_idx
on public.private_room_requests (streamer_id, viewer_id)
where status = 'pending';

drop trigger if exists private_room_requests_set_updated_at on public.private_room_requests;
create trigger private_room_requests_set_updated_at
before update on public.private_room_requests
for each row
execute function public.set_updated_at();

alter table public.private_room_requests enable row level security;

grant select on table public.private_room_requests to authenticated;

drop policy if exists "private_room_requests_select_viewer" on public.private_room_requests;
create policy "private_room_requests_select_viewer"
on public.private_room_requests
for select
to authenticated
using (auth.uid() = viewer_id);

drop policy if exists "private_room_requests_select_streamer" on public.private_room_requests;
create policy "private_room_requests_select_streamer"
on public.private_room_requests
for select
to authenticated
using (auth.uid() = streamer_id);

drop policy if exists "private_room_requests_select_admin_owner" on public.private_room_requests;
create policy "private_room_requests_select_admin_owner"
on public.private_room_requests
for select
to authenticated
using (public.current_user_role() in ('admin', 'owner'));

alter table public.private_room_requests replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'private_room_requests'
  ) then
    alter publication supabase_realtime add table public.private_room_requests;
  end if;
end
$$;

create or replace function public.create_private_room_request(
  p_room_id uuid,
  p_viewer_note text default null
)
returns table (
  id uuid,
  room_id uuid,
  streamer_id uuid,
  viewer_id uuid,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_streamer_id uuid;
  v_room_status public.room_status;
  v_is_banned boolean;
  v_wallet_balance integer := 0;
  v_viewer_note text := nullif(trim(coalesce(p_viewer_note, '')), '');
begin
  if v_viewer_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select coalesce(p.is_banned, false)
  into v_is_banned
  from public.profiles p
  where p.id = v_viewer_id
  limit 1;

  if coalesce(v_is_banned, false) then
    raise exception 'BANNED';
  end if;

  select r.owner_id, r.status
  into v_streamer_id, v_room_status
  from public.rooms r
  where r.id = p_room_id
  limit 1;

  if v_streamer_id is null or v_room_status <> 'live' then
    raise exception 'ROOM_NOT_LIVE';
  end if;

  if v_streamer_id = v_viewer_id then
    raise exception 'SELF_REQUEST_NOT_ALLOWED';
  end if;

  if exists (
    select 1
    from public.room_bans rb
    where rb.room_id = p_room_id
      and rb.user_id = v_viewer_id
  ) then
    raise exception 'ROOM_BANNED';
  end if;

  select coalesce(w.balance, 0)
  into v_wallet_balance
  from public.wallets w
  where w.user_id = v_viewer_id
  limit 1;

  if coalesce(v_wallet_balance, 0) <= 0 then
    raise exception 'INSUFFICIENT_MINUTES';
  end if;

  if exists (
    select 1
    from public.private_room_requests prr
    where prr.streamer_id = v_streamer_id
      and prr.viewer_id = v_viewer_id
      and prr.status = 'pending'
  ) then
    raise exception 'PENDING_REQUEST_EXISTS';
  end if;

  return query
  insert into public.private_room_requests (
    room_id,
    streamer_id,
    viewer_id,
    status,
    viewer_note
  )
  values (
    p_room_id,
    v_streamer_id,
    v_viewer_id,
    'pending',
    v_viewer_note
  )
  returning
    private_room_requests.id,
    private_room_requests.room_id,
    private_room_requests.streamer_id,
    private_room_requests.viewer_id,
    private_room_requests.status,
    private_room_requests.created_at;
end;
$$;

revoke all on function public.create_private_room_request(uuid, text) from public;
revoke all on function public.create_private_room_request(uuid, text) from anon;
grant execute on function public.create_private_room_request(uuid, text) to authenticated;

create or replace function public.decide_private_room_request(
  p_request_id uuid,
  p_decision text,
  p_streamer_note text default null
)
returns table (
  id uuid,
  room_id uuid,
  streamer_id uuid,
  viewer_id uuid,
  status text,
  decided_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_streamer_note text := nullif(trim(coalesce(p_streamer_note, '')), '');
  v_request public.private_room_requests%rowtype;
  v_can_manage boolean := false;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if v_decision not in ('accepted', 'rejected', 'cancelled') then
    raise exception 'INVALID_DECISION';
  end if;

  select *
  into v_request
  from public.private_room_requests
  where private_room_requests.id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'REQUEST_NOT_PENDING';
  end if;

  select public.current_user_role() into v_actor_role;
  v_can_manage := v_actor_role in ('admin', 'owner');

  if v_decision in ('accepted', 'rejected') then
    if not (v_actor_id = v_request.streamer_id or v_can_manage) then
      raise exception 'FORBIDDEN';
    end if;
  else
    if not (
      v_actor_id = v_request.viewer_id
      or v_actor_id = v_request.streamer_id
      or v_can_manage
    ) then
      raise exception 'FORBIDDEN';
    end if;
  end if;

  return query
  update public.private_room_requests
  set
    status = v_decision,
    streamer_note = v_streamer_note,
    decided_at = now(),
    updated_at = now()
  where private_room_requests.id = p_request_id
  returning
    private_room_requests.id,
    private_room_requests.room_id,
    private_room_requests.streamer_id,
    private_room_requests.viewer_id,
    private_room_requests.status,
    private_room_requests.decided_at;

  begin
    if v_decision = 'accepted' then
      perform public.write_admin_action_log(
        p_admin_id => v_actor_id,
        p_action_type => 'private_request_accepted',
        p_description => 'Özel oda talebi kabul edildi',
        p_target_user_id => v_request.viewer_id,
        p_target_room_id => v_request.room_id,
        p_metadata => jsonb_build_object('request_id', p_request_id, 'decision', v_decision)
      );
    elsif v_decision = 'rejected' then
      perform public.write_admin_action_log(
        p_admin_id => v_actor_id,
        p_action_type => 'private_request_rejected',
        p_description => 'Özel oda talebi reddedildi',
        p_target_user_id => v_request.viewer_id,
        p_target_room_id => v_request.room_id,
        p_metadata => jsonb_build_object('request_id', p_request_id, 'decision', v_decision)
      );
    else
      perform public.write_admin_action_log(
        p_admin_id => v_actor_id,
        p_action_type => 'private_request_cancelled',
        p_description => 'Özel oda talebi iptal edildi',
        p_target_user_id => v_request.viewer_id,
        p_target_room_id => v_request.room_id,
        p_metadata => jsonb_build_object('request_id', p_request_id, 'decision', v_decision)
      );
    end if;
  exception
    when others then
      null;
  end;
end;
$$;

revoke all on function public.decide_private_room_request(uuid, text, text) from public;
revoke all on function public.decide_private_room_request(uuid, text, text) from anon;
grant execute on function public.decide_private_room_request(uuid, text, text) to authenticated;
