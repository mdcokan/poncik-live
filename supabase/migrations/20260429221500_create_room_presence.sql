create table public.room_presence (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'viewer',
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint room_presence_room_user_unique unique (room_id, user_id),
  constraint room_presence_role_check check (role in ('viewer', 'streamer', 'admin'))
);

create index room_presence_room_last_seen_idx on public.room_presence(room_id, last_seen_at desc);
create index room_presence_user_idx on public.room_presence(user_id);

alter table public.room_presence enable row level security;

grant select, insert, update, delete on table public.room_presence to authenticated;

create policy "room_presence_select_live_rooms"
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
);

create policy "room_presence_update_self"
on public.room_presence
for update
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
);

create policy "room_presence_delete_self"
on public.room_presence
for delete
to authenticated
using (
  user_id = auth.uid()
);

alter table public.room_presence replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_presence'
  ) then
    alter publication supabase_realtime add table public.room_presence;
  end if;
end
$$;
