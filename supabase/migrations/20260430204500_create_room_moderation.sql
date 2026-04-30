create table if not exists public.room_mutes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  muted_by uuid not null references auth.users(id) on delete restrict,
  reason text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (room_id, user_id)
);

create table if not exists public.room_bans (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  banned_by uuid not null references auth.users(id) on delete restrict,
  reason text,
  created_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create table if not exists public.room_kicks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kicked_by uuid not null references auth.users(id) on delete restrict,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists room_mutes_room_user_idx on public.room_mutes (room_id, user_id);
create index if not exists room_bans_room_user_idx on public.room_bans (room_id, user_id);
create index if not exists room_kicks_room_created_idx on public.room_kicks (room_id, created_at desc);
create index if not exists room_kicks_user_created_idx on public.room_kicks (user_id, created_at desc);

alter table public.room_mutes enable row level security;
alter table public.room_bans enable row level security;
alter table public.room_kicks enable row level security;

grant select on table public.room_mutes to authenticated;
grant select on table public.room_bans to authenticated;
grant select on table public.room_kicks to authenticated;

drop policy if exists "room_mutes_select_own_owner_admin" on public.room_mutes;
create policy "room_mutes_select_own_owner_admin"
on public.room_mutes
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.rooms r
    where r.id = room_mutes.room_id
      and r.owner_id = auth.uid()
  )
  or public.current_user_role() in ('admin', 'owner')
);

drop policy if exists "room_bans_select_own_owner_admin" on public.room_bans;
create policy "room_bans_select_own_owner_admin"
on public.room_bans
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.rooms r
    where r.id = room_bans.room_id
      and r.owner_id = auth.uid()
  )
  or public.current_user_role() in ('admin', 'owner')
);

drop policy if exists "room_kicks_select_own_owner_admin" on public.room_kicks;
create policy "room_kicks_select_own_owner_admin"
on public.room_kicks
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.rooms r
    where r.id = room_kicks.room_id
      and r.owner_id = auth.uid()
  )
  or public.current_user_role() in ('admin', 'owner')
);

alter table public.room_mutes replica identity full;
alter table public.room_bans replica identity full;
alter table public.room_kicks replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_mutes'
  ) then
    alter publication supabase_realtime add table public.room_mutes;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_bans'
  ) then
    alter publication supabase_realtime add table public.room_bans;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_kicks'
  ) then
    alter publication supabase_realtime add table public.room_kicks;
  end if;
end
$$;

