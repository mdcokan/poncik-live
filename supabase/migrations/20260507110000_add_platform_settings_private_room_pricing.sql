create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

grant select on table public.platform_settings to authenticated;

drop policy if exists "platform_settings_select_admin_owner" on public.platform_settings;
create policy "platform_settings_select_admin_owner"
on public.platform_settings
for select
to authenticated
using (public.current_user_role() in ('admin', 'owner'));

drop policy if exists "platform_settings_modify_admin_owner" on public.platform_settings;
create policy "platform_settings_modify_admin_owner"
on public.platform_settings
for all
to authenticated
using (public.current_user_role() in ('admin', 'owner'))
with check (public.current_user_role() in ('admin', 'owner'));

insert into public.platform_settings(key, value)
values (
  'private_room_pricing',
  jsonb_build_object(
    'pricePerMinute',
    1,
    'streamerSharePercent',
    70
  )
)
on conflict (key) do nothing;

create or replace function public.get_private_room_pricing()
returns table (
  price_per_minute integer,
  streamer_share_percent integer
)
language sql
stable
security definer
set search_path = public
as $$
  with raw as (
    select value
    from public.platform_settings
    where key = 'private_room_pricing'
    limit 1
  )
  select
    greatest(
      1,
      coalesce(
        nullif((raw.value ->> 'pricePerMinute')::integer, null),
        1
      )
    ) as price_per_minute,
    least(
      100,
      greatest(
        0,
        coalesce(
          nullif((raw.value ->> 'streamerSharePercent')::integer, null),
          70
        )
      )
    ) as streamer_share_percent
  from raw
  union all
  select 1, 70
  where not exists (select 1 from raw)
  limit 1;
$$;

revoke all on function public.get_private_room_pricing() from public;
revoke all on function public.get_private_room_pricing() from anon;
grant execute on function public.get_private_room_pricing() to authenticated;

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
  v_minimum_required_balance integer := 1;
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

  select price_per_minute
  into v_minimum_required_balance
  from public.get_private_room_pricing();

  select coalesce(w.balance, 0)
  into v_wallet_balance
  from public.wallets w
  where w.user_id = v_viewer_id
  limit 1;

  if coalesce(v_wallet_balance, 0) < coalesce(v_minimum_required_balance, 1) then
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
  v_minimum_required_balance integer := 1;
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

  select price_per_minute
  into v_minimum_required_balance
  from public.get_private_room_pricing();

  select coalesce(balance, 0)
  into v_wallet_balance
  from public.wallets
  where user_id = v_request.viewer_id;

  if v_wallet_balance < coalesce(v_minimum_required_balance, 1) then
    raise exception 'INSUFFICIENT_MINUTES';
  end if;

  update public.private_room_requests
  set
    status = 'expired',
    streamer_note = 'Yayıncı özel görüşmeye geçti.',
    decided_at = now(),
    updated_at = now()
  where room_id = v_request.room_id
    and streamer_id = v_request.streamer_id
    and id <> v_request.id
    and status = 'pending';

  delete from public.room_presence
  where room_id = v_request.room_id
    and user_id not in (v_request.streamer_id, v_request.viewer_id);

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
end;
$$;

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
  v_duration_minutes integer := 0;
  v_charged_minutes integer := 0;
  v_platform_fee_minutes integer := 0;
  v_streamer_earned_minutes integer := 0;
  v_end_reason text := nullif(trim(coalesce(p_end_reason, '')), '');
  v_price_per_minute integer := 1;
  v_streamer_share_percent integer := 70;
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

  select price_per_minute, streamer_share_percent
  into v_price_per_minute, v_streamer_share_percent
  from public.get_private_room_pricing();

  v_duration_seconds := greatest(0, floor(extract(epoch from now() - v_session.started_at))::integer);
  v_duration_minutes := greatest(1, ceil(v_duration_seconds / 60.0)::integer);
  v_charged_minutes := least(
    v_duration_minutes * greatest(1, coalesce(v_price_per_minute, 1)),
    greatest(0, coalesce(v_wallet_balance, 0))
  );

  if v_charged_minutes > 0 then
    v_streamer_earned_minutes := floor(v_charged_minutes * least(100, greatest(0, coalesce(v_streamer_share_percent, 70))) / 100.0)::integer;
    v_platform_fee_minutes := v_charged_minutes - v_streamer_earned_minutes;

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
