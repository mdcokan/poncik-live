-- Direct messaging (DM): conversations + messages, RLS, realtime, RPCs.

create table public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  participant_a uuid not null references auth.users(id) on delete cascade,
  participant_b uuid not null references auth.users(id) on delete cascade,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dm_conversations_distinct_participants check (participant_a <> participant_b)
);

create unique index dm_conversations_unique_pair_idx
on public.dm_conversations (
  least(participant_a, participant_b),
  greatest(participant_a, participant_b)
);

create index dm_conversations_a_updated_idx on public.dm_conversations (participant_a, updated_at desc);
create index dm_conversations_b_updated_idx on public.dm_conversations (participant_b, updated_at desc);
create index dm_conversations_last_message_idx on public.dm_conversations (last_message_at desc nulls last);

drop trigger if exists dm_conversations_set_updated_at on public.dm_conversations;
create trigger dm_conversations_set_updated_at
before update on public.dm_conversations
for each row
execute function public.set_updated_at();

create table public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint dm_messages_distinct_participants check (sender_id <> receiver_id),
  constraint dm_messages_body_not_blank check (length(trim(body)) > 0),
  constraint dm_messages_body_max check (length(body) <= 1000)
);

create index dm_messages_conversation_created_idx on public.dm_messages (conversation_id, created_at desc);
create index dm_messages_receiver_read_idx on public.dm_messages (receiver_id, read_at, created_at desc);

alter table public.dm_conversations enable row level security;
alter table public.dm_messages enable row level security;

grant select on table public.dm_conversations to authenticated;
grant select on table public.dm_messages to authenticated;

create policy "dm_conversations_select_participant"
on public.dm_conversations
for select
to authenticated
using (auth.uid() = participant_a or auth.uid() = participant_b);

create policy "dm_messages_select_participant"
on public.dm_messages
for select
to authenticated
using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "profiles_select_dm_counterpart"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.dm_conversations c
    where
      (c.participant_a = auth.uid() and c.participant_b = profiles.id)
      or (c.participant_b = auth.uid() and c.participant_a = profiles.id)
  )
);

alter table public.dm_conversations replica identity full;
alter table public.dm_messages replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dm_conversations'
  ) then
    alter publication supabase_realtime add table public.dm_conversations;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dm_messages'
  ) then
    alter publication supabase_realtime add table public.dm_messages;
  end if;
end
$$;

create or replace function public.send_direct_message(p_receiver_id uuid, p_body text)
returns table (
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  receiver_id uuid,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_receiver_exists boolean;
  v_sender_banned boolean;
  v_receiver_banned boolean;
  v_a uuid;
  v_b uuid;
  v_conversation_id uuid;
  v_message public.dm_messages%rowtype;
begin
  if v_sender_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_receiver_id is null then
    raise exception 'RECEIVER_NOT_FOUND';
  end if;

  if v_sender_id = p_receiver_id then
    raise exception 'CANNOT_MESSAGE_SELF';
  end if;

  if length(v_body) = 0 then
    raise exception 'EMPTY_MESSAGE';
  end if;

  if length(v_body) > 1000 then
    raise exception 'MESSAGE_TOO_LONG';
  end if;

  select exists(select 1 from public.profiles pr where pr.id = p_receiver_id)
  into v_receiver_exists;

  if not v_receiver_exists then
    raise exception 'RECEIVER_NOT_FOUND';
  end if;

  select coalesce(pr.is_banned, false)
  into v_sender_banned
  from public.profiles pr
  where pr.id = v_sender_id;

  if v_sender_banned then
    raise exception 'BANNED';
  end if;

  select coalesce(pr.is_banned, false)
  into v_receiver_banned
  from public.profiles pr
  where pr.id = p_receiver_id;

  if v_receiver_banned then
    raise exception 'RECEIVER_UNAVAILABLE';
  end if;

  v_a := least(v_sender_id, p_receiver_id);
  v_b := greatest(v_sender_id, p_receiver_id);

  select c.id
  into v_conversation_id
  from public.dm_conversations c
  where least(c.participant_a, c.participant_b) = v_a
    and greatest(c.participant_a, c.participant_b) = v_b;

  if v_conversation_id is null then
    begin
      insert into public.dm_conversations (participant_a, participant_b, last_message_at)
      values (v_a, v_b, now())
      returning id into v_conversation_id;
    exception
      when unique_violation then
        select c2.id
        into v_conversation_id
        from public.dm_conversations c2
        where least(c2.participant_a, c2.participant_b) = v_a
          and greatest(c2.participant_a, c2.participant_b) = v_b;
    end;
  end if;

  insert into public.dm_messages (conversation_id, sender_id, receiver_id, body)
  values (v_conversation_id, v_sender_id, p_receiver_id, v_body)
  returning * into v_message;

  update public.dm_conversations
  set last_message_at = now()
  where id = v_conversation_id;

  return query
  select
    v_message.id as message_id,
    v_message.conversation_id as conversation_id,
    v_message.sender_id as sender_id,
    v_message.receiver_id as receiver_id,
    v_message.body as body,
    v_message.created_at as created_at;
end;
$$;

revoke all on function public.send_direct_message(uuid, text) from public;
revoke all on function public.send_direct_message(uuid, text) from anon;
grant execute on function public.send_direct_message(uuid, text) to authenticated;

create or replace function public.mark_dm_conversation_read(p_conversation_id uuid)
returns table (updated_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.dm_conversations c
    where c.id = p_conversation_id
      and (c.participant_a = v_uid or c.participant_b = v_uid)
  ) then
    raise exception 'CONVERSATION_NOT_FOUND';
  end if;

  update public.dm_messages m
  set read_at = now()
  where m.conversation_id = p_conversation_id
    and m.receiver_id = v_uid
    and m.read_at is null;

  get diagnostics v_n = row_count;
  return query select coalesce(v_n, 0)::integer as updated_count;
end;
$$;

revoke all on function public.mark_dm_conversation_read(uuid) from public;
revoke all on function public.mark_dm_conversation_read(uuid) from anon;
grant execute on function public.mark_dm_conversation_read(uuid) to authenticated;
