create table if not exists public.streamer_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  streamer_id uuid not null references auth.users (id) on delete restrict,
  requested_minutes integer not null,
  status text not null default 'pending',
  payment_note text,
  admin_note text,
  admin_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint streamer_withdrawal_requests_requested_minutes_positive check (requested_minutes > 0),
  constraint streamer_withdrawal_requests_requested_minutes_limit check (requested_minutes <= 100000),
  constraint streamer_withdrawal_requests_status_check check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint streamer_withdrawal_requests_payment_note_length check (length(coalesce(payment_note, '')) <= 500),
  constraint streamer_withdrawal_requests_admin_note_length check (length(coalesce(admin_note, '')) <= 500)
);

create index if not exists streamer_withdrawal_requests_streamer_status_created_idx
on public.streamer_withdrawal_requests (streamer_id, status, created_at desc);

create index if not exists streamer_withdrawal_requests_status_created_idx
on public.streamer_withdrawal_requests (status, created_at desc);

create index if not exists streamer_withdrawal_requests_admin_created_idx
on public.streamer_withdrawal_requests (admin_id, created_at desc);

drop trigger if exists streamer_withdrawal_requests_set_updated_at on public.streamer_withdrawal_requests;
create trigger streamer_withdrawal_requests_set_updated_at
before update on public.streamer_withdrawal_requests
for each row
execute function public.set_updated_at();

alter table public.streamer_withdrawal_requests enable row level security;
grant select on table public.streamer_withdrawal_requests to authenticated;

drop policy if exists "streamer_withdrawal_requests_select_streamer" on public.streamer_withdrawal_requests;
create policy "streamer_withdrawal_requests_select_streamer"
on public.streamer_withdrawal_requests
for select
to authenticated
using (auth.uid() = streamer_id);

drop policy if exists "streamer_withdrawal_requests_select_admin_owner" on public.streamer_withdrawal_requests;
create policy "streamer_withdrawal_requests_select_admin_owner"
on public.streamer_withdrawal_requests
for select
to authenticated
using (public.current_user_role() in ('admin', 'owner'));

