create type public.app_role as enum ('viewer', 'streamer', 'admin', 'owner');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  username text unique,
  avatar_url text,
  role public.app_role not null default 'viewer',
  is_banned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_username_length check (
    username is null or char_length(username) between 3 and 30
  ),
  constraint profiles_username_format check (
    username is null or username ~ '^[a-zA-Z0-9_]+$'
  )
);

create index profiles_role_idx on public.profiles(role);
create index profiles_is_banned_idx on public.profiles(is_banned);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create or replace function public.prevent_profile_privilege_change()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role then
    raise exception 'Changing profile role directly is not allowed';
  end if;

  if new.is_banned is distinct from old.is_banned then
    raise exception 'Changing ban status directly is not allowed';
  end if;

  return new;
end;
$$;

create trigger profiles_prevent_privilege_change
before update on public.profiles
for each row
execute function public.prevent_profile_privilege_change();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    )
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.profiles enable row level security;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "profiles_update_own_basic_fields"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "profiles_insert_disabled"
on public.profiles
for insert
to authenticated
with check (false);

create policy "profiles_delete_disabled"
on public.profiles
for delete
to authenticated
using (false);
