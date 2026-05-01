create table if not exists public.private_room_signals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.private_room_sessions (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  receiver_id uuid not null references auth.users (id) on delete cascade,
  signal_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint private_room_signals_sender_receiver_diff check (sender_id <> receiver_id),
  constraint private_room_signals_type_check check (
    signal_type in ('offer', 'answer', 'ice_candidate', 'ready_ping', 'hangup')
  ),
  constraint private_room_signals_payload_object check (jsonb_typeof(payload) = 'object')
);

create index if not exists private_room_signals_session_created_idx
on public.private_room_signals (session_id, created_at desc);

create index if not exists private_room_signals_receiver_created_idx
on public.private_room_signals (receiver_id, created_at desc);

create index if not exists private_room_signals_session_receiver_created_idx
on public.private_room_signals (session_id, receiver_id, created_at desc);

alter table public.private_room_signals enable row level security;

grant select on table public.private_room_signals to authenticated;

drop policy if exists "private_room_signals_select_participants_active" on public.private_room_signals;
create policy "private_room_signals_select_participants_active"
on public.private_room_signals
for select
to authenticated
using (
  (auth.uid() = sender_id or auth.uid() = receiver_id)
  and exists (
    select 1
    from public.private_room_sessions prs
    where prs.id = private_room_signals.session_id
      and prs.status = 'active'
  )
);

alter table public.private_room_signals replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'private_room_signals'
  ) then
    alter publication supabase_realtime add table public.private_room_signals;
  end if;
end
$$;

create or replace function public.send_private_room_signal(
  p_session_id uuid,
  p_signal_type text,
  p_payload jsonb default '{}'::jsonb
)
returns table (
  id uuid,
  session_id uuid,
  sender_id uuid,
  receiver_id uuid,
  signal_type text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_session public.private_room_sessions%rowtype;
  v_receiver_id uuid;
  v_row public.private_room_signals%rowtype;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select *
  into v_session
  from public.private_room_sessions
  where private_room_sessions.id = p_session_id
  for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if v_session.status <> 'active' then
    raise exception 'SESSION_NOT_ACTIVE';
  end if;

  if v_actor_id = v_session.viewer_id then
    v_receiver_id := v_session.streamer_id;
  elsif v_actor_id = v_session.streamer_id then
    v_receiver_id := v_session.viewer_id;
  else
    raise exception 'FORBIDDEN';
  end if;

  if p_signal_type is null
    or p_signal_type not in ('offer', 'answer', 'ice_candidate', 'ready_ping', 'hangup') then
    raise exception 'INVALID_SIGNAL_TYPE';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'INVALID_PAYLOAD';
  end if;

  if length(p_payload::text) > 20000 then
    raise exception 'PAYLOAD_TOO_LARGE';
  end if;

  insert into public.private_room_signals (
    session_id,
    sender_id,
    receiver_id,
    signal_type,
    payload
  )
  values (
    p_session_id,
    v_actor_id,
    v_receiver_id,
    p_signal_type,
    p_payload
  )
  returning
    private_room_signals.id,
    private_room_signals.session_id,
    private_room_signals.sender_id,
    private_room_signals.receiver_id,
    private_room_signals.signal_type,
    private_room_signals.payload,
    private_room_signals.created_at,
    private_room_signals.read_at
  into v_row;

  return query
  select
    (v_row).id,
    (v_row).session_id,
    (v_row).sender_id,
    (v_row).receiver_id,
    (v_row).signal_type,
    (v_row).created_at;
end;
$$;

revoke all on function public.send_private_room_signal(uuid, text, jsonb) from public;
revoke all on function public.send_private_room_signal(uuid, text, jsonb) from anon;
grant execute on function public.send_private_room_signal(uuid, text, jsonb) to authenticated;
