create type public.room_status as enum ('offline', 'live', 'private');

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  status public.room_status not null default 'offline',
  is_private boolean not null default false,
  viewer_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint rooms_title_length check (char_length(title) between 3 and 80),
  constraint rooms_viewer_count_non_negative check (viewer_count >= 0)
);

create index rooms_owner_id_idx on public.rooms(owner_id);
create index rooms_status_idx on public.rooms(status);
create index rooms_created_at_idx on public.rooms(created_at desc);

create trigger rooms_set_updated_at
before update on public.rooms
for each row
execute function public.set_updated_at();

alter table public.rooms enable row level security;

grant usage on schema public to anon, authenticated;
grant usage on type public.room_status to anon, authenticated;

grant select on table public.rooms to anon, authenticated;
grant insert, update, delete on table public.rooms to authenticated;

create policy "rooms_select_public_live_or_owner"
on public.rooms
for select
to anon, authenticated
using (
  status = 'live'
  or owner_id = auth.uid()
);

create policy "rooms_insert_authenticated_owner"
on public.rooms
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_banned = false
  )
);

create policy "rooms_update_owner"
on public.rooms
for update
to authenticated
using (
  owner_id = auth.uid()
)
with check (
  owner_id = auth.uid()
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_banned = false
  )
);

create policy "rooms_delete_owner"
on public.rooms
for delete
to authenticated
using (
  owner_id = auth.uid()
);
