create table if not exists public.private_room_sessions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.private_room_requests (id) on delete restrict,
  room_id uuid not null references public.rooms (id) on delete restrict,
  streamer_id uuid not null references auth.users (id) on delete restrict,
  viewer_id uuid not null references auth.users (id) on delete restrict,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer not null default 0,
  charged_minutes integer not null default 0,
  viewer_spent_minutes integer not null default 0,
  streamer_earned_minutes integer not null default 0,
  platform_fee_minutes integer not null default 0,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_room_sessions_status_check check (status in ('active', 'ended', 'cancelled')),
  constraint private_room_sessions_duration_non_negative check (duration_seconds >= 0),
  constraint private_room_sessions_charged_non_negative check (charged_minutes >= 0),
  constraint private_room_sessions_viewer_spent_non_negative check (viewer_spent_minutes >= 0),
  constraint private_room_sessions_streamer_earned_non_negative check (streamer_earned_minutes >= 0),
  constraint private_room_sessions_platform_fee_non_negative check (platform_fee_minutes >= 0),
  constraint private_room_sessions_viewer_streamer_diff check (viewer_id <> streamer_id),
  constraint private_room_sessions_end_reason_length check (length(coalesce(end_reason, '')) <= 300)
);

create index if not exists private_room_sessions_request_idx
on public.private_room_sessions (request_id);

create index if not exists private_room_sessions_streamer_status_started_idx
on public.private_room_sessions (streamer_id, status, started_at desc);

create index if not exists private_room_sessions_viewer_status_started_idx
on public.private_room_sessions (viewer_id, status, started_at desc);

create index if not exists private_room_sessions_room_status_started_idx
on public.private_room_sessions (room_id, status, started_at desc);

create unique index if not exists private_room_sessions_one_active_viewer_idx
on public.private_room_sessions (viewer_id)
where status = 'active';

create unique index if not exists private_room_sessions_one_active_streamer_idx
on public.private_room_sessions (streamer_id)
where status = 'active';

drop trigger if exists private_room_sessions_set_updated_at on public.private_room_sessions;
create trigger private_room_sessions_set_updated_at
before update on public.private_room_sessions
for each row
execute function public.set_updated_at();

alter table public.private_room_sessions enable row level security;
grant select on table public.private_room_sessions to authenticated;

drop policy if exists "private_room_sessions_select_viewer" on public.private_room_sessions;
create policy "private_room_sessions_select_viewer"
on public.private_room_sessions
for select
to authenticated
using (auth.uid() = viewer_id);

drop policy if exists "private_room_sessions_select_streamer" on public.private_room_sessions;
create policy "private_room_sessions_select_streamer"
on public.private_room_sessions
for select
to authenticated
using (auth.uid() = streamer_id);

drop policy if exists "private_room_sessions_select_admin_owner" on public.private_room_sessions;
create policy "private_room_sessions_select_admin_owner"
on public.private_room_sessions
for select
to authenticated
using (public.current_user_role() in ('admin', 'owner'));

alter table public.private_room_sessions replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'private_room_sessions'
  ) then
    alter publication supabase_realtime add table public.private_room_sessions;
  end if;
end
$$;

create table if not exists public.streamer_earnings (
  id uuid primary key default gen_random_uuid(),
  streamer_id uuid not null references auth.users (id) on delete restrict,
  source_type text not null,
  source_id uuid not null,
  gross_minutes integer not null default 0,
  platform_fee_minutes integer not null default 0,
  net_minutes integer not null default 0,
  created_at timestamptz not null default now(),
  constraint streamer_earnings_source_type_check check (source_type in ('gift', 'private_room')),
  constraint streamer_earnings_gross_non_negative check (gross_minutes >= 0),
  constraint streamer_earnings_platform_fee_non_negative check (platform_fee_minutes >= 0),
  constraint streamer_earnings_net_non_negative check (net_minutes >= 0)
);

create index if not exists streamer_earnings_streamer_created_idx
on public.streamer_earnings (streamer_id, created_at desc);

create index if not exists streamer_earnings_source_idx
on public.streamer_earnings (source_type, source_id);

alter table public.streamer_earnings enable row level security;
grant select on table public.streamer_earnings to authenticated;

