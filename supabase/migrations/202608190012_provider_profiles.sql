-- Operational information visible in the admin provider profile. Credentials
-- remain references to Coolify secrets, never database values.

alter table public.provider_registry
  add column if not exists documentation_url text,
  add column if not exists website_url text,
  add column if not exists support_email text,
  add column if not exists support_phone text,
  add column if not exists notes text;

insert into public.provider_registry (
  name, slug, status, capabilities, priority, environment, api_base_url,
  catalogue_endpoint, purchase_endpoint, requery_endpoint, balance_endpoint,
  api_secret_reference, documentation_url, website_url, notes
) values (
  'SMEPlug', 'smeplug', 'standby', array['data', 'airtime'], 30, 'live', 'https://smeplug.ng/api/v1',
  '/data/plans', '/data/purchase', '/transactions/{reference}', '/account/balance',
  'SMEPLUG_SECRET_KEY', 'https://documenter.getpostman.com/view/2351511/SzS5umB5?version=latest', 'https://smeplug.com/',
  'Verified public integration contract: bearer authentication; data catalogue, purchase, balance, transaction requery and transaction webhook support.'
), (
  'MaskawaSub', 'maskawasub', 'operational', array['data', 'airtime', 'electricity', 'cable', 'education'], 15, 'live', 'https://maskawasub.com/api',
  '/datashare/', '/topup/', null, '/user/',
  'MASKAWASUB_API_KEY', 'https://maskawasub.com/api/', 'https://maskawasub.com/',
  'Verified telecom and utilities provider: Token authentication; automated airtime, SME data, electricity bill payments, cable TV and recharge pin generators.'
)
on conflict (slug) do update set
  name = excluded.name,
  capabilities = excluded.capabilities,
  priority = excluded.priority,
  environment = excluded.environment,
  api_base_url = coalesce(public.provider_registry.api_base_url, excluded.api_base_url),
  catalogue_endpoint = coalesce(public.provider_registry.catalogue_endpoint, excluded.catalogue_endpoint),
  purchase_endpoint = coalesce(public.provider_registry.purchase_endpoint, excluded.purchase_endpoint),
  requery_endpoint = coalesce(public.provider_registry.requery_endpoint, excluded.requery_endpoint),
  balance_endpoint = coalesce(public.provider_registry.balance_endpoint, excluded.balance_endpoint),
  api_secret_reference = coalesce(public.provider_registry.api_secret_reference, excluded.api_secret_reference),
  documentation_url = coalesce(public.provider_registry.documentation_url, excluded.documentation_url),
  website_url = coalesce(public.provider_registry.website_url, excluded.website_url),
  notes = coalesce(public.provider_registry.notes, excluded.notes);

comment on column public.provider_registry.documentation_url is 'Public or authenticated provider API documentation address.';
comment on column public.provider_registry.notes is 'Operational integration context only. Never store credentials or customer data.';
