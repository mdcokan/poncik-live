-- RETURNS TABLE columns (id, session_id, …) are PL/pgSQL variables and shadow bare column names
-- in SQL (e.g. WHERE id = …). Qualify table columns and use (v_row).field for composites.

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
