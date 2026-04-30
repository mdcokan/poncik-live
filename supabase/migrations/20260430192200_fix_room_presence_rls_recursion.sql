drop policy if exists "room_presence_select_live_room_members" on public.room_presence;
drop policy if exists "room_presence_insert_own_live_room" on public.room_presence;
drop policy if exists "room_presence_update_own" on public.room_presence;
drop policy if exists "room_presence_delete_own_or_admin" on public.room_presence;

drop policy if exists "room_presence_select_live_rooms" on public.room_presence;
drop policy if exists "room_presence_insert_self_live_room" on public.room_presence;
drop policy if exists "room_presence_update_self" on public.room_presence;
drop policy if exists "room_presence_delete_self" on public.room_presence;
drop policy if exists "room_presence_select_live_room_participants" on public.room_presence;
drop policy if exists "room_presence_insert_self_live_room_not_banned" on public.room_presence;
drop policy if exists "room_presence_update_self_live_room_not_banned" on public.room_presence;
drop policy if exists "room_presence_delete_self_or_admin_owner" on public.room_presence;
drop policy if exists "room_presence_delete_admin_owner" on public.room_presence;

create policy "room_presence_select_authenticated_live_rooms"
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
);

create policy "room_presence_insert_own_live_not_banned"
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
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_banned, false) = false
  )
);

create policy "room_presence_update_own_not_banned"
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
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_banned, false) = false
  )
);

create policy "room_presence_delete_own_or_admin"
on public.room_presence
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_role() in ('admin', 'owner')
);
