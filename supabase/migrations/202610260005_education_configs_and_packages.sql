-- Migration: 202610260005_education_configs_and_packages.sql
-- Description: Complete Education service configurations (WAEC, NECO, JAMB, NABTEB, NBAIS), PIN catalogues, and purchase RPC update

-- 1. Education Configurations Table
create table if not exists public.education_configs (
  exam_body text primary key check (exam_body in ('waec', 'neco', 'jamb', 'nabteb', 'nbais')),
  name text not null,
  short_name text not null,
  primary_provider text not null default 'vtpass',
  fallback_provider text default 'maskawasub',
  convenience_fee numeric(10, 2) not null default 0.00,
  cashback_percentage numeric(5, 2) not null default 1.00,
  is_active boolean not null default true,
  requires_profile_code boolean not null default false,
  instructions text,
  portal_url text,
  maintenance_notice text,
  updated_at timestamptz not null default now()
);

-- Seed Exam Bodies
insert into public.education_configs (exam_body, name, short_name, primary_provider, fallback_provider, convenience_fee, cashback_percentage, is_active, requires_profile_code, instructions, portal_url)
values
  ('waec', 'West African Examinations Council', 'WAEC', 'vtpass', 'maskawasub', 0.00, 1.00, true, false, 'Visit www.waecdirect.org to check your result with this PIN and Serial Number. Up to 5 checks allowed per card.', 'https://www.waecdirect.org'),
  ('neco', 'National Examinations Council', 'NECO', 'vtpass', 'maskawasub', 0.00, 1.00, true, false, 'Visit result.neco.gov.ng and enter your 12-digit token along with exam year and type to view result.', 'https://result.neco.gov.ng'),
  ('jamb', 'Joint Admissions and Matriculation Board', 'JAMB', 'vtpass', 'maskawasub', 0.00, 1.00, true, true, 'Take this 10-digit e-PIN along with your verified Profile Code to any accredited JAMB CBT centre.', 'https://www.jamb.gov.ng'),
  ('nabteb', 'National Business and Technical Examinations Board', 'NABTEB', 'vtpass', 'maskawasub', 0.00, 1.00, true, false, 'Visit eworld.nabteb.gov.ng to verify your NBC / NTC certificate or modular results.', 'https://eworld.nabteb.gov.ng'),
  ('nbais', 'National Board for Arabic and Islamic Studies', 'NBAIS', 'vtpass', 'maskawasub', 0.00, 1.00, true, false, 'Visit nbais.com.ng to verify your Arabic and Islamic exam credentials online.', 'https://nbais.com.ng')
on conflict (exam_body) do update set
  name = excluded.name,
  short_name = excluded.short_name,
  instructions = excluded.instructions,
  portal_url = excluded.portal_url,
  requires_profile_code = excluded.requires_profile_code;

-- 2. Education Packages / PINs Catalogue Table
create table if not exists public.education_packages (
  id uuid primary key default gen_random_uuid(),
  exam_body text not null references public.education_configs(exam_body) on delete cascade,
  package_code text not null,
  name text not null,
  description text,
  service_type text not null default 'result_checker' check (service_type in ('result_checker', 'registration', 'utme', 'de', 'screening')),
  price numeric(10, 2) not null,
  cost_price numeric(10, 2) not null default 0.00,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint education_packages_body_pkg unique (exam_body, package_code)
);

create index if not exists idx_education_packages_body 
  on public.education_packages(exam_body, is_active, sort_order asc);

