grant usage on schema public to anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant usage on type public.app_role to authenticated;
