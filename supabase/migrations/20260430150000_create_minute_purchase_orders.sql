create table if not exists public.minute_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  package_id uuid not null references public.purchase_packages (id) on delete restrict,
  package_name text not null,
  package_type text not null check (package_type in ('minute', 'duration')),
  amount integer not null check (amount > 0),
  price_try integer not null check (price_try >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_id uuid references auth.users (id) on delete set null,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists minute_purchase_orders_user_created_idx
on public.minute_purchase_orders (user_id, created_at desc);

create index if not exists minute_purchase_orders_status_created_idx
on public.minute_purchase_orders (status, created_at desc);

create index if not exists minute_purchase_orders_package_created_idx
on public.minute_purchase_orders (package_id, created_at desc);

alter table public.minute_purchase_orders enable row level security;

drop policy if exists "minute_purchase_orders_select_own" on public.minute_purchase_orders;
create policy "minute_purchase_orders_select_own"
on public.minute_purchase_orders
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "minute_purchase_orders_insert_own_pending" on public.minute_purchase_orders;
create policy "minute_purchase_orders_insert_own_pending"
on public.minute_purchase_orders
for insert
to authenticated
with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "minute_purchase_orders_select_admin_owner" on public.minute_purchase_orders;
create policy "minute_purchase_orders_select_admin_owner"
on public.minute_purchase_orders
for select
to authenticated
using (public.current_user_role() in ('admin', 'owner'));

drop policy if exists "minute_purchase_orders_update_admin_owner" on public.minute_purchase_orders;
create policy "minute_purchase_orders_update_admin_owner"
on public.minute_purchase_orders
for update
to authenticated
using (public.current_user_role() in ('admin', 'owner'))
with check (public.current_user_role() in ('admin', 'owner'));

grant select, insert, update on public.minute_purchase_orders to authenticated;

create or replace function public.admin_decide_minute_purchase_order(
  p_order_id uuid,
  p_decision text,
  p_admin_note text default null
)
returns table (
  order_id uuid,
  user_id uuid,
  status text,
  amount integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_order public.minute_purchase_orders%rowtype;
begin
  if v_admin_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if public.current_user_role() not in ('admin', 'owner') then
    raise exception 'FORBIDDEN';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'INVALID_DECISION';
  end if;

  select *
  into v_order
  from public.minute_purchase_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'ORDER_ALREADY_DECIDED';
  end if;

  if p_decision = 'approved' then
    insert into public.wallets (user_id, balance)
    values (v_order.user_id, 0)
    on conflict on constraint wallets_pkey do nothing;

    perform 1
    from public.wallets
    where wallets.user_id = v_order.user_id
    for update;

    update public.wallets
    set
      balance = wallets.balance + v_order.amount,
      updated_at = now()
    where wallets.user_id = v_order.user_id;

    insert into public.wallet_adjustments (user_id, admin_id, amount, reason)
    values (
      v_order.user_id,
      v_admin_id,
      v_order.amount,
      'Dakika paket onayi: ' || v_order.package_name
    );
  end if;

  update public.minute_purchase_orders
  set
    status = p_decision,
    admin_id = v_admin_id,
    admin_note = nullif(trim(coalesce(p_admin_note, '')), ''),
    decided_at = now(),
    updated_at = now()
  where id = v_order.id
  returning
    minute_purchase_orders.id,
    minute_purchase_orders.user_id,
    minute_purchase_orders.status,
    minute_purchase_orders.amount
  into order_id, user_id, status, amount;

  return next;
end;
$$;

revoke all on function public.admin_decide_minute_purchase_order(uuid, text, text) from public;
grant execute on function public.admin_decide_minute_purchase_order(uuid, text, text) to authenticated;
