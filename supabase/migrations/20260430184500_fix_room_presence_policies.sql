drop policy if exists "room_presence_select_live_rooms" on public.room_presence;
drop policy if exists "room_presence_insert_self_live_room" on public.room_presence;
drop policy if exists "room_presence_update_self" on public.room_presence;
drop policy if exists "room_presence_delete_self" on public.room_presence;

create policy "room_presence_select_live_room_participants"
on public.room_presence
for select
to authenticated
using (
  exists (
    select 1
    from public.rooms r
    where r.id = room_presence.room_id
      and r.status = 'live'
  )
  and (
    room_presence.user_id = auth.uid()
    or exists (
      select 1
      from public.rooms owner_room
      where owner_room.id = room_presence.room_id
        and owner_room.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.room_presence self_presence
      where self_presence.room_id = room_presence.room_id
        and self_presence.user_id = auth.uid()
    )
    or public.current_user_role() in ('admin', 'owner')
  )
);

create policy "room_presence_insert_self_live_room_not_banned"
on public.room_presence
for insert
to authenticated
with check (
  room_presence.user_id = auth.uid()
  and exists (
    select 1
    from public.rooms r
    where r.id = room_presence.room_id
      and r.status = 'live'
  )
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_banned, false) = false
  )
);

create policy "room_presence_update_self_live_room_not_banned"
on public.room_presence
for update
to authenticated
using (
  room_presence.user_id = auth.uid()
)
with check (
  room_presence.user_id = auth.uid()
  and exists (
    select 1
    from public.rooms r
    where r.id = room_presence.room_id
      and r.status = 'live'
  )
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_banned, false) = false
  )
);

create policy "room_presence_delete_self_or_admin_owner"
on public.room_presence
for delete
to authenticated
using (
  room_presence.user_id = auth.uid()
  or public.current_user_role() in ('admin', 'owner')
);