-- Seed Official Exam Packages & PINs
insert into public.education_packages (exam_body, package_code, name, description, service_type, price, cost_price, is_active, sort_order)
values
  -- WAEC
  ('waec', 'waec-result', 'WAEC Result Checker e-PIN', 'Instant result checker PIN & Serial Number for May/June & GCE Private candidates.', 'result_checker', 3800.00, 3550.00, true, 1),
  ('waec', 'waec-registration', 'WAEC GCE Registration e-PIN', 'Official scratch card e-PIN to register for WAEC SSCE Private Candidates (Second Series).', 'registration', 27500.00, 26500.00, true, 2),

  -- NECO
  ('neco', 'neco-result', 'NECO Result Token', '12-digit official token to view SSCE Internal & External examination results.', 'result_checker', 1350.00, 1200.00, true, 1),
  ('neco', 'neco-bece', 'NECO BECE (Junior) Result Token', 'Official token for Basic Education Certificate Examination (Junior WAEC / JSS3).', 'result_checker', 1350.00, 1200.00, true, 2),
  ('neco', 'neco-registration', 'NECO SSCE External Registration', 'Registration card for NECO Senior Secondary Certificate Examination (External).', 'registration', 21500.00, 20500.00, true, 3),

  -- JAMB
  ('jamb', 'jamb-utme', 'JAMB UTME Registration (Without Mock)', 'Unified Tertiary Matriculation Examination registration e-PIN. Requires 10-digit Profile Code.', 'utme', 7200.00, 6800.00, true, 1),
  ('jamb', 'jamb-utme-mock', 'JAMB UTME Registration (With Mock)', 'Official JAMB UTME e-PIN including optional computer-based mock practice exam.', 'utme', 8700.00, 8300.00, true, 2),
  ('jamb', 'jamb-de', 'JAMB Direct Entry (DE) Registration', 'Official e-PIN for diploma, NCE, IJMB, and degree holders seeking direct 200-level university admission.', 'de', 7200.00, 6800.00, true, 3),

  -- NABTEB
  ('nabteb', 'nabteb-result', 'NABTEB Result Checker Scratch Card', 'Instant scratch card PIN for May/June and Nov/Dec NBC/NTC Modular exam result checking.', 'result_checker', 1400.00, 1250.00, true, 1),
  ('nabteb', 'nabteb-registration', 'NABTEB Modular / National Tech Exam', 'Registration e-PIN for National Business & Technical Examinations Board modular exams.', 'registration', 16500.00, 15500.00, true, 2),

  -- NBAIS
  ('nbais', 'nbais-result', 'NBAIS Result Checker PIN', 'Official result verification PIN for National Board for Arabic and Islamic Studies examinations.', 'result_checker', 1400.00, 1250.00, true, 1)
on conflict (exam_body, package_code) do update set
  name = excluded.name,
  description = excluded.description,
  service_type = excluded.service_type,
  price = excluded.price,
  cost_price = excluded.cost_price,
  sort_order = excluded.sort_order;

-- 3. RLS Policies
alter table public.education_configs enable row level security;
alter table public.education_packages enable row level security;

drop policy if exists "authenticated_read_education_configs" on public.education_configs;
create policy "authenticated_read_education_configs" on public.education_configs
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated_read_education_packages" on public.education_packages;
create policy "authenticated_read_education_packages" on public.education_packages
  for select using (auth.role() = 'authenticated');

-- 4. Update Generic Service Purchase RPC (v2) supporting data, airtime, electricity, cable, education
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
  p_metadata jsonb default '{}'::jsonb,
  p_per_transaction_limit numeric default null,
  p_daily_value_limit numeric default null,
  p_daily_count_limit integer default null
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
  used_value numeric(20,2);
  used_count integer;
begin
  if p_user_id is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{16,160}$' then
    raise exception 'Invalid purchase request';
  end if;
  if p_reference !~ '^FND-[A-Z0-9-]{10,120}$' then
    raise exception 'Invalid transaction reference';
  end if;
  if p_service_type not in ('data', 'airtime', 'electricity', 'cable', 'cable_tv', 'tv', 'education', 'internet') or p_amount <= 0 or p_provider_cost < 0 or p_cashback_amount < 0 then
    raise exception 'Invalid purchase values';
  end if;
  if char_length(trim(p_destination)) < 5 or char_length(trim(p_destination)) > 100 then
    raise exception 'Invalid destination';
  end if;

  -- Map to the check constraint in service_transactions ('cable', 'electricity', 'data', 'airtime', 'education')
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

  -- Enforce limits under wallet row lock
  if p_per_transaction_limit is not null and round(p_amount, 2) > p_per_transaction_limit then
    raise exception 'This purchase is above your per-transaction limit';
  end if;

  if p_daily_value_limit is not null or p_daily_count_limit is not null then
    select coalesce(sum(t.amount), 0), count(*) into used_value, used_count
    from public.service_transactions t
    where t.user_id = p_user_id 
      and t.status in ('initiated', 'processing', 'pending', 'successful')
      and t.created_at >= public.lagos_day_start();

    if p_daily_value_limit is not null and (used_value + round(p_amount, 2)) > p_daily_value_limit then
      raise exception 'This purchase would exceed your daily spending limit';
    end if;

    if p_daily_count_limit is not null and (used_count + 1) > p_daily_count_limit then
      raise exception 'You have reached your daily purchase limit';
    end if;
  end if;

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

