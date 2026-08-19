-- Product catalogue foundation: a Funda product is distinct from the raw plan
-- offered by any one provider. Secrets remain outside Postgres in Coolify.

alter table public.provider_registry
  add column if not exists environment text not null default 'sandbox',
  add column if not exists api_base_url text,
  add column if not exists catalogue_endpoint text,
  add column if not exists purchase_endpoint text,
  add column if not exists requery_endpoint text,
  add column if not exists balance_endpoint text,
  add column if not exists api_secret_reference text,
  add column if not exists webhook_secret_reference text,
  add column if not exists last_catalogue_sync_at timestamptz,
  add column if not exists last_health_check_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'provider_registry_environment_check') then
    alter table public.provider_registry add constraint provider_registry_environment_check check (environment in ('sandbox', 'live'));
  end if;
end;
$$;

create table if not exists public.provider_catalogue_items (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_registry(id) on delete cascade,
  service_type text not null default 'data' check (service_type in ('data', 'airtime', 'electricity', 'cable', 'betting', 'education', 'other')),
  network_slug text,
  provider_product_code text not null,
  provider_name text not null,
  data_amount_mb numeric(12,2),
  validity_hours integer,
  validity_label text,
  provider_cost numeric(20,2) not null check (provider_cost >= 0),
  currency text not null default 'NGN',
  is_available boolean not null default true,
  raw_payload jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_id, provider_product_code)
);

create index if not exists provider_catalogue_items_data_lookup_idx
  on public.provider_catalogue_items(provider_id, service_type, network_slug, is_available);

create table if not exists public.data_bundle_categories (
  id uuid primary key default gen_random_uuid(),
  network_slug text not null,
  slug text not null,
  name text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(network_slug, slug)
);

create table if not exists public.product_provider_offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.service_products(id) on delete cascade,
  provider_id uuid not null references public.provider_registry(id) on delete restrict,
  provider_catalogue_item_id uuid references public.provider_catalogue_items(id) on delete set null,
  provider_product_code text not null,
  provider_cost numeric(20,2) not null check (provider_cost >= 0),
  priority integer not null default 100 check (priority between 1 and 1000),
  status text not null default 'active' check (status in ('active', 'standby', 'paused', 'archived')),
  request_mapping jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, provider_id, provider_product_code)
);

create index if not exists product_provider_offers_routing_idx
  on public.product_provider_offers(product_id, status, priority);

create table if not exists public.product_placements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.service_products(id) on delete cascade,
  surface text not null check (surface in ('home_quick', 'data_top', 'data_recommended')),
  badge text,
  sort_order integer not null default 100,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_placements_dates check (ends_at is null or starts_at is null or ends_at > starts_at),
  unique(product_id, surface)
);

alter table public.provider_catalogue_items enable row level security;
alter table public.provider_catalogue_items force row level security;
alter table public.data_bundle_categories enable row level security;
alter table public.data_bundle_categories force row level security;
alter table public.product_provider_offers enable row level security;
alter table public.product_provider_offers force row level security;
alter table public.product_placements enable row level security;
alter table public.product_placements force row level security;
revoke all on public.provider_catalogue_items, public.data_bundle_categories, public.product_provider_offers, public.product_placements from anon, authenticated;

drop trigger if exists provider_catalogue_items_updated_at on public.provider_catalogue_items;
create trigger provider_catalogue_items_updated_at before update on public.provider_catalogue_items for each row execute procedure public.set_updated_at();
drop trigger if exists data_bundle_categories_updated_at on public.data_bundle_categories;
create trigger data_bundle_categories_updated_at before update on public.data_bundle_categories for each row execute procedure public.set_updated_at();
drop trigger if exists product_provider_offers_updated_at on public.product_provider_offers;
create trigger product_provider_offers_updated_at before update on public.product_provider_offers for each row execute procedure public.set_updated_at();
drop trigger if exists product_placements_updated_at on public.product_placements;
create trigger product_placements_updated_at before update on public.product_placements for each row execute procedure public.set_updated_at();

insert into public.data_bundle_categories (network_slug, slug, name, sort_order) values
  ('mtn', 'daily', 'Daily', 10), ('mtn', 'weekly', 'Weekly', 20), ('mtn', 'monthly', 'Monthly', 30),
  ('airtel', 'daily', 'Daily', 10), ('airtel', 'weekly', 'Weekly', 20), ('airtel', 'monthly', 'Monthly', 30),
  ('glo', 'daily', 'Daily', 10), ('glo', 'weekly', 'Weekly', 20), ('glo', 'monthly', 'Monthly', 30),
  ('9mobile', 'daily', 'Daily', 10), ('9mobile', 'weekly', 'Weekly', 20), ('9mobile', 'monthly', 'Monthly', 30)
on conflict (network_slug, slug) do update set name = excluded.name, sort_order = excluded.sort_order;

comment on table public.provider_catalogue_items is 'Raw provider plans imported or synchronised for review; not customer-visible.';
comment on table public.product_provider_offers is 'Provider-specific fulfilment offers attached to one customer-facing product.';
comment on table public.product_placements is 'Separate merchandising placement for customer-facing product shortcuts.';
