create or replace function public.prevent_profile_privilege_change()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.bypass_profile_privilege_change', true) = 'on' then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Changing profile role directly is not allowed';
  end if;

  if new.is_banned is distinct from old.is_banned then
    raise exception 'Changing ban status directly is not allowed';
  end if;

  return new;
end;
$$;

create or replace function public.admin_manage_profile(
  p_user_id uuid,
  p_action text,
  p_role public.app_role default null
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
  v_room_ids uuid[];
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select role into v_actor_role
  from public.profiles
  where id = v_actor_id;

  if v_actor_role is null or v_actor_role not in ('admin', 'owner') then
    raise exception 'FORBIDDEN';
  end if;

  if p_user_id is null then
    raise exception 'BAD_REQUEST';
  end if;

  select role into v_target_role
  from public.profiles
  where id = p_user_id
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

    if p_role is null or p_role not in ('viewer', 'streamer', 'admin') then
      raise exception 'INVALID_ROLE';
    end if;

    perform set_config('app.bypass_profile_privilege_change', 'on', true);
    update public.profiles
    set role = p_role,
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

revoke all on function public.admin_manage_profile(uuid, text, public.app_role) from public;
revoke all on function public.admin_manage_profile(uuid, text, public.app_role) from anon;
grant execute on function public.admin_manage_profile(uuid, text, public.app_role) to authenticated;

drop policy if exists "room_messages_insert_sender_live_room" on public.room_messages;
create policy "room_messages_insert_sender_live_room"
on public.room_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.rooms
    where rooms.id = room_messages.room_id
      and rooms.status = 'live'
  )
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_banned = false
  )
);

drop policy if exists "room_presence_insert_self_live_room" on public.room_presence;
create policy "room_presence_insert_self_live_room"
on public.room_presence
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.rooms r
    where r.id = room_presence.room_id
      and r.status = 'live'
  )
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_banned = false
  )
);

drop policy if exists "room_presence_update_self" on public.room_presence;
create policy "room_presence_update_self"
on public.room_presence
for update
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_banned = false
  )
);
