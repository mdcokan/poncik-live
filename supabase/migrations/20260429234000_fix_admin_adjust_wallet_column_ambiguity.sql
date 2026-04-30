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
  on conflict on constraint wallets_pkey do nothing;

  select wallets.balance
  into v_wallet_balance
  from public.wallets
  where wallets.user_id = p_user_id
  for update;

  if v_wallet_balance + p_amount < 0 then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  update public.wallets
  set
    balance = wallets.balance + p_amount,
    updated_at = now()
  where wallets.user_id = p_user_id
  returning wallets.balance into v_wallet_balance;

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
