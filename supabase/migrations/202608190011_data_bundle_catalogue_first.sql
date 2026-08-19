-- A Funda bundle can exist before it is linked to a provider offer. This makes
-- the customer catalogue admin-owned rather than provider-owned.

alter table public.service_products
  alter column provider_product_code drop not null,
  alter column provider_cost set default 0;

comment on column public.service_products.provider_product_code is 'Legacy primary provider code. Canonical Funda data bundles may have no provider mapping until they are ready to fulfil.';