drop policy if exists "streamer_earnings_select_streamer" on public.streamer_earnings;
create policy "streamer_earnings_select_streamer"
on public.streamer_earnings
for select
to authenticated
using (auth.uid() = streamer_id);

drop policy if exists "streamer_earnings_select_admin_owner" on public.streamer_earnings;
create policy "streamer_earnings_select_admin_owner"
on public.streamer_earnings
for select
to authenticated
using (public.current_user_role() in ('admin', 'owner'));

create or replace function public.start_private_room_session(p_request_id uuid)
returns table (
  session_id uuid,
  request_id uuid,
  room_id uuid,
  streamer_id uuid,
  viewer_id uuid,
  status text,
  started_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.private_room_requests%rowtype;
  v_existing public.private_room_sessions%rowtype;
  v_room_status public.room_status;
  v_wallet_balance integer := 0;
  v_actor_role text;
  v_can_manage boolean := false;
  v_is_viewer_banned boolean := false;
  v_is_streamer_banned boolean := false;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select public.current_user_role() into v_actor_role;
  v_can_manage := v_actor_role in ('admin', 'owner');

  select *
  into v_request
  from public.private_room_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  if v_request.status <> 'accepted' then
    raise exception 'REQUEST_NOT_ACCEPTED';
  end if;

  if not (
    v_actor_id = v_request.streamer_id
    or v_actor_id = v_request.viewer_id
    or v_can_manage
  ) then
    raise exception 'FORBIDDEN';
  end if;

  select status
  into v_room_status
  from public.rooms
  where id = v_request.room_id;

  if v_room_status is distinct from 'live' then
    raise exception 'ROOM_NOT_LIVE';
  end if;

  select coalesce(is_banned, false)
  into v_is_viewer_banned
  from public.profiles
  where id = v_request.viewer_id;

  select coalesce(is_banned, false)
  into v_is_streamer_banned
  from public.profiles
  where id = v_request.streamer_id;

  if v_is_viewer_banned or v_is_streamer_banned then
    raise exception 'FORBIDDEN';
  end if;

  if exists (
    select 1
    from public.room_bans
    where room_id = v_request.room_id
      and user_id = v_request.viewer_id
  ) then
    raise exception 'FORBIDDEN';
  end if;

  select *
  into v_existing
  from public.private_room_sessions
  where request_id = p_request_id
    and status = 'active'
  order by started_at desc
  limit 1;

  if found then
    return query
    select
      v_existing.id,
      v_existing.request_id,
      v_existing.room_id,
      v_existing.streamer_id,
      v_existing.viewer_id,
      v_existing.status,
      v_existing.started_at;
    return;
  end if;

  if exists (
    select 1
    from public.private_room_sessions
    where request_id = p_request_id
  ) then
    raise exception 'SESSION_EXISTS';
  end if;

  if exists (
    select 1
    from public.private_room_sessions
    where viewer_id = v_request.viewer_id
      and status = 'active'
  ) then
    raise exception 'VIEWER_ALREADY_IN_PRIVATE_ROOM';
  end if;

  if exists (
    select 1
    from public.private_room_sessions
    where streamer_id = v_request.streamer_id
      and status = 'active'
  ) then
    raise exception 'STREAMER_ALREADY_IN_PRIVATE_ROOM';
  end if;

  select coalesce(balance, 0)
  into v_wallet_balance
  from public.wallets
  where user_id = v_request.viewer_id;

  if v_wallet_balance <= 0 then
    raise exception 'INSUFFICIENT_MINUTES';
  end if;

  return query
  insert into public.private_room_sessions (
    request_id,
    room_id,
    streamer_id,
    viewer_id,
    status
  )
  values (
    v_request.id,
    v_request.room_id,
    v_request.streamer_id,
    v_request.viewer_id,
    'active'
  )
  returning
    private_room_sessions.id,
    private_room_sessions.request_id,
    private_room_sessions.room_id,
    private_room_sessions.streamer_id,
    private_room_sessions.viewer_id,
    private_room_sessions.status,
    private_room_sessions.started_at;

  begin
    perform public.write_admin_action_log(
      p_admin_id => v_actor_id,
      p_action_type => 'private_session_started',
      p_description => 'Özel oda session başlatıldı',
      p_target_user_id => v_request.viewer_id,
      p_target_room_id => v_request.room_id,
      p_metadata => jsonb_build_object('request_id', p_request_id)
    );
  exception
    when others then
      null;
  end;
end;
$$;

revoke all on function public.start_private_room_session(uuid) from public;
revoke all on function public.start_private_room_session(uuid) from anon;
grant execute on function public.start_private_room_session(uuid) to authenticated;

create or replace function public.end_private_room_session(
  p_session_id uuid,
  p_end_reason text default null
)
returns table (
  session_id uuid,
  status text,
  duration_seconds integer,
  charged_minutes integer,
  viewer_spent_minutes integer,
  streamer_earned_minutes integer,
  platform_fee_minutes integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_can_manage boolean := false;
  v_session public.private_room_sessions%rowtype;
  v_wallet_balance integer := 0;
  v_duration_seconds integer := 0;
  v_calculated_minutes integer := 0;
  v_charged_minutes integer := 0;
  v_platform_fee_minutes integer := 0;
  v_streamer_earned_minutes integer := 0;
  v_end_reason text := nullif(trim(coalesce(p_end_reason, '')), '');
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select public.current_user_role() into v_actor_role;
  v_can_manage := v_actor_role in ('admin', 'owner');

  select *
  into v_session
  from public.private_room_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if v_session.status <> 'active' then
    raise exception 'SESSION_NOT_ACTIVE';
  end if;

  if not (
    v_actor_id = v_session.streamer_id
    or v_actor_id = v_session.viewer_id
    or v_can_manage
  ) then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.wallets (user_id, balance)
  values (v_session.viewer_id, 0)
  on conflict on constraint wallets_pkey do nothing;

  select balance
  into v_wallet_balance
  from public.wallets
  where user_id = v_session.viewer_id
  for update;

  v_duration_seconds := greatest(0, floor(extract(epoch from now() - v_session.started_at))::integer);
  v_calculated_minutes := greatest(1, ceil(v_duration_seconds / 60.0)::integer);
  v_charged_minutes := least(v_calculated_minutes, greatest(0, coalesce(v_wallet_balance, 0)));

  if v_charged_minutes > 0 then
    v_platform_fee_minutes := floor(v_charged_minutes * 0.30)::integer;
    v_streamer_earned_minutes := v_charged_minutes - v_platform_fee_minutes;

    update public.wallets
    set
      balance = wallets.balance - v_charged_minutes,
      updated_at = now()
    where wallets.user_id = v_session.viewer_id;

    insert into public.streamer_earnings (
      streamer_id,
      source_type,
      source_id,
      gross_minutes,
      platform_fee_minutes,
      net_minutes
    )
    values (
      v_session.streamer_id,
      'private_room',
      v_session.id,
      v_charged_minutes,
      v_platform_fee_minutes,
      v_streamer_earned_minutes
    );
  end if;

  update public.private_room_sessions
  set
    status = 'ended',
    ended_at = now(),
    duration_seconds = v_duration_seconds,
    charged_minutes = v_charged_minutes,
    viewer_spent_minutes = v_charged_minutes,
    streamer_earned_minutes = v_streamer_earned_minutes,
    platform_fee_minutes = v_platform_fee_minutes,
    end_reason = v_end_reason,
    updated_at = now()
  where private_room_sessions.id = v_session.id;

  begin
    perform public.write_admin_action_log(
      p_admin_id => v_actor_id,
      p_action_type => 'private_session_ended',
      p_description => 'Özel oda session kapatıldı',
      p_target_user_id => v_session.viewer_id,
      p_target_room_id => v_session.room_id,
      p_metadata => jsonb_build_object(
        'session_id',
        v_session.id,
        'duration_seconds',
        v_duration_seconds,
        'charged_minutes',
        v_charged_minutes,
        'platform_fee_minutes',
        v_platform_fee_minutes,
        'streamer_earned_minutes',
        v_streamer_earned_minutes
      )
    );
  exception
    when others then
      null;
  end;

  return query
  select
    v_session.id,
    'ended'::text,
    v_duration_seconds,
    v_charged_minutes,
    v_charged_minutes,
    v_streamer_earned_minutes,
    v_platform_fee_minutes;
end;
$$;

revoke all on function public.end_private_room_session(uuid, text) from public;
revoke all on function public.end_private_room_session(uuid, text) from anon;
grant execute on function public.end_private_room_session(uuid, text) to authenticated;
