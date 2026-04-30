create table if not exists public.admin_action_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users (id) on delete restrict,
  target_user_id uuid references auth.users (id) on delete set null,
  target_room_id uuid references public.rooms (id) on delete set null,
  action_type text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (length(trim(action_type)) > 0),
  check (length(trim(description)) > 0),
  check (length(description) <= 500)
);

create index if not exists admin_action_logs_created_idx
on public.admin_action_logs (created_at desc);

create index if not exists admin_action_logs_admin_created_idx
on public.admin_action_logs (admin_id, created_at desc);

create index if not exists admin_action_logs_target_user_created_idx
on public.admin_action_logs (target_user_id, created_at desc);

create index if not exists admin_action_logs_target_room_created_idx
on public.admin_action_logs (target_room_id, created_at desc);

create index if not exists admin_action_logs_action_type_created_idx
on public.admin_action_logs (action_type, created_at desc);

alter table public.admin_action_logs enable row level security;

drop policy if exists "admin_action_logs_select_admin_owner" on public.admin_action_logs;
create policy "admin_action_logs_select_admin_owner"
on public.admin_action_logs
for select
to authenticated
using (public.current_user_role() in ('admin', 'owner'));

grant select on public.admin_action_logs to authenticated;

create or replace function public.write_admin_action_log(
  p_admin_id uuid,
  p_action_type text,
  p_description text,
  p_target_user_id uuid default null,
  p_target_room_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_log_id uuid;
begin
  if p_admin_id is null then
    raise exception 'BAD_REQUEST';
  end if;

  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if v_actor_id <> p_admin_id then
    raise exception 'FORBIDDEN';
  end if;

  if public.current_user_role() not in ('admin', 'owner') then
    raise exception 'FORBIDDEN';
  end if;

  if nullif(trim(coalesce(p_action_type, '')), '') is null then
    raise exception 'INVALID_ACTION_TYPE';
  end if;

  if nullif(trim(coalesce(p_description, '')), '') is null then
    raise exception 'INVALID_DESCRIPTION';
  end if;

  if not exists (select 1 from auth.users where id = p_admin_id) then
    raise exception 'ADMIN_NOT_FOUND';
  end if;

  insert into public.admin_action_logs (admin_id, target_user_id, target_room_id, action_type, description, metadata)
  values (
    p_admin_id,
    p_target_user_id,
    p_target_room_id,
    trim(p_action_type),
    trim(p_description),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

revoke all on function public.write_admin_action_log(uuid, text, text, uuid, uuid, jsonb) from public;
revoke all on function public.write_admin_action_log(uuid, text, text, uuid, uuid, jsonb) from anon;
revoke all on function public.write_admin_action_log(uuid, text, text, uuid, uuid, jsonb) from authenticated;

create or replace function public.admin_manage_profile(
  p_user_id uuid,
  p_action text,
  p_role text default null
)
returns table (
  user_id uuid,
  role public.app_role,
  is_banned boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role public.app_role;
  v_target_role public.app_role;
  v_next_role public.app_role;
  v_room_ids uuid[];
  v_log_action_type text;
  v_log_description text;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select profiles.role into v_actor_role
  from public.profiles
  where profiles.id = v_actor_id;

  if v_actor_role is null or v_actor_role not in ('admin', 'owner') then
    raise exception 'FORBIDDEN';
  end if;

  if p_user_id is null then
    raise exception 'BAD_REQUEST';
  end if;

  select profiles.role into v_target_role
  from public.profiles
  where profiles.id = p_user_id
  for update;

  if v_target_role is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  if v_target_role = 'owner' then
    raise exception 'TARGET_OWNER_PROTECTED';
  end if;

  if p_action = 'ban' then
    if p_user_id = v_actor_id then
      raise exception 'CANNOT_BAN_SELF';
    end if;

    perform set_config('app.bypass_profile_privilege_change', 'on', true);
    update public.profiles
    set is_banned = true,
        updated_at = now()
    where id = p_user_id;

    select coalesce(array_agg(id), '{}') into v_room_ids
    from public.rooms
    where owner_id = p_user_id
      and status = 'live';

    if coalesce(array_length(v_room_ids, 1), 0) > 0 then
      update public.rooms
      set status = 'offline',
          updated_at = now()
      where id = any(v_room_ids);

      delete from public.room_presence
      where room_id = any(v_room_ids);
    end if;

    v_log_action_type := 'user_banned';
    v_log_description := 'Kullanıcı banlandı';
  elsif p_action = 'unban' then
    perform set_config('app.bypass_profile_privilege_change', 'on', true);
    update public.profiles
    set is_banned = false,
        updated_at = now()
    where id = p_user_id;

    v_log_action_type := 'user_unbanned';
    v_log_description := 'Kullanıcı banı kaldırıldı';
  elsif p_action = 'set_role' then
    if p_user_id = v_actor_id then
      raise exception 'CANNOT_CHANGE_SELF_ROLE';
    end if;

    if p_role is null then
      raise exception 'INVALID_ROLE';
    end if;

    if p_role = 'viewer' then
      v_next_role := 'viewer';
    elsif p_role = 'streamer' then
      v_next_role := 'streamer';
    elsif p_role = 'admin' then
      v_next_role := 'admin';
    else
      raise exception 'INVALID_ROLE';
    end if;

    perform set_config('app.bypass_profile_privilege_change', 'on', true);
    update public.profiles
    set role = v_next_role,
        updated_at = now()
    where id = p_user_id;

    v_log_action_type := 'user_role_changed';
    v_log_description := 'Kullanıcı rolü güncellendi';
  else
    raise exception 'INVALID_ACTION';
  end if;

  begin
    perform public.write_admin_action_log(
      p_admin_id => v_actor_id,
      p_action_type => v_log_action_type,
      p_description => v_log_description,
      p_target_user_id => p_user_id,
      p_metadata => jsonb_build_object('role', p_role, 'action', p_action)
    );
  exception
    when others then
      null;
  end;

  return query
  select p.id, p.role, p.is_banned
  from public.profiles p
  where p.id = p_user_id;
end;
$$;

revoke all on function public.admin_manage_profile(uuid, text, text) from public;
revoke all on function public.admin_manage_profile(uuid, text, text) from anon;
grant execute on function public.admin_manage_profile(uuid, text, text) to authenticated;

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
  v_log_action_type text;
  v_log_description text;
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

  if p_amount > 0 then
    v_log_action_type := 'wallet_minutes_added';
    v_log_description := 'Manuel dakika eklendi';
  else
    v_log_action_type := 'wallet_minutes_removed';
    v_log_description := 'Manuel dakika düşüldü';
  end if;

  begin
    perform public.write_admin_action_log(
      p_admin_id => v_admin_id,
      p_action_type => v_log_action_type,
      p_description => v_log_description,
      p_target_user_id => p_user_id,
      p_metadata => jsonb_build_object('amount', p_amount, 'reason', p_reason, 'new_balance', v_wallet_balance)
    );
  exception
    when others then
      null;
  end;

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

revoke all on function public.admin_adjust_wallet(uuid, integer, text) from public;
grant execute on function public.admin_adjust_wallet(uuid, integer, text) to authenticated;

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
  v_log_action_type text;
  v_log_description text;
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

    v_log_action_type := 'minute_order_approved';
    v_log_description := 'Dakika satın alma talebi onaylandı';
  else
    v_log_action_type := 'minute_order_rejected';
    v_log_description := 'Dakika satın alma talebi reddedildi';
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

  begin
    perform public.write_admin_action_log(
      p_admin_id => v_admin_id,
      p_action_type => v_log_action_type,
      p_description => v_log_description,
      p_target_user_id => v_order.user_id,
      p_metadata => jsonb_build_object(
        'order_id',
        p_order_id,
        'amount',
        v_order.amount,
        'package_name',
        v_order.package_name,
        'decision',
        p_decision
      )
    );
  exception
    when others then
      null;
  end;

  return next;
end;
$$;

revoke all on function public.admin_decide_minute_purchase_order(uuid, text, text) from public;
grant execute on function public.admin_decide_minute_purchase_order(uuid, text, text) to authenticated;

drop function if exists public.admin_close_live_room(uuid);
create or replace function public.admin_close_live_room(p_room_id uuid, p_reason text default null)
returns table (
  id uuid,
  status public.room_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_is_banned boolean;
  v_owner_id uuid;
begin
  if v_actor_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select role, coalesce(is_banned, false)
  into v_actor_role, v_is_banned
  from public.profiles
  where profiles.id = v_actor_id;

  if v_actor_role is null or v_actor_role not in ('admin', 'owner') or v_is_banned then
    raise exception 'FORBIDDEN';
  end if;

  update public.rooms
  set
    status = 'offline',
    updated_at = now()
  where rooms.id = p_room_id
    and rooms.status = 'live'
  returning rooms.id, rooms.status, rooms.owner_id into id, status, v_owner_id;

  if not found then
    raise exception 'ROOM_NOT_LIVE';
  end if;

  return next;

  delete from public.room_presence
  where room_presence.room_id = p_room_id;

  begin
    perform public.write_admin_action_log(
      p_admin_id => v_actor_id,
      p_action_type => 'live_room_closed',
      p_description => 'Canlı yayın admin tarafından kapatıldı',
      p_target_user_id => v_owner_id,
      p_target_room_id => p_room_id,
      p_metadata => jsonb_build_object('reason', p_reason)
    );
  exception
    when others then
      null;
  end;
end;
$$;

revoke all on function public.admin_close_live_room(uuid, text) from public;
grant execute on function public.admin_close_live_room(uuid, text) to authenticated;
