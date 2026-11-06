-- Migration: 202610260004_cable_tv_configs_and_packages.sql
-- Description: Cable TV configurations, bouquets catalogue, RLS, and customer_start_service_purchase_v2

-- 1. Cable TV Configurations Table
create table if not exists public.cable_tv_configs (
  operator_code text primary key check (operator_code in ('dstv', 'gotv', 'startimes', 'showmax')),
  operator_name text not null,
  primary_provider text not null default 'vtpass',
  fallback_provider text default 'maskawasub',
  convenience_fee numeric(10, 2) not null default 0.00,
  cashback_percentage numeric(5, 2) not null default 1.00,
  is_active boolean not null default true,
  maintenance_notice text,
  updated_at timestamptz not null default now()
);

-- Seed TV Operators
insert into public.cable_tv_configs (operator_code, operator_name, primary_provider, fallback_provider, convenience_fee, cashback_percentage, is_active)
values
  ('dstv', 'DStv (MultiChoice)', 'vtpass', 'maskawasub', 0.00, 1.00, true),
  ('gotv', 'GOtv (MultiChoice)', 'vtpass', 'maskawasub', 0.00, 1.00, true),
  ('startimes', 'StarTimes', 'vtpass', 'maskawasub', 0.00, 1.00, true),
  ('showmax', 'Showmax Streaming', 'vtpass', 'maskawasub', 0.00, 1.00, true)
on conflict (operator_code) do update set
  operator_name = excluded.operator_name;

-- 2. Cable TV Packages / Bouquets Catalogue
create table if not exists public.cable_tv_packages (
  id uuid primary key default gen_random_uuid(),
  operator_code text not null references public.cable_tv_configs(operator_code) on delete cascade,
  package_code text not null,
  name text not null,
  price numeric(10, 2) not null,
  duration_months int not null default 1,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cable_tv_packages_operator_pkg unique (operator_code, package_code)
);

create index if not exists idx_cable_tv_packages_operator 
  on public.cable_tv_packages(operator_code, is_active, sort_order asc);

-- Seed Official Nigerian Bouquets
insert into public.cable_tv_packages (operator_code, package_code, name, price, duration_months, is_active, sort_order)
values
  -- DStv
  ('dstv', 'dstv-padi', 'DStv Padi', 4400.00, 1, true, 1),
  ('dstv', 'dstv-yanga', 'DStv Yanga', 6000.00, 1, true, 2),
  ('dstv', 'dstv-confam', 'DStv Confam', 11000.00, 1, true, 3),
  ('dstv', 'dstv79', 'DStv Compact', 19000.00, 1, true, 4),
  ('dstv', 'dstv7', 'DStv Compact Plus', 30000.00, 1, true, 5),
  ('dstv', 'dstv3', 'DStv Premium', 44500.00, 1, true, 6),
  ('dstv', 'dstv-greatwall', 'DStv Great Wall Standalone', 3800.00, 1, true, 7),
  ('dstv', 'dstv10', 'DStv Premium-Asia', 50500.00, 1, true, 8),
  ('dstv', 'dstv9', 'DStv Premium-French', 69000.00, 1, true, 9),
  ('dstv', 'dstv-yanga-showmax', 'DStv Yanga + Showmax', 8250.00, 1, true, 10),
  ('dstv', 'dstv-confam-showmax', 'DStv Confam + Showmax', 13250.00, 1, true, 11),
  ('dstv', 'dstv-compact-showmax', 'DStv Compact + Showmax', 21250.00, 1, true, 12),
  ('dstv', 'dstv-compact-plus-showmax', 'DStv Compact Plus + Showmax', 32250.00, 1, true, 13),
  ('dstv', 'dstv-premium-showmax', 'DStv Premium + Showmax', 44500.00, 1, true, 14),

  -- GOtv
  ('gotv', 'gotv-smallie', 'GOtv Smallie (Monthly)', 1900.00, 1, true, 1),
  ('gotv', 'gotv-smallie-3months', 'GOtv Smallie (Quarterly)', 5100.00, 3, true, 2),
  ('gotv', 'gotv-smallie-1year', 'GOtv Smallie (Annual)', 15000.00, 12, true, 3),
  ('gotv', 'gotv-jinja', 'GOtv Jinja', 3900.00, 1, true, 4),
  ('gotv', 'gotv-jolli', 'GOtv Jolli', 5800.00, 1, true, 5),
  ('gotv', 'gotv-max', 'GOtv Max', 8500.00, 1, true, 6),
  ('gotv', 'gotv-supa', 'GOtv Supa', 11400.00, 1, true, 7),
  ('gotv', 'gotv-supa-plus', 'GOtv Supa Plus', 16800.00, 1, true, 8),

  -- StarTimes
  ('startimes', 'nova', 'Nova (Dish) - 1 Month', 2100.00, 1, true, 1),
  ('startimes', 'basic', 'Basic (Antenna) - 1 Month', 4000.00, 1, true, 2),
  ('startimes', 'smart', 'Basic (Dish) - 1 Month', 5100.00, 1, true, 3),
  ('startimes', 'classic', 'Classic (Antenna) - 1 Month', 6000.00, 1, true, 4),
  ('startimes', 'super', 'Super (Dish) - 1 Month', 9800.00, 1, true, 5),
  ('startimes', 'nova-weekly', 'Nova (Antenna) - 1 Week', 700.00, 0, true, 6),
  ('startimes', 'basic-weekly', 'Basic (Antenna) - 1 Week', 1400.00, 0, true, 7),
  ('startimes', 'classic-weekly', 'Classic (Antenna) - 1 Week', 2000.00, 0, true, 8),
  ('startimes', 'super-weekly', 'Super (Dish) - 1 Week', 3300.00, 0, true, 9),

  -- Showmax
  ('showmax', 'showmax-mobile-only', 'Showmax Mobile Only', 1600.00, 1, true, 1),
  ('showmax', 'showmax-entertainment', 'Showmax Entertainment', 3500.00, 1, true, 2),
  ('showmax', 'showmax-premier-league', 'Showmax Premier League Mobile', 3200.00, 1, true, 3),
  ('showmax', 'showmax-pro-mobile-only', 'Showmax Entertainment + PL Mobile', 4500.00, 1, true, 4)
