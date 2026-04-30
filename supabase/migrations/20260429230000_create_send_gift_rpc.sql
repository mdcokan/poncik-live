alter table public.gift_transactions replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gift_transactions'
  ) then
    alter publication supabase_realtime add table public.gift_transactions;
  end if;
end $$;

create or replace function public.send_room_gift(p_room_id uuid, p_gift_id uuid)
returns table (
  transaction_id uuid,
  room_id uuid,
  gift_id uuid,
  gift_name text,
  gift_emoji text,
  amount integer,
  sender_balance integer,
  receiver_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid := auth.uid();
  v_room rooms%rowtype;
  v_gift gift_catalog%rowtype;
  v_sender_balance integer;
  v_transaction gift_transactions%rowtype;
begin
  if v_sender_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select *
  into v_room
  from public.rooms
  where id = p_room_id;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if v_room.status <> 'live' then
    raise exception 'ROOM_NOT_LIVE';
  end if;

  if v_sender_id = v_room.owner_id then
    raise exception 'CANNOT_GIFT_SELF';
  end if;

  select *
  into v_gift
  from public.gift_catalog
  where id = p_gift_id
    and is_active = true;

  if not found then
    raise exception 'GIFT_NOT_FOUND';
  end if;

  select balance
  into v_sender_balance
  from public.wallets
  where user_id = v_sender_id
  for update;

  if not found then
    insert into public.wallets (user_id, balance)
    values (v_sender_id, 0)
    returning balance into v_sender_balance;
  end if;

  if v_sender_balance < v_gift.price then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  update public.wallets
  set
    balance = balance - v_gift.price,
    updated_at = now()
  where user_id = v_sender_id
  returning balance into v_sender_balance;

  insert into public.gift_transactions (room_id, sender_id, receiver_id, gift_id, amount)
  values (v_room.id, v_sender_id, v_room.owner_id, v_gift.id, v_gift.price)
  returning * into v_transaction;

  return query
  select
    v_transaction.id as transaction_id,
    v_transaction.room_id as room_id,
    v_transaction.gift_id as gift_id,
    v_gift.name as gift_name,
    v_gift.emoji as gift_emoji,
    v_transaction.amount as amount,
    v_sender_balance as sender_balance,
    v_transaction.receiver_id as receiver_id;
end;
$$;

revoke all on function public.send_room_gift(uuid, uuid) from public;
grant execute on function public.send_room_gift(uuid, uuid) to authenticated;
