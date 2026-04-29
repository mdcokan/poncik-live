create table public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint room_messages_body_not_blank check (length(trim(body)) > 0),
  constraint room_messages_body_max_500 check (length(body) <= 500)
);

create index room_messages_room_created_idx on public.room_messages(room_id, created_at desc);
create index room_messages_sender_created_idx on public.room_messages(sender_id, created_at desc);

alter table public.room_messages enable row level security;

grant select on table public.room_messages to authenticated;
grant insert on table public.room_messages to authenticated;

create policy "room_messages_select_live_rooms"
on public.room_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.rooms
    where rooms.id = room_messages.room_id
      and rooms.status = 'live'
  )
);

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
);

alter table public.room_messages replica identity full;
alter publication supabase_realtime add table public.room_messages;
