create table if not exists public.purchase_packages (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('minute', 'duration')),
  name text not null,
  amount integer not null check (amount > 0),
  price_try integer not null check (price_try >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists purchase_packages_sort_idx
on public.purchase_packages (sort_order asc, created_at desc);

drop trigger if exists purchase_packages_set_updated_at on public.purchase_packages;
create trigger purchase_packages_set_updated_at
before update on public.purchase_packages
for each row
execute function public.set_updated_at();

alter table public.purchase_packages enable row level security;

drop policy if exists "purchase_packages_select_active_or_admin_owner" on public.purchase_packages;
create policy "purchase_packages_select_active_or_admin_owner"
on public.purchase_packages
for select
to authenticated
using (
  is_active = true
  or public.current_user_role() in ('admin', 'owner')
);

drop policy if exists "purchase_packages_insert_admin_owner" on public.purchase_packages;
create policy "purchase_packages_insert_admin_owner"
on public.purchase_packages
for insert
to authenticated
with check (public.current_user_role() in ('admin', 'owner'));

drop policy if exists "purchase_packages_update_admin_owner" on public.purchase_packages;
create policy "purchase_packages_update_admin_owner"
on public.purchase_packages
for update
to authenticated
using (public.current_user_role() in ('admin', 'owner'))
with check (public.current_user_role() in ('admin', 'owner'));

drop policy if exists "purchase_packages_delete_admin_owner" on public.purchase_packages;
create policy "purchase_packages_delete_admin_owner"
on public.purchase_packages
for delete
to authenticated
using (public.current_user_role() in ('admin', 'owner'));

grant select, insert, update, delete on table public.purchase_packages to authenticated;
