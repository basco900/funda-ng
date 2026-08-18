-- Funda Admin control plane. Client roles receive no access; all admin reads/writes
-- must pass through authenticated server-side code using the service role.

create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_roles_slug_format check (slug ~ '^[a-z][a-z0-9_]{2,50}$')
);

create table if not exists public.admin_permissions (
  id uuid primary key default gen_random_uuid(),
  permission text not null unique,
  description text,
  created_at timestamptz not null default now(),
  constraint admin_permissions_format check (permission ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$')
);

create table if not exists public.admin_role_permissions (
  role_id uuid not null references public.admin_roles(id) on delete cascade,
  permission_id uuid not null references public.admin_permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  role_id uuid not null references public.admin_roles(id) on delete restrict,
  email text not null,
  full_name text not null,
  status text not null default 'active',
  two_factor_required boolean not null default true,
  last_login_at timestamptz,
  invited_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_users_email_normalized check (email = lower(trim(email))),
  constraint admin_users_name_length check (char_length(full_name) between 2 and 100),
  constraint admin_users_status check (status in ('invited', 'active', 'suspended', 'disabled'))
);

create index if not exists admin_users_role_idx on public.admin_users(role_id);
create index if not exists admin_users_status_idx on public.admin_users(status);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.admin_users(id) on delete set null,
  actor_email text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  reason text,
  ip_address inet,
  user_agent text,
  request_id text,
  created_at timestamptz not null default now(),
  constraint admin_audit_action_length check (char_length(action) between 2 and 120),
  constraint admin_audit_entity_length check (char_length(entity_type) between 2 and 80)
);

create index if not exists admin_audit_actor_created_idx on public.admin_audit_logs(admin_user_id, created_at desc);
create index if not exists admin_audit_entity_created_idx on public.admin_audit_logs(entity_type, entity_id, created_at desc);
create index if not exists admin_audit_action_created_idx on public.admin_audit_logs(action, created_at desc);

create table if not exists public.admin_login_events (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null,
  outcome text not null,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint admin_login_outcome check (outcome in ('succeeded', 'invalid_credentials', 'access_denied', 'rate_limited', 'two_factor_failed'))
);

create index if not exists admin_login_events_email_created_idx on public.admin_login_events(email_hash, created_at desc);
create index if not exists admin_login_events_ip_created_idx on public.admin_login_events(ip_address, created_at desc);

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  enabled boolean not null default false,
  rollout_percentage integer not null default 100,
  targeting jsonb not null default '{}'::jsonb,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feature_flags_key_format check (key ~ '^[a-z][a-z0-9_.-]{2,80}$'),
  constraint feature_flags_rollout_range check (rollout_percentage between 0 and 100)
);

create table if not exists public.app_configuration (
  key text primary key,
  value jsonb not null,
  description text,
  is_sensitive boolean not null default false,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_configuration_key_format check (key ~ '^[a-z][a-z0-9_.-]{2,100}$')
);

create table if not exists public.provider_registry (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'standby',
  capabilities text[] not null default '{}',
  priority integer not null default 100,
  low_balance_threshold numeric(20, 2),
  critical_balance_threshold numeric(20, 2),
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_registry_status check (status in ('operational', 'degraded', 'down', 'maintenance', 'standby')),
  constraint provider_registry_priority check (priority between 1 and 1000),
  constraint provider_registry_thresholds check (
    low_balance_threshold is null or critical_balance_threshold is null or low_balance_threshold >= critical_balance_threshold
  )
);

create table if not exists public.service_products (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references public.provider_registry(id) on delete restrict,
  service_type text not null,
  network text,
  provider_product_code text not null,
  name text not null,
  description text,
  validity text,
  provider_cost numeric(20, 2) not null,
  selling_price numeric(20, 2) not null,
  cashback_amount numeric(20, 2) not null default 0,
  status text not null default 'draft',
  featured boolean not null default false,
  sort_priority integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.admin_users(id) on delete set null,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_id, provider_product_code),
  constraint service_products_type check (service_type in ('data', 'airtime', 'electricity', 'cable', 'betting', 'education', 'other')),
  constraint service_products_status check (status in ('draft', 'active', 'disabled', 'archived')),
  constraint service_products_prices check (provider_cost >= 0 and selling_price >= 0 and cashback_amount >= 0),
  constraint service_products_margin_check check (selling_price >= cashback_amount)
);

create index if not exists service_products_service_status_idx on public.service_products(service_type, status);
create index if not exists service_products_provider_idx on public.service_products(provider_id);

insert into public.admin_roles (name, slug, description, is_system) values
  ('Super Admin', 'super_admin', 'Unrestricted platform access.', true),
  ('Operations Admin', 'operations_admin', 'Transactions, providers and support operations.', true),
  ('Finance Admin', 'finance_admin', 'Ledger, refunds, reconciliation and revenue.', true),
  ('Customer Support', 'customer_support', 'Customer profiles, tickets and limited transaction actions.', true),
  ('Read-only Analyst', 'read_only_analyst', 'Read-only reporting and analytics.', true)
on conflict (slug) do update set name = excluded.name, description = excluded.description;

