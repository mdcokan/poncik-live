create table if not exists public.wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallets_balance_non_negative check (balance >= 0)
);

alter table public.wallets enable row level security;

create policy "wallets_select_own"
on public.wallets
for select
to authenticated
using (auth.uid() = user_id);

create policy "wallets_insert_own"
on public.wallets
for insert
to authenticated
with check (auth.uid() = user_id);

create table if not exists public.gift_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  emoji text not null,
  price integer not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gift_catalog_code_not_blank check (length(trim(code)) > 0),
  constraint gift_catalog_name_not_blank check (length(trim(name)) > 0),
  constraint gift_catalog_price_positive check (price > 0)
);

alter table public.gift_catalog enable row level security;

create policy "gift_catalog_select_active"
on public.gift_catalog
for select
using (is_active = true);

insert into public.gift_catalog (code, name, emoji, price, sort_order, is_active)
values
  ('heart', 'Kalp', '💖', 5, 10, true),
  ('chocolate', 'Çikolata', '🍫', 10, 20, true),
  ('flower', 'Çiçek', '🌸', 20, 30, true),
  ('cake', 'Pasta', '🎂', 40, 40, true),
  ('champagne', 'Şampanya', '🍾', 80, 50, true),
  ('ring', 'Yüzük', '💍', 160, 60, true),
  ('car', 'Araba', '🚗', 320, 70, true)
on conflict (code) do update
set
  name = excluded.name,
  emoji = excluded.emoji,
  price = excluded.price,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

create table if not exists public.gift_transactions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  receiver_id uuid not null references auth.users (id) on delete cascade,
  gift_id uuid not null references public.gift_catalog (id) on delete restrict,
  amount integer not null,
  created_at timestamptz not null default now(),
  constraint gift_transactions_amount_positive check (amount > 0),
  constraint gift_transactions_sender_receiver_different check (sender_id <> receiver_id)
);

create index gift_transactions_room_created_idx
  on public.gift_transactions (room_id, created_at desc);

create index gift_transactions_sender_created_idx
  on public.gift_transactions (sender_id, created_at desc);

create index gift_transactions_receiver_created_idx
  on public.gift_transactions (receiver_id, created_at desc);

alter table public.gift_transactions enable row level security;

create policy "gift_transactions_select_sender"
on public.gift_transactions
for select
to authenticated
using (auth.uid() = sender_id);

create policy "gift_transactions_select_receiver"
on public.gift_transactions
for select
to authenticated
using (auth.uid() = receiver_id);

create policy "gift_transactions_select_room_owner"
on public.gift_transactions
for select
to authenticated
using (
  exists (
    select 1
    from public.rooms
    where rooms.id = gift_transactions.room_id
      and rooms.owner_id = auth.uid()
  )
);
