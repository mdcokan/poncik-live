-- Align with other admin RPCs: do not expose admin-only RPCs to anon role.
revoke all on function public.admin_adjust_wallet(uuid, integer, text) from anon;
revoke all on function public.admin_close_live_room(uuid) from anon;