on conflict (operator_code, package_code) do update set
  name = excluded.name,
  price = excluded.price,
  duration_months = excluded.duration_months,
  sort_order = excluded.sort_order;

-- 3. RLS Policies
alter table public.cable_tv_configs enable row level security;
alter table public.cable_tv_packages enable row level security;

drop policy if exists "authenticated_read_tv_configs" on public.cable_tv_configs;
create policy "authenticated_read_tv_configs" on public.cable_tv_configs
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated_read_tv_packages" on public.cable_tv_packages;
create policy "authenticated_read_tv_packages" on public.cable_tv_packages
  for select using (auth.role() = 'authenticated');

-- 4. Robust Generic Service Purchase RPC (v2) supporting data, airtime, electricity, cable
create or replace function public.customer_start_service_purchase_v2(
  p_user_id uuid,
  p_idempotency_key text,
  p_reference text,
  p_service_type text,
  p_product_id uuid,
  p_provider_id uuid,
  p_destination text,
  p_amount numeric,
  p_provider_cost numeric,
  p_cashback_amount numeric,
  p_metadata jsonb default '{}'::jsonb
)
returns table(transaction_id uuid, internal_reference text, status text, balance numeric, reused boolean)
language plpgsql
security definer
set search_path to ''
as $$
declare
  existing public.service_transactions%rowtype;
  current_balance numeric(20,2);
  next_balance numeric(20,2);
  new_id uuid;
  valid_service text;
begin
  if p_user_id is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{16,160}$' then
    raise exception 'Invalid purchase request';
  end if;
  if p_reference !~ '^FND-[A-Z0-9-]{10,120}$' then
    raise exception 'Invalid transaction reference';
  end if;
  if p_service_type not in ('data', 'airtime', 'electricity', 'cable', 'cable_tv', 'tv', 'internet') or p_amount <= 0 or p_provider_cost < 0 or p_cashback_amount < 0 then
    raise exception 'Invalid purchase values';
  end if;
  if char_length(trim(p_destination)) < 5 or char_length(trim(p_destination)) > 100 then
    raise exception 'Invalid destination';
  end if;

  -- Map to the check constraint in service_transactions ('cable', 'electricity', 'data', 'airtime')
  valid_service := case
    when p_service_type in ('cable_tv', 'tv') then 'cable'
    else p_service_type
  end;

  select * into existing from public.service_transactions where idempotency_key = p_idempotency_key for update;
  if found then
    if existing.user_id <> p_user_id then
      raise exception 'Idempotency key collision';
    end if;
    select available_balance into current_balance from public.wallets where user_id = p_user_id;
    return query select existing.id, existing.internal_reference, existing.status, coalesce(current_balance, 0), true;
    return;
  end if;

  insert into public.wallets(user_id, currency, available_balance)
  values(p_user_id, 'NGN', 0)
  on conflict(user_id) do nothing;

  select available_balance into current_balance from public.wallets where user_id = p_user_id for update;
  if current_balance < round(p_amount, 2) then
    raise exception 'Insufficient wallet balance';
  end if;

  next_balance := current_balance - round(p_amount, 2);

  insert into public.service_transactions(
    internal_reference, idempotency_key, user_id, service_type,
    product_id, provider_id, destination, amount, provider_cost,
    cashback_amount, status, metadata
  )
  values(
    p_reference, p_idempotency_key, p_user_id, valid_service,
    p_product_id, p_provider_id, trim(p_destination), round(p_amount, 2),
    round(p_provider_cost, 2), round(p_cashback_amount, 2), 'processing', coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into new_id;

  update public.wallets set available_balance = next_balance, updated_at = now() where user_id = p_user_id;

  insert into public.wallet_ledger_entries(user_id, entry_type, amount, currency, balance_after, reference, description, metadata)
  values(
    p_user_id, 'debit', round(p_amount, 2), 'NGN', next_balance,
    'DEBIT-' || p_reference, 'Service purchase: ' || p_service_type,
    jsonb_build_object('transaction_id', new_id)
  );

  insert into public.transaction_events(transaction_id, event_type, to_status, summary, actor_type, actor_id, metadata)
  values(
    new_id, 'purchase_started', 'processing', 'Wallet debited and provider purchase started',
    'customer', p_user_id::text, jsonb_build_object('amount', round(p_amount, 2))
  );

  return query select new_id, p_reference, 'processing', next_balance, false;
end;
$$;

