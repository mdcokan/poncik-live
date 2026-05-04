-- Align with other admin RPCs: do not expose admin-only RPCs to anon role.
-- Signature-safe: revokes for every overload that exists; no-op if a function is absent.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as fn_signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'admin_adjust_wallet',
        'admin_close_live_room'
      )
  loop
    execute format('revoke all on function %s from anon', fn.fn_signature);
  end loop;
end $$;