create or replace function public.create_streamer_withdrawal_request(
  p_requested_minutes integer,
  p_payment_note text default null
)
returns table (
  id uuid,
  streamer_id uuid,
  requested_minutes integer,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role public.app_role;
  v_is_banned boolean := false;
  v_requested_minutes integer;
  v_payment_note text;
  v_available_minutes integer := 0;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select profiles.role, coalesce(profiles.is_banned, false)
  into v_role, v_is_banned
  from public.profiles
  where profiles.id = v_actor_id;

  if v_role is null or v_role not in ('streamer', 'admin', 'owner') then
    raise exception 'FORBIDDEN';
  end if;

  if v_is_banned then
    raise exception 'BANNED';
  end if;

  v_requested_minutes := coalesce(p_requested_minutes, 0);
  if v_requested_minutes <= 0 or v_requested_minutes > 100000 then
    raise exception 'INVALID_AMOUNT';
  end if;

  if exists (
    select 1
    from public.streamer_withdrawal_requests
    where streamer_withdrawal_requests.streamer_id = v_actor_id
      and streamer_withdrawal_requests.status = 'pending'
  ) then
    raise exception 'PENDING_WITHDRAWAL_EXISTS';
  end if;

  select
    coalesce((
      select sum(se.net_minutes)::integer
      from public.streamer_earnings se
      where se.streamer_id = v_actor_id
        and se.source_type = 'private_room'
    ), 0)
    - coalesce((
      select sum(swr.requested_minutes)::integer
      from public.streamer_withdrawal_requests swr
      where swr.streamer_id = v_actor_id
        and swr.status in ('pending', 'approved')
    ), 0)
  into v_available_minutes;

  if v_available_minutes < v_requested_minutes then
    raise exception 'INSUFFICIENT_EARNINGS';
  end if;

  v_payment_note := nullif(trim(coalesce(p_payment_note, '')), '');

  return query
  insert into public.streamer_withdrawal_requests (streamer_id, requested_minutes, status, payment_note)
  values (v_actor_id, v_requested_minutes, 'pending', v_payment_note)
  returning
    streamer_withdrawal_requests.id,
    streamer_withdrawal_requests.streamer_id,
    streamer_withdrawal_requests.requested_minutes,
    streamer_withdrawal_requests.status,
    streamer_withdrawal_requests.created_at;

  begin
    perform public.write_admin_action_log(
      p_admin_id => v_actor_id,
      p_action_type => 'streamer_withdrawal_requested',
      p_description => 'Yayıncı çekim talebi oluşturdu',
      p_target_user_id => v_actor_id,
      p_metadata => jsonb_build_object(
        'requested_minutes',
        v_requested_minutes
      )
    );
  exception
    when others then
      null;
  end;
end;
$$;

revoke all on function public.create_streamer_withdrawal_request(integer, text) from public;
revoke all on function public.create_streamer_withdrawal_request(integer, text) from anon;
grant execute on function public.create_streamer_withdrawal_request(integer, text) to authenticated;

create or replace function public.decide_streamer_withdrawal_request(
  p_request_id uuid,
  p_decision text,
  p_admin_note text default null
)
returns table (
  id uuid,
  streamer_id uuid,
  requested_minutes integer,
  status text,
  decided_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role public.app_role;
  v_request public.streamer_withdrawal_requests%rowtype;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_admin_note text := nullif(trim(coalesce(p_admin_note, '')), '');
  v_log_action_type text;
  v_log_description text;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select profiles.role
  into v_actor_role
  from public.profiles
  where profiles.id = v_actor_id;

  if v_actor_role is null then
    raise exception 'FORBIDDEN';
  end if;

  if v_decision not in ('approved', 'rejected', 'cancelled') then
    raise exception 'INVALID_DECISION';
  end if;

  select *
  into v_request
  from public.streamer_withdrawal_requests
  where streamer_withdrawal_requests.id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'REQUEST_NOT_PENDING';
  end if;

  if v_decision in ('approved', 'rejected') and v_actor_role not in ('admin', 'owner') then
    raise exception 'FORBIDDEN';
  end if;

  if v_decision = 'cancelled' then
    if not (
      v_actor_role in ('admin', 'owner')
      or v_actor_id = v_request.streamer_id
    ) then
      raise exception 'FORBIDDEN';
    end if;
  end if;

  if v_decision = 'approved' then
    v_log_action_type := 'streamer_withdrawal_approved';
    v_log_description := 'Yayıncı çekim talebi onaylandı';
  elsif v_decision = 'rejected' then
    v_log_action_type := 'streamer_withdrawal_rejected';
    v_log_description := 'Yayıncı çekim talebi reddedildi';
  else
    v_log_action_type := 'streamer_withdrawal_cancelled';
    v_log_description := 'Yayıncı çekim talebi iptal edildi';
  end if;

  return query
  update public.streamer_withdrawal_requests
  set
    status = v_decision,
    admin_id = case when v_actor_role in ('admin', 'owner') then v_actor_id else null end,
    admin_note = v_admin_note,
    decided_at = now(),
    updated_at = now()
  where streamer_withdrawal_requests.id = v_request.id
  returning
    streamer_withdrawal_requests.id,
    streamer_withdrawal_requests.streamer_id,
    streamer_withdrawal_requests.requested_minutes,
    streamer_withdrawal_requests.status,
    streamer_withdrawal_requests.decided_at;

  begin
    perform public.write_admin_action_log(
      p_admin_id => v_actor_id,
      p_action_type => v_log_action_type,
      p_description => v_log_description,
      p_target_user_id => v_request.streamer_id,
      p_metadata => jsonb_build_object(
        'request_id',
        v_request.id,
        'requested_minutes',
        v_request.requested_minutes,
        'decision',
        v_decision
      )
    );
  exception
    when others then
      null;
  end;
end;
$$;

revoke all on function public.decide_streamer_withdrawal_request(uuid, text, text) from public;
revoke all on function public.decide_streamer_withdrawal_request(uuid, text, text) from anon;
grant execute on function public.decide_streamer_withdrawal_request(uuid, text, text) to authenticated;
