alter table public.private_room_sessions
add column if not exists viewer_ready boolean not null default false,
add column if not exists streamer_ready boolean not null default false,
add column if not exists viewer_ready_at timestamptz,
add column if not exists streamer_ready_at timestamptz;

create or replace function public.set_private_room_ready(
  p_session_id uuid,
  p_ready boolean
)
returns table (
  session_id uuid,
  viewer_ready boolean,
  streamer_ready boolean,
  viewer_ready_at timestamptz,
  streamer_ready_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_session public.private_room_sessions%rowtype;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select *
  into v_session
  from public.private_room_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if v_session.status <> 'active' then
    raise exception 'SESSION_NOT_ACTIVE';
  end if;

  if v_actor_id = v_session.viewer_id then
    update public.private_room_sessions
    set
      viewer_ready = p_ready,
      viewer_ready_at = case when p_ready then now() else null end,
      updated_at = now()
    where id = v_session.id
    returning
      private_room_sessions.id,
      private_room_sessions.viewer_ready,
      private_room_sessions.streamer_ready,
      private_room_sessions.viewer_ready_at,
      private_room_sessions.streamer_ready_at
    into session_id, viewer_ready, streamer_ready, viewer_ready_at, streamer_ready_at;
  elsif v_actor_id = v_session.streamer_id then
    update public.private_room_sessions
    set
      streamer_ready = p_ready,
      streamer_ready_at = case when p_ready then now() else null end,
      updated_at = now()
    where id = v_session.id
    returning
      private_room_sessions.id,
      private_room_sessions.viewer_ready,
      private_room_sessions.streamer_ready,
      private_room_sessions.viewer_ready_at,
      private_room_sessions.streamer_ready_at
    into session_id, viewer_ready, streamer_ready, viewer_ready_at, streamer_ready_at;
  else
    raise exception 'FORBIDDEN';
  end if;

  return next;
end;
$$;

revoke all on function public.set_private_room_ready(uuid, boolean) from public;
revoke all on function public.set_private_room_ready(uuid, boolean) from anon;
grant execute on function public.set_private_room_ready(uuid, boolean) to authenticated;
