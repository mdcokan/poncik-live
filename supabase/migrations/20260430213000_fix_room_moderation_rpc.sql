create or replace function public.moderate_room_user(
  p_room_id uuid,
  p_target_user_id uuid,
  p_action text,
  p_reason text default null
)
returns table (
  ok boolean,
  action text,
  room_id uuid,
  target_user_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_room public.rooms%rowtype;
  v_clean_action text := lower(trim(coalesce(p_action, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_target_in_room boolean := false;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_room_id is null or p_target_user_id is null then
    raise exception 'BAD_REQUEST';
  end if;

  select r.*
  into v_room
  from public.rooms as r
  where r.id = p_room_id
  limit 1;

  if v_room.id is null then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if v_room.status <> 'live' then
    raise exception 'ROOM_NOT_LIVE';
  end if;

  select public.current_user_role()
  into v_actor_role;

  if not (v_actor_role in ('admin', 'owner') or v_room.owner_id = v_actor_id) then
    raise exception 'FORBIDDEN';
  end if;

  if p_target_user_id = v_actor_id then
    raise exception 'CANNOT_MODERATE_SELF';
  end if;

  if p_target_user_id = v_room.owner_id then
    raise exception 'CANNOT_MODERATE_STREAMER';
  end if;

  if v_clean_action not in ('mute', 'unmute', 'kick', 'ban', 'unban') then
    raise exception 'INVALID_ACTION';
  end if;

  if v_clean_action in ('mute', 'kick', 'ban') then
    select exists (
      select 1
      from public.room_presence as rp
      where rp.room_id = p_room_id
        and rp.user_id = p_target_user_id
    )
    into v_target_in_room;

    if not coalesce(v_target_in_room, false) then
      raise exception 'TARGET_NOT_IN_ROOM';
    end if;
  end if;

  if v_clean_action = 'mute' then
    insert into public.room_mutes as rm (room_id, user_id, muted_by, reason, created_at)
    values (p_room_id, p_target_user_id, v_actor_id, v_reason, now())
    on conflict on constraint room_mutes_room_id_user_id_key
    do update set
      muted_by = excluded.muted_by,
      reason = excluded.reason,
      created_at = now(),
      expires_at = null;

    begin
      perform public.write_admin_action_log(
        p_admin_id => v_actor_id,
        p_action_type => 'room_user_muted',
        p_description => 'Odadaki kullanıcı susturuldu',
        p_target_user_id => p_target_user_id,
        p_target_room_id => p_room_id,
        p_metadata => jsonb_build_object('reason', v_reason)
      );
    exception
      when others then
        null;
    end;
  elsif v_clean_action = 'unmute' then
    delete from public.room_mutes as rm
    where rm.room_id = p_room_id
      and rm.user_id = p_target_user_id;

    begin
      perform public.write_admin_action_log(
        p_admin_id => v_actor_id,
        p_action_type => 'room_user_unmuted',
        p_description => 'Odadaki kullanıcının susturması kaldırıldı',
        p_target_user_id => p_target_user_id,
        p_target_room_id => p_room_id,
        p_metadata => jsonb_build_object('reason', v_reason)
      );
    exception
      when others then
        null;
    end;
  elsif v_clean_action = 'kick' then
    insert into public.room_kicks as rk (room_id, user_id, kicked_by, reason)
    values (p_room_id, p_target_user_id, v_actor_id, v_reason);

    delete from public.room_presence as rp
    where rp.room_id = p_room_id
      and rp.user_id = p_target_user_id;

    begin
      perform public.write_admin_action_log(
        p_admin_id => v_actor_id,
        p_action_type => 'room_user_kicked',
        p_description => 'Odadaki kullanıcı odadan çıkarıldı',
        p_target_user_id => p_target_user_id,
        p_target_room_id => p_room_id,
        p_metadata => jsonb_build_object('reason', v_reason)
      );
    exception
      when others then
        null;
    end;
  elsif v_clean_action = 'ban' then
    insert into public.room_bans as rb (room_id, user_id, banned_by, reason, created_at)
    values (p_room_id, p_target_user_id, v_actor_id, v_reason, now())
    on conflict on constraint room_bans_room_id_user_id_key
    do update set
      banned_by = excluded.banned_by,
      reason = excluded.reason,
      created_at = now();

    delete from public.room_presence as rp
    where rp.room_id = p_room_id
      and rp.user_id = p_target_user_id;

    begin
      perform public.write_admin_action_log(
        p_admin_id => v_actor_id,
        p_action_type => 'room_user_room_banned',
        p_description => 'Kullanıcıya oda banı uygulandı',
        p_target_user_id => p_target_user_id,
        p_target_room_id => p_room_id,
        p_metadata => jsonb_build_object('reason', v_reason)
      );
    exception
      when others then
        null;
    end;
  elsif v_clean_action = 'unban' then
    delete from public.room_bans as rb
    where rb.room_id = p_room_id
      and rb.user_id = p_target_user_id;

    begin
      perform public.write_admin_action_log(
        p_admin_id => v_actor_id,
        p_action_type => 'room_user_room_unbanned',
        p_description => 'Kullanıcının oda banı kaldırıldı',
        p_target_user_id => p_target_user_id,
        p_target_room_id => p_room_id,
        p_metadata => jsonb_build_object('reason', v_reason)
      );
    exception
      when others then
        null;
    end;
  end if;

  return query
  select true, v_clean_action, p_room_id, p_target_user_id;
end;
$$;
