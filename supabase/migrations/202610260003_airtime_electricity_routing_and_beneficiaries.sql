-- Migration: 202610260003_airtime_electricity_routing_and_beneficiaries.sql
-- Description: Airtime amount range routing, Electricity Disco configurations, user service beneficiaries, and discount coupons

-- 1. User Service Beneficiaries (Saved numbers and meter numbers)
create table if not exists public.user_service_beneficiaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service_type text not null check (service_type in ('airtime', 'data', 'electricity', 'cable_tv', 'internet')),
  recipient text not null,
  label text,
  network_or_disco text not null,
  meter_type text check (meter_type in ('prepaid', 'postpaid')),
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint user_service_beneficiaries_unique unique (user_id, service_type, recipient)
);

create index if not exists idx_user_beneficiaries_user_service 
  on public.user_service_beneficiaries(user_id, service_type, last_used_at desc);

-- 2. Airtime & PIN Provider Routing Rules (Range-based & Fallback)
create table if not exists public.airtime_provider_routes (
  id uuid primary key default gen_random_uuid(),
  network text not null default 'all' check (network in ('all', 'mtn', 'airtel', 'glo', '9mobile')),
  mode text not null default 'all' check (mode in ('all', 'vtu', 'epin')),
  min_amount numeric(12, 2) not null default 50.00,
  max_amount numeric(12, 2) not null default 50000.00,
  primary_provider text not null,
  fallback_provider text,
  discount_percentage numeric(5, 2) not null default 2.00,
  cashback_percentage numeric(5, 2) not null default 0.00,
  priority int not null default 10,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed default airtime range routes
insert into public.airtime_provider_routes (network, mode, min_amount, max_amount, primary_provider, fallback_provider, discount_percentage, cashback_percentage, priority, is_active, notes)
values
  ('all', 'vtu', 50.00, 1000.00, 'maskawasub', 'smeplug', 2.00, 1.00, 10, true, 'Micro & small top-ups via MaskawaSub with SMEPlug fallback'),
  ('all', 'vtu', 1001.00, 10000.00, 'maskawasub', 'smeplug', 2.50, 1.00, 20, true, 'Standard retail top-ups via MaskawaSub with SMEPlug fallback'),
  ('all', 'vtu', 10001.00, 50000.00, 'vtpass', 'smeplug', 3.00, 1.50, 30, true, 'High-volume tier via VTPass with SMEPlug fallback'),
  ('all', 'epin', 100.00, 1000.00, 'maskawasub', 'vtpass', 2.00, 0.00, 15, true, '16-digit recharge card e-PIN generator')
on conflict do nothing;

-- 3. Electricity Distribution Companies Configurations (Discos)
create table if not exists public.electricity_disco_configs (
  disco_code text primary key,
  disco_name text not null,
  coverage_area text not null,
  primary_provider text not null default 'vtpass',
  fallback_provider text default 'maskawasub',
  supports_prepaid boolean not null default true,
  supports_postpaid boolean not null default true,
  convenience_fee numeric(10, 2) not null default 0.00,
  cashback_percentage numeric(5, 2) not null default 1.00,
  min_purchase_amount numeric(10, 2) not null default 500.00,
  max_purchase_amount numeric(10, 2) not null default 100000.00,
  is_active boolean not null default true,
  maintenance_notice text,
  updated_at timestamptz not null default now()
);

-- Seed all 11 Nigerian Electricity Discos
insert into public.electricity_disco_configs (disco_code, disco_name, coverage_area, primary_provider, fallback_provider, supports_prepaid, supports_postpaid, convenience_fee, cashback_percentage, min_purchase_amount, is_active)
values
  ('ikedc', 'Ikeja Electric (IKEDC)', 'Lagos (Ikeja, Mainland, Ikorodu)', 'vtpass', 'maskawasub', true, true, 0.00, 1.00, 500.00, true),
  ('ekedc', 'Eko Electric (EKEDC)', 'Lagos (Island, Lekki, Ajah, Surulere)', 'vtpass', 'maskawasub', true, true, 0.00, 1.00, 500.00, true),
  ('aedc', 'Abuja Electricity (AEDC)', 'FCT Abuja, Nasarawa, Kogi, Niger', 'vtpass', 'maskawasub', true, true, 0.00, 1.00, 500.00, true),
  ('ibedc', 'Ibadan Electricity (IBEDC)', 'Oyo, Ogun, Osun, Kwara', 'vtpass', 'maskawasub', true, true, 0.00, 1.00, 500.00, true),
  ('kedco', 'Kano Electricity (KEDCO)', 'Kano, Katsina, Jigawa', 'vtpass', 'maskawasub', true, true, 0.00, 1.00, 500.00, true),
  ('jed', 'Jos Electricity (JED)', 'Plateau, Bauchi, Benue, Gombe', 'vtpass', 'maskawasub', true, true, 0.00, 1.00, 500.00, true),
  ('eedc', 'Enugu Electricity (EEDC)', 'Enugu, Abia, Imo, Anambra, Ebonyi', 'vtpass', 'maskawasub', true, true, 0.00, 1.00, 500.00, true),
  ('phed', 'Port Harcourt Electric (PHED)', 'Rivers, Bayelsa, Cross River, Akwa Ibom', 'vtpass', 'maskawasub', true, true, 0.00, 1.00, 500.00, true),
  ('kaedco', 'Kaduna Electric (KAEDCO)', 'Kaduna, Kebbi, Sokoto, Zamfara', 'vtpass', 'maskawasub', true, true, 0.00, 1.00, 500.00, true),
  ('yedc', 'Yola Electricity (YEDC)', 'Adamawa, Borno, Taraba, Yobe', 'vtpass', 'maskawasub', true, true, 0.00, 1.00, 500.00, true),
  ('bedc', 'Benin Electricity (BEDC)', 'Edo, Delta, Ondo, Ekiti', 'vtpass', 'maskawasub', true, true, 0.00, 1.00, 500.00, true),
  ('aple', 'Aba Power Electric (APLE)', 'Abia (Aba Ring-fenced zone)', 'vtpass', 'maskawasub', true, true, 0.00, 1.00, 500.00, true)
on conflict (disco_code) do update set
  disco_name = excluded.disco_name,
  coverage_area = excluded.coverage_area;

-- 4. Discount Coupons & Chargeback Engine
create table if not exists public.discount_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  discount_type text not null default 'percentage' check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(10, 2) not null,
  max_discount_amount numeric(10, 2),
  min_purchase_amount numeric(10, 2) not null default 0.00,
  service_type text not null default 'all' check (service_type in ('all', 'airtime', 'data', 'electricity', 'cable_tv')),
  max_uses int not null default 1000,
  times_used int not null default 0,
  per_user_limit int not null default 1,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed initial popular promo coupons
insert into public.discount_coupons (code, description, discount_type, discount_value, max_discount_amount, min_purchase_amount, service_type, max_uses, is_active)
values
  ('FUNDA50', '₦50 off your first electricity or airtime top-up', 'fixed', 50.00, 50.00, 500.00, 'all', 5000, true),
  ('POWER5', '5% discount on electricity token purchases', 'percentage', 5.00, 250.00, 1000.00, 'electricity', 2000, true),
  ('AIRTIME3', '3% extra discount on airtime top-up', 'percentage', 3.00, 150.00, 500.00, 'airtime', 10000, true)
on conflict (code) do nothing;

-- 5. RLS policies
alter table public.user_service_beneficiaries enable row level security;
alter table public.airtime_provider_routes enable row level security;
alter table public.electricity_disco_configs enable row level security;
alter table public.discount_coupons enable row level security;

-- Users can read and write their own beneficiaries
drop policy if exists "users_own_beneficiaries" on public.user_service_beneficiaries;
create policy "users_own_beneficiaries" on public.user_service_beneficiaries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Anyone authenticated can read active routes, discos, and coupons
drop policy if exists "authenticated_read_routes" on public.airtime_provider_routes;
create policy "authenticated_read_routes" on public.airtime_provider_routes
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated_read_discos" on public.electricity_disco_configs;
create policy "authenticated_read_discos" on public.electricity_disco_configs
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated_read_coupons" on public.discount_coupons;
create policy "authenticated_read_coupons" on public.discount_coupons
  for select using (auth.role() = 'authenticated');

