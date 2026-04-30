create or replace function public.admin_close_live_room(p_room_id uuid)
returns table (
  id uuid,
  status public.room_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_is_banned boolean;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select role, coalesce(is_banned, false)
  into v_actor_role, v_is_banned
  from public.profiles
  where profiles.id = v_actor_id;

  if v_actor_role is null or v_actor_role not in ('admin', 'owner') or v_is_banned then
    raise exception 'FORBIDDEN';
  end if;

  return query
  update public.rooms
  set
    status = 'offline',
    updated_at = now()
  where rooms.id = p_room_id
    and rooms.status = 'live'
  returning rooms.id, rooms.status;

  if not found then
    raise exception 'ROOM_NOT_LIVE';
  end if;

  delete from public.room_presence
  where room_presence.room_id = p_room_id;
end;
$$;

revoke all on function public.admin_close_live_room(uuid) from public;
grant execute on function public.admin_close_live_room(uuid) to authenticated;
