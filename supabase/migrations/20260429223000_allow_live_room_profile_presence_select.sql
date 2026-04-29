create policy "profiles_select_live_room_presence"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.room_presence as self_presence
    join public.room_presence as target_presence
      on target_presence.room_id = self_presence.room_id
    join public.rooms as r
      on r.id = self_presence.room_id
    where self_presence.user_id = auth.uid()
      and target_presence.user_id = profiles.id
      and r.status = 'live'
  )
);
