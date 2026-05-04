-- Use DB clock when a room becomes live so room_messages.created_at (server time)
-- is never incorrectly filtered out due to client clock skew.

create or replace function public.rooms_set_live_started_at_on_go_live()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'live' then
    if tg_op = 'INSERT' then
      new.live_started_at := now();
    elsif tg_op = 'UPDATE' and old.status is distinct from 'live' then
      new.live_started_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists rooms_set_live_started_at_on_go_live on public.rooms;

create trigger rooms_set_live_started_at_on_go_live
before insert or update on public.rooms
for each row
execute function public.rooms_set_live_started_at_on_go_live();
