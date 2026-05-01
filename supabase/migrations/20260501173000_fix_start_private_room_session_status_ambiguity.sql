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

  select rooms.status
  into v_room_status
  from public.rooms
  where rooms.id = v_request.room_id;

  if v_room_status is distinct from 'live' then
    raise exception 'ROOM_NOT_LIVE';
  end if;

  select coalesce(profiles.is_banned, false)
  into v_is_viewer_banned
  from public.profiles
  where profiles.id = v_request.viewer_id;

  select coalesce(profiles.is_banned, false)
  into v_is_streamer_banned
  from public.profiles
  where profiles.id = v_request.streamer_id;

  if v_is_viewer_banned or v_is_streamer_banned then
    raise exception 'FORBIDDEN';
  end if;

  if exists (
    select 1
    from public.room_bans
    where room_bans.room_id = v_request.room_id
      and room_bans.user_id = v_request.viewer_id
  ) then
    raise exception 'FORBIDDEN';
  end if;

  select *
  into v_existing
  from public.private_room_sessions
  where private_room_sessions.request_id = p_request_id
    and private_room_sessions.status = 'active'
  order by private_room_sessions.started_at desc
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
    where private_room_sessions.viewer_id = v_request.viewer_id
      and private_room_sessions.status = 'active'
  ) then
    raise exception 'VIEWER_ALREADY_IN_PRIVATE_ROOM';
  end if;

  if exists (
    select 1
    from public.private_room_sessions
    where private_room_sessions.streamer_id = v_request.streamer_id
      and private_room_sessions.status = 'active'
  ) then
    raise exception 'STREAMER_ALREADY_IN_PRIVATE_ROOM';
  end if;

  select coalesce(wallets.balance, 0)
  into v_wallet_balance
  from public.wallets
  where wallets.user_id = v_request.viewer_id;

  if v_wallet_balance <= 0 then
    raise exception 'INSUFFICIENT_MINUTES';
  end if;

  begin
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
    returning *
    into v_existing;
  exception
    when unique_violation then
      select *
      into v_existing
      from public.private_room_sessions
      where private_room_sessions.request_id = p_request_id
        and private_room_sessions.status = 'active'
      order by private_room_sessions.started_at desc
      limit 1;

      if not found then
        select *
        into v_existing
        from public.private_room_sessions
        where (
          private_room_sessions.viewer_id = v_request.viewer_id
          or private_room_sessions.streamer_id = v_request.streamer_id
        )
          and private_room_sessions.status = 'active'
        order by private_room_sessions.started_at desc
        limit 1;
      end if;

      if not found then
        raise exception 'SESSION_EXISTS';
      end if;
  end;

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

  return query
  select
    v_existing.id,
    v_existing.request_id,
    v_existing.room_id,
    v_existing.streamer_id,
    v_existing.viewer_id,
    v_existing.status,
    v_existing.started_at;
end;
$$;
