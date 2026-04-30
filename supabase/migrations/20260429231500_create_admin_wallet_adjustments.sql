create table if not exists public.wallet_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  admin_id uuid not null references auth.users (id) on delete restrict,
  amount integer not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint wallet_adjustments_amount_non_zero check (amount <> 0),
  constraint wallet_adjustments_reason_length check (length(coalesce(reason, '')) <= 300)
);

create index if not exists wallet_adjustments_user_created_idx
  on public.wallet_adjustments (user_id, created_at desc);

create index if not exists wallet_adjustments_admin_created_idx
  on public.wallet_adjustments (admin_id, created_at desc);

alter table public.wallet_adjustments enable row level security;

create policy "wallet_adjustments_select_own_or_admin_owner"
on public.wallet_adjustments
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'owner')
  )
);

create policy "wallets_select_admin_owner_all"
on public.wallets
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'owner')
  )
);

create policy "gift_transactions_select_admin_owner_all"
on public.gift_transactions
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role in ('admin', 'owner')
  )
);

create policy "profiles_select_admin_owner_all"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles as current_profile
    where current_profile.id = auth.uid()
      and current_profile.role in ('admin', 'owner')
  )
);

create or replace function public.admin_adjust_wallet(p_user_id uuid, p_amount integer, p_reason text default null)
returns table (
  adjustment_id uuid,
  user_id uuid,
  new_balance integer,
  amount integer,
  reason text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_wallet_balance integer;
  v_adjustment public.wallet_adjustments%rowtype;
begin
  if v_admin_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_admin_id
      and role in ('admin', 'owner')
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if p_amount = 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  if abs(p_amount) > 100000 then
    raise exception 'AMOUNT_TOO_LARGE';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;

  insert into public.wallets (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select balance
  into v_wallet_balance
  from public.wallets
  where user_id = p_user_id
  for update;

  if v_wallet_balance + p_amount < 0 then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  update public.wallets
  set
    balance = balance + p_amount,
    updated_at = now()
  where user_id = p_user_id
  returning balance into v_wallet_balance;

  insert into public.wallet_adjustments (user_id, admin_id, amount, reason)
  values (p_user_id, v_admin_id, p_amount, nullif(trim(coalesce(p_reason, '')), ''))
  returning * into v_adjustment;

  return query
  select
    v_adjustment.id as adjustment_id,
    v_adjustment.user_id as user_id,
    v_wallet_balance as new_balance,
    v_adjustment.amount as amount,
    v_adjustment.reason as reason,
    v_adjustment.created_at as created_at;
end;
$$;

grant select on public.wallet_adjustments to authenticated;
grant select on public.wallets to authenticated;
grant usage on schema public to authenticated;

revoke all on function public.admin_adjust_wallet(uuid, integer, text) from public;
grant execute on function public.admin_adjust_wallet(uuid, integer, text) to authenticated;
