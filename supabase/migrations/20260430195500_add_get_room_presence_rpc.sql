create or replace function public.get_room_presence(p_room_id uuid, p_limit integer default 100)
returns table (
  user_id uuid,
  display_name text,
  role text,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_uid uuid;
  v_room_status text;
  v_limit integer;
begin
  v_auth_uid := auth.uid();
  if v_auth_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_room_id is null then
    raise exception 'ROOM_ID_REQUIRED';
  end if;

  if not public.current_user_not_banned() then
    raise exception 'FORBIDDEN';
  end if;

  select r.status
  into v_room_status
  from public.rooms r
  where r.id = p_room_id
  limit 1;

  if v_room_status is null then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if v_room_status <> 'live' then
    raise exception 'ROOM_NOT_LIVE';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 100), 100));

  return query
  select
    rp.user_id,
    nullif(trim(p.display_name), '') as display_name,
    rp.role,
    rp.last_seen_at
  from public.room_presence rp
  join public.profiles p
    on p.id = rp.user_id
  where rp.room_id = p_room_id
  order by rp.last_seen_at desc
  limit v_limit;
end;
$$;

revoke all on function public.get_room_presence(uuid, integer) from public;
grant execute on function public.get_room_presence(uuid, integer) to authenticated;
