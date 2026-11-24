-- Coupon finder: a public directory of brands and the discounts that work at their checkout.
-- Separate from public.coupons (Funda's own discount codes for its services).
-- Rows are written only by the server (service role); the public reads active rows.

create table if not exists public.coupon_brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  domain text not null,
  aliases text[] not null default '{}',
  category text not null default 'shopping',
  country_scope text not null default 'global',
  promo_urls text[] not null default '{}',
  tier text not null default 'regular',
  status text not null default 'active',
  search_count integer not null default 0,
  last_refreshed_at timestamptz,
  next_refresh_at timestamptz not null default now(),
  last_refresh_status text,
  consecutive_empty_runs integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupon_brands_slug check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint coupon_brands_scope check (country_scope in ('ng', 'global')),
  constraint coupon_brands_tier check (tier in ('hot', 'regular', 'long_tail')),
  constraint coupon_brands_status check (status in ('active', 'paused'))
);

create index if not exists coupon_brands_due_idx on public.coupon_brands(status, next_refresh_at);
create index if not exists coupon_brands_category_idx on public.coupon_brands(category);

create table if not exists public.coupon_offers (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.coupon_brands(id) on delete cascade,
  kind text not null default 'code',
  code text,
  title text not null,
  description text,
  discount_text text,
  min_spend text,
  conditions text,
  new_users_only boolean not null default false,
  works_in_nigeria boolean,
  source_url text,
  source_type text not null default 'web',
  status text not null default 'active',
  starts_at timestamptz,
  expires_at timestamptz,
  fingerprint text not null unique,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_verified_at timestamptz,
  missed_runs integer not null default 0,
  worked_count integer not null default 0,
  failed_count integer not null default 0,
  copy_count integer not null default 0,
  submitted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupon_offers_kind check (kind in ('code', 'deal', 'trial', 'student', 'referral', 'bundle')),
  constraint coupon_offers_source check (source_type in ('brand', 'web', 'user', 'partner', 'editor')),
  constraint coupon_offers_status check (status in ('active', 'stale', 'expired', 'rejected', 'pending')),
  constraint coupon_offers_code_shape check (code is null or code ~ '^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$'),
  constraint coupon_offers_code_kind check ((kind = 'code') = (code is not null))
);

create index if not exists coupon_offers_brand_idx on public.coupon_offers(brand_id, status);
create index if not exists coupon_offers_status_idx on public.coupon_offers(status, last_verified_at desc);
create index if not exists coupon_offers_expiry_idx on public.coupon_offers(expires_at) where status = 'active';

create table if not exists public.coupon_votes (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.coupon_offers(id) on delete cascade,
  voter_key text not null,
  user_id uuid references auth.users(id) on delete set null,
  worked boolean not null,
  created_at timestamptz not null default now(),
  unique (offer_id, voter_key)
);

create table if not exists public.coupon_events (
  id bigint generated always as identity primary key,
  offer_id uuid not null references public.coupon_offers(id) on delete cascade,
  event_type text not null,
  created_at timestamptz not null default now(),
  constraint coupon_events_type check (event_type in ('copy', 'open'))
);

create index if not exists coupon_events_recent_idx on public.coupon_events(created_at desc, offer_id);

create table if not exists public.coupon_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.coupon_brands(id) on delete cascade,
  trigger text not null default 'schedule',
  status text not null default 'running',
  provider text,
  pages_checked integer not null default 0,
  found integer not null default 0,
  added integer not null default 0,
  updated integer not null default 0,
  retired integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint coupon_runs_trigger check (trigger in ('schedule', 'manual', 'live', 'seed')),
  constraint coupon_runs_status check (status in ('running', 'succeeded', 'empty', 'failed'))
);

create index if not exists coupon_runs_recent_idx on public.coupon_refresh_runs(started_at desc);

-- Searches that found no brand: demand that grows the directory.
create table if not exists public.coupon_search_misses (
  query text primary key,
  search_count integer not null default 1,
  last_searched_at timestamptz not null default now()
);

-- One vote per voter per offer; counts stay on the offer for fast ranking.
create or replace function public.record_coupon_vote(p_offer_id uuid, p_voter_key text, p_user_id uuid, p_worked boolean)
returns table (worked_count integer, failed_count integer)
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.coupon_votes (offer_id, voter_key, user_id, worked)
  values (p_offer_id, p_voter_key, p_user_id, p_worked)
  on conflict (offer_id, voter_key) do update set worked = excluded.worked, created_at = now();

  return query
  update public.coupon_offers o set
    worked_count = (select count(*) from public.coupon_votes v where v.offer_id = p_offer_id and v.worked),
    failed_count = (select count(*) from public.coupon_votes v where v.offer_id = p_offer_id and not v.worked),
    last_verified_at = case when p_worked then now() else o.last_verified_at end,
    updated_at = now()
  where o.id = p_offer_id
  returning o.worked_count, o.failed_count;
end;
$$;

create or replace function public.record_coupon_copy(p_offer_id uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.coupon_events (offer_id, event_type) values (p_offer_id, 'copy');
  update public.coupon_offers set copy_count = copy_count + 1 where id = p_offer_id;
$$;

create or replace function public.record_coupon_search_miss(p_query text)
returns void language sql security definer set search_path = '' as $$
  insert into public.coupon_search_misses (query) values (lower(left(trim(p_query), 80)))
  on conflict (query) do update set search_count = public.coupon_search_misses.search_count + 1, last_searched_at = now();
$$;

create or replace function public.bump_coupon_brand_search(p_brand_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.coupon_brands set search_count = search_count + 1 where id = p_brand_id;
$$;

revoke all on function public.record_coupon_vote(uuid, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.record_coupon_copy(uuid) from public, anon, authenticated;
revoke all on function public.record_coupon_search_miss(text) from public, anon, authenticated;
revoke all on function public.bump_coupon_brand_search(uuid) from public, anon, authenticated;

alter table public.coupon_brands enable row level security;
alter table public.coupon_offers enable row level security;
alter table public.coupon_votes enable row level security;
alter table public.coupon_events enable row level security;
alter table public.coupon_refresh_runs enable row level security;
alter table public.coupon_search_misses enable row level security;

drop policy if exists coupon_brands_public_read on public.coupon_brands;
create policy coupon_brands_public_read on public.coupon_brands for select to anon, authenticated using (status = 'active');

drop policy if exists coupon_offers_public_read on public.coupon_offers;
create policy coupon_offers_public_read on public.coupon_offers for select to anon, authenticated using (status in ('active', 'stale'));