insert into public.admin_permissions (permission, description) values
  ('dashboard.view', 'View the admin control centre.'),
  ('users.view', 'View customer records.'),
  ('users.edit', 'Edit non-financial customer attributes.'),
  ('users.suspend', 'Suspend or restore customer access.'),
  ('wallet.view', 'View wallet and ledger data.'),
  ('wallet.adjust', 'Request or approve a ledger-backed wallet adjustment.'),
  ('transactions.view', 'View transaction records and provider timelines.'),
  ('transactions.retry', 'Run a provider-safe transaction retry.'),
  ('transactions.refund', 'Request or approve a refund.'),
  ('products.view', 'View products and provider routing.'),
  ('products.edit', 'Create and edit service products.'),
  ('pricing.edit', 'Change pricing and margins.'),
  ('growth.manage', 'Manage campaigns, coupons and notifications.'),
  ('risk.manage', 'Manage risk cases, KYC reviews and limits.'),
  ('platform.manage', 'Manage flags, integrations and runtime configuration.'),
  ('admins.manage', 'Invite and manage administrative users.'),
  ('audit.view', 'View immutable audit history.'),
  ('settings.edit', 'Change administrative settings.')
on conflict (permission) do update set description = excluded.description;

insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from public.admin_roles role
cross join public.admin_permissions permission
where role.slug = 'super_admin'
on conflict do nothing;

insert into public.feature_flags (key, name, description, enabled) values
  ('service.data', 'Data purchase', 'Allow customers to purchase data bundles.', false),
  ('service.airtime', 'Airtime purchase', 'Allow customers to purchase airtime.', false),
  ('service.electricity', 'Electricity payment', 'Allow customers to pay electricity bills.', false),
  ('wallet.funding', 'Wallet funding', 'Allow live customer wallet funding.', true),
  ('rewards.cashback', 'Cashback', 'Enable cashback accrual and redemption.', false),
  ('platform.maintenance_banner', 'Maintenance banner', 'Show a global customer maintenance notice.', false)
on conflict (key) do nothing;

insert into public.app_configuration (key, value, description) values
  ('transaction.minimum_amount', '100'::jsonb, 'Minimum supported transaction amount in naira.'),
  ('transaction.maximum_amount', '500000'::jsonb, 'Maximum supported transaction amount in naira.'),
  ('transaction.timeout_minutes', '15'::jsonb, 'Age at which a pending transaction needs review.'),
  ('support.primary_channel', '"support@funda.ng"'::jsonb, 'Primary support contact shown to customers.')
on conflict (key) do nothing;

insert into public.provider_registry (name, slug, status, capabilities, priority) values
  ('Bachs', 'bachs', 'operational', array['wallet_funding'], 10),
  ('VTPass', 'vtpass', 'standby', array['airtime', 'data', 'electricity', 'cable'], 20),
  ('SMEPlug', 'smeplug', 'standby', array['airtime', 'data'], 30),
  ('Pairgate', 'pairgate', 'standby', array['airtime', 'data'], 40),
  ('GladTidings', 'gladtidings', 'standby', array['airtime', 'data'], 50)
on conflict (slug) do update set capabilities = excluded.capabilities;

drop trigger if exists admin_roles_updated_at on public.admin_roles;
create trigger admin_roles_updated_at before update on public.admin_roles for each row execute procedure public.set_updated_at();
drop trigger if exists admin_users_updated_at on public.admin_users;
create trigger admin_users_updated_at before update on public.admin_users for each row execute procedure public.set_updated_at();
drop trigger if exists feature_flags_updated_at on public.feature_flags;
create trigger feature_flags_updated_at before update on public.feature_flags for each row execute procedure public.set_updated_at();
drop trigger if exists app_configuration_updated_at on public.app_configuration;
create trigger app_configuration_updated_at before update on public.app_configuration for each row execute procedure public.set_updated_at();
drop trigger if exists provider_registry_updated_at on public.provider_registry;
create trigger provider_registry_updated_at before update on public.provider_registry for each row execute procedure public.set_updated_at();
drop trigger if exists service_products_updated_at on public.service_products;
create trigger service_products_updated_at before update on public.service_products for each row execute procedure public.set_updated_at();

create or replace function public.prevent_admin_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Admin audit logs are immutable';
end;
$$;

revoke all on function public.prevent_admin_audit_mutation() from public, anon, authenticated;
drop trigger if exists admin_audit_logs_immutable on public.admin_audit_logs;
create trigger admin_audit_logs_immutable
before update or delete on public.admin_audit_logs
for each row execute procedure public.prevent_admin_audit_mutation();

alter table public.admin_roles enable row level security;
alter table public.admin_roles force row level security;
alter table public.admin_permissions enable row level security;
alter table public.admin_permissions force row level security;
alter table public.admin_role_permissions enable row level security;
alter table public.admin_role_permissions force row level security;
alter table public.admin_users enable row level security;
alter table public.admin_users force row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.admin_audit_logs force row level security;
alter table public.admin_login_events enable row level security;
alter table public.admin_login_events force row level security;
alter table public.feature_flags enable row level security;
alter table public.feature_flags force row level security;
alter table public.app_configuration enable row level security;
alter table public.app_configuration force row level security;
alter table public.provider_registry enable row level security;
alter table public.provider_registry force row level security;
alter table public.service_products enable row level security;
alter table public.service_products force row level security;

revoke all on public.admin_roles, public.admin_permissions, public.admin_role_permissions,
  public.admin_users, public.admin_audit_logs, public.admin_login_events,
  public.feature_flags, public.app_configuration, public.provider_registry,
  public.service_products from anon, authenticated;

comment on table public.admin_audit_logs is 'Append-only record of sensitive Funda Admin activity.';
comment on table public.service_products is 'Admin-managed product catalogue; secrets must never be stored in metadata.';
comment on column public.provider_registry.configuration is 'Non-secret provider routing configuration only. API credentials remain server-side.';
