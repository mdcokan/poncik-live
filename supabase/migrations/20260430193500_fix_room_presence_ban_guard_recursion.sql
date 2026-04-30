create or replace function public.current_user_not_banned()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(not p.is_banned, false)
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$$;

revoke all on function public.current_user_not_banned() from public;
grant execute on function public.current_user_not_banned() to authenticated;

drop policy if exists "room_presence_insert_own_live_not_banned" on public.room_presence;
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
  and public.current_user_not_banned()
);

drop policy if exists "room_presence_update_own_not_banned" on public.room_presence;
create policy "room_presence_update_own_not_banned"
on public.room_presence
for update
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
  and public.current_user_not_banned()
);
