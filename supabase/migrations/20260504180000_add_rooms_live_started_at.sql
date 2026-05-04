alter table public.rooms
add column if not exists live_started_at timestamptz;

create index if not exists rooms_status_live_started_idx
on public.rooms (status, live_started_at desc);