create or replace function public.moderate_room_user(
  p_room_id uuid,
  p_target_user_id uuid,
  p_action text,
  p_reason text default null
)
returns table (
  ok boolean,
  action text,
  room_id uuid,
  target_user_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_room_owner_id uuid;
  v_room_status public.room_status;
  v_clean_action text := lower(trim(coalesce(p_action, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_target_in_room boolean;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_room_id is null or p_target_user_id is null then
    raise exception 'BAD_REQUEST';
  end if;

  select r.owner_id, r.status
  into v_room_owner_id, v_room_status
  from public.rooms r
  where r.id = p_room_id
  limit 1;

  if v_room_owner_id is null then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if v_room_status <> 'live' then
    raise exception 'ROOM_NOT_LIVE';
  end if;

  select public.current_user_role() into v_actor_role;
  if not (v_actor_role in ('admin', 'owner') or v_room_owner_id = v_actor_id) then
    raise exception 'FORBIDDEN';
  end if;

  if p_target_user_id = v_actor_id then
    raise exception 'CANNOT_MODERATE_SELF';
  end if;

  if p_target_user_id = v_room_owner_id then
    raise exception 'CANNOT_MODERATE_STREAMER';
  end if;

  if v_clean_action not in ('mute', 'unmute', 'kick', 'ban', 'unban') then
    raise exception 'INVALID_ACTION';
  end if;

  if v_clean_action in ('kick', 'ban') then
    select exists (
      select 1
      from public.room_presence rp
      where rp.room_id = p_room_id
        and rp.user_id = p_target_user_id
    ) into v_target_in_room;

    if not coalesce(v_target_in_room, false) then
      raise exception 'TARGET_NOT_IN_ROOM';
    end if;
  end if;

  if v_clean_action = 'mute' then
    insert into public.room_mutes (room_id, user_id, muted_by, reason, created_at)
    values (p_room_id, p_target_user_id, v_actor_id, v_reason, now())
    on conflict (room_id, user_id)
    do update set
      muted_by = excluded.muted_by,
      reason = excluded.reason,
      created_at = now(),
      expires_at = null;

    begin
      perform public.write_admin_action_log(
        p_admin_id => v_actor_id,
        p_action_type => 'room_user_muted',
        p_description => 'Odadaki kullanıcı susturuldu',
        p_target_user_id => p_target_user_id,
        p_target_room_id => p_room_id,
        p_metadata => jsonb_build_object('reason', v_reason)
      );
    exception
      when others then
        null;
    end;
  elsif v_clean_action = 'unmute' then
    delete from public.room_mutes
    where room_id = p_room_id
      and user_id = p_target_user_id;

    begin
      perform public.write_admin_action_log(
        p_admin_id => v_actor_id,
        p_action_type => 'room_user_unmuted',
        p_description => 'Odadaki kullanıcının susturması kaldırıldı',
        p_target_user_id => p_target_user_id,
        p_target_room_id => p_room_id,
        p_metadata => jsonb_build_object('reason', v_reason)
      );
    exception
      when others then
        null;
    end;
  elsif v_clean_action = 'kick' then
    insert into public.room_kicks (room_id, user_id, kicked_by, reason)
    values (p_room_id, p_target_user_id, v_actor_id, v_reason);

    delete from public.room_presence
    where room_id = p_room_id
      and user_id = p_target_user_id;

    begin
      perform public.write_admin_action_log(
        p_admin_id => v_actor_id,
        p_action_type => 'room_user_kicked',
        p_description => 'Odadaki kullanıcı odadan çıkarıldı',
        p_target_user_id => p_target_user_id,
        p_target_room_id => p_room_id,
        p_metadata => jsonb_build_object('reason', v_reason)
      );
    exception
      when others then
        null;
    end;
  elsif v_clean_action = 'ban' then
    insert into public.room_bans (room_id, user_id, banned_by, reason, created_at)
    values (p_room_id, p_target_user_id, v_actor_id, v_reason, now())
    on conflict (room_id, user_id)
    do update set
      banned_by = excluded.banned_by,
      reason = excluded.reason,
      created_at = now();

    delete from public.room_presence
    where room_id = p_room_id
      and user_id = p_target_user_id;

    begin
      perform public.write_admin_action_log(
        p_admin_id => v_actor_id,
        p_action_type => 'room_user_room_banned',
        p_description => 'Kullanıcıya oda banı uygulandı',
        p_target_user_id => p_target_user_id,
        p_target_room_id => p_room_id,
        p_metadata => jsonb_build_object('reason', v_reason)
      );
    exception
      when others then
        null;
    end;
  elsif v_clean_action = 'unban' then
    delete from public.room_bans
    where room_id = p_room_id
      and user_id = p_target_user_id;

    begin
      perform public.write_admin_action_log(
        p_admin_id => v_actor_id,
        p_action_type => 'room_user_room_unbanned',
        p_description => 'Kullanıcının oda banı kaldırıldı',
        p_target_user_id => p_target_user_id,
        p_target_room_id => p_room_id,
        p_metadata => jsonb_build_object('reason', v_reason)
      );
    exception
      when others then
        null;
    end;
  end if;

  return query
  select true, v_clean_action, p_room_id, p_target_user_id;
end;
$$;

revoke all on function public.moderate_room_user(uuid, uuid, text, text) from public;
revoke all on function public.moderate_room_user(uuid, uuid, text, text) from anon;
grant execute on function public.moderate_room_user(uuid, uuid, text, text) to authenticated;

drop policy if exists "room_messages_insert_sender_live_room" on public.room_messages;
create policy "room_messages_insert_sender_live_room"
on public.room_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.rooms r
    where r.id = room_messages.room_id
      and r.status = 'live'
  )
  and public.current_user_not_banned()
  and not exists (
    select 1
    from public.room_bans rb
    where rb.room_id = room_messages.room_id
      and rb.user_id = auth.uid()
  )
  and not exists (
    select 1
    from public.room_mutes rm
    where rm.room_id = room_messages.room_id
      and rm.user_id = auth.uid()
      and (rm.expires_at is null or rm.expires_at > now())
  )
);

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
  and not exists (
    select 1
    from public.room_bans rb
    where rb.room_id = room_presence.room_id
      and rb.user_id = auth.uid()
  )
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
  and not exists (
    select 1
    from public.room_bans rb
    where rb.room_id = room_presence.room_id
      and rb.user_id = auth.uid()
  )
);
