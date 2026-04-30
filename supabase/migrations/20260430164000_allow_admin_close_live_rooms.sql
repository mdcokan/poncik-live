create policy "rooms_update_admin_owner"
on public.rooms
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'owner')
      and coalesce(profiles.is_banned, false) = false
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'owner')
      and coalesce(profiles.is_banned, false) = false
  )
);

create policy "room_presence_delete_admin_owner"
on public.room_presence
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'owner')
      and coalesce(profiles.is_banned, false) = false
  )
);
