create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role::text
  from public.profiles
  where id = auth.uid()
  limit 1
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

drop policy if exists "wallet_adjustments_select_own_or_admin_owner" on public.wallet_adjustments;
create policy "wallet_adjustments_select_own_or_admin_owner"
on public.wallet_adjustments
for select
to authenticated
using (
  auth.uid() = user_id
  or public.current_user_role() in ('admin', 'owner')
);

drop policy if exists "wallets_select_admin_owner_all" on public.wallets;
create policy "wallets_select_admin_owner_all"
on public.wallets
for select
to authenticated
using (public.current_user_role() in ('admin', 'owner'));

drop policy if exists "gift_transactions_select_admin_owner_all" on public.gift_transactions;
create policy "gift_transactions_select_admin_owner_all"
on public.gift_transactions
for select
to authenticated
using (public.current_user_role() in ('admin', 'owner'));

drop policy if exists "profiles_select_admin_owner_all" on public.profiles;
create policy "profiles_select_admin_owner_all"
on public.profiles
for select
to authenticated
using (public.current_user_role() in ('admin', 'owner'));
