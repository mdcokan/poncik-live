drop function if exists public.admin_manage_profile(uuid, text, public.app_role);

create or replace function public.admin_manage_profile(
  p_user_id uuid,
  p_action text,
  p_role text default null
)
returns table (
  user_id uuid,
  role public.app_role,
  is_banned boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role public.app_role;
  v_target_role public.app_role;
  v_next_role public.app_role;
  v_room_ids uuid[];
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select profiles.role into v_actor_role
  from public.profiles
  where profiles.id = v_actor_id;

  if v_actor_role is null or v_actor_role not in ('admin', 'owner') then
    raise exception 'FORBIDDEN';
  end if;

  if p_user_id is null then
    raise exception 'BAD_REQUEST';
  end if;

  select profiles.role into v_target_role
  from public.profiles
  where profiles.id = p_user_id
  for update;

  if v_target_role is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  if v_target_role = 'owner' then
    raise exception 'TARGET_OWNER_PROTECTED';
  end if;

  if p_action = 'ban' then
    if p_user_id = v_actor_id then
      raise exception 'CANNOT_BAN_SELF';
    end if;

    perform set_config('app.bypass_profile_privilege_change', 'on', true);
    update public.profiles
    set is_banned = true,
        updated_at = now()
    where id = p_user_id;

    select coalesce(array_agg(id), '{}') into v_room_ids
    from public.rooms
    where owner_id = p_user_id
      and status = 'live';

    if coalesce(array_length(v_room_ids, 1), 0) > 0 then
      update public.rooms
      set status = 'offline',
          updated_at = now()
      where id = any(v_room_ids);

      delete from public.room_presence
      where room_id = any(v_room_ids);
    end if;
  elsif p_action = 'unban' then
    perform set_config('app.bypass_profile_privilege_change', 'on', true);
    update public.profiles
    set is_banned = false,
        updated_at = now()
    where id = p_user_id;
  elsif p_action = 'set_role' then
    if p_user_id = v_actor_id then
      raise exception 'CANNOT_CHANGE_SELF_ROLE';
    end if;

    if p_role is null then
      raise exception 'INVALID_ROLE';
    end if;

    if p_role = 'viewer' then
      v_next_role := 'viewer';
    elsif p_role = 'streamer' then
      v_next_role := 'streamer';
    elsif p_role = 'admin' then
      v_next_role := 'admin';
    else
      raise exception 'INVALID_ROLE';
    end if;

    perform set_config('app.bypass_profile_privilege_change', 'on', true);
    update public.profiles
    set role = v_next_role,
        updated_at = now()
    where id = p_user_id;
  else
    raise exception 'INVALID_ACTION';
  end if;

  return query
  select p.id, p.role, p.is_banned
  from public.profiles p
  where p.id = p_user_id;
end;
$$;

revoke all on function public.admin_manage_profile(uuid, text, text) from public;
revoke all on function public.admin_manage_profile(uuid, text, text) from anon;
grant execute on function public.admin_manage_profile(uuid, text, text) to authenticated;
