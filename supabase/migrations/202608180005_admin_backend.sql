-- Complete Funda Admin operational backend.
-- All tables are deny-by-default to anon/authenticated. Mutations are performed
-- only by audited, permission-checked server code using the service role.

create table if not exists public.admin_approval_requests (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  entity_type text not null,
  entity_id text,
  requested_by uuid not null references public.admin_users(id) on delete restrict,
  payload jsonb not null default '{}'::jsonb,
  reason text not null,
  risk_level text not null default 'high',
  required_approvals integer not null default 1,
  status text not null default 'pending',
  expires_at timestamptz not null default (now() + interval '24 hours'),
  resolved_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_approval_action_length check (char_length(action_type) between 3 and 100),
  constraint admin_approval_reason_length check (char_length(reason) between 3 and 1000),
  constraint admin_approval_risk check (risk_level in ('low', 'medium', 'high', 'critical')),
  constraint admin_approval_status check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled', 'executed')),
  constraint admin_approval_required check (required_approvals between 1 and 3)
);

create table if not exists public.admin_approval_decisions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.admin_approval_requests(id) on delete cascade,
  admin_user_id uuid not null references public.admin_users(id) on delete restrict,
  decision text not null,
  note text,
  created_at timestamptz not null default now(),
  unique(request_id, admin_user_id),
  constraint admin_approval_decision check (decision in ('approve', 'reject')),
  constraint admin_approval_note_length check (note is null or char_length(note) <= 1000)
);

create index if not exists admin_approval_status_created_idx on public.admin_approval_requests(status, created_at desc);
create index if not exists admin_approval_entity_idx on public.admin_approval_requests(entity_type, entity_id);

create table if not exists public.customer_account_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_status text not null default 'active',
  wallet_status text not null default 'active',
  risk_level text not null default 'low',
  customer_segment text not null default 'standard',
  transaction_pin_reset_required boolean not null default false,
  restriction_reason text,
  restricted_until timestamptz,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_account_status check (account_status in ('active', 'review', 'suspended', 'blocked', 'closed')),
  constraint customer_wallet_status check (wallet_status in ('active', 'frozen', 'debits_blocked', 'credits_blocked')),
  constraint customer_risk_level check (risk_level in ('low', 'medium', 'high', 'critical'))
);

create table if not exists public.admin_customer_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  admin_user_id uuid references public.admin_users(id) on delete set null,
  note text not null,
  visibility text not null default 'internal',
  created_at timestamptz not null default now(),
  constraint admin_customer_note_length check (char_length(note) between 2 and 4000),
  constraint admin_customer_note_visibility check (visibility = 'internal')
);

create index if not exists admin_customer_notes_user_created_idx on public.admin_customer_notes(user_id, created_at desc);

create table if not exists public.kyc_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tier integer not null default 0,
  status text not null default 'not_started',
  provider text,
  provider_reference text,
  submitted_data jsonb not null default '{}'::jsonb,
  review_notes text,
  assigned_to uuid references public.admin_users(id) on delete set null,
  reviewed_by uuid references public.admin_users(id) on delete set null,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kyc_reviews_tier check (tier between 0 and 3),
  constraint kyc_reviews_status check (status in ('not_started', 'pending', 'in_review', 'approved', 'rejected', 'expired'))
);

create index if not exists kyc_reviews_status_created_idx on public.kyc_reviews(status, created_at desc);
create index if not exists kyc_reviews_user_idx on public.kyc_reviews(user_id);

create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_fingerprint_hash text not null,
  device_name text,
  platform text,
  last_ip inet,
  trusted boolean not null default false,
  blocked boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(user_id, device_fingerprint_hash)
);

create table if not exists public.account_limit_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kyc_tier integer not null,
  service_type text,
  per_transaction_limit numeric(20,2),
  daily_value_limit numeric(20,2),
  daily_count_limit integer,
  wallet_funding_limit numeric(20,2),
  enabled boolean not null default true,
  created_by uuid references public.admin_users(id) on delete set null,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_limit_tier check (kyc_tier between 0 and 3),
  constraint account_limit_values check (
    coalesce(per_transaction_limit, 0) >= 0 and coalesce(daily_value_limit, 0) >= 0
    and coalesce(daily_count_limit, 0) >= 0 and coalesce(wallet_funding_limit, 0) >= 0
  )
);

create table if not exists public.customer_limit_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service_type text,
  per_transaction_limit numeric(20,2),
  daily_value_limit numeric(20,2),
  daily_count_limit integer,
  expires_at timestamptz,
  reason text not null,
  approved_request_id uuid references public.admin_approval_requests(id) on delete restrict,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.service_transactions (
  id uuid primary key default gen_random_uuid(),
  internal_reference text not null unique,
  idempotency_key text not null unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  service_type text not null,
  product_id uuid references public.service_products(id) on delete restrict,
  provider_id uuid references public.provider_registry(id) on delete restrict,
  provider_reference text,
  customer_reference text,
  destination text not null,
  amount numeric(20,2) not null,
  provider_cost numeric(20,2) not null default 0,
  discount_amount numeric(20,2) not null default 0,
  cashback_amount numeric(20,2) not null default 0,
  platform_fee numeric(20,2) not null default 0,
  gross_margin numeric(20,2) generated always as (amount + platform_fee - provider_cost - discount_amount - cashback_amount) stored,
  currency text not null default 'NGN',
  payment_source text not null default 'wallet',
  status text not null default 'initiated',
  failure_code text,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  initiated_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_transactions_type check (service_type in ('data', 'airtime', 'electricity', 'cable', 'betting', 'education', 'transfer', 'other')),
  constraint service_transactions_amounts check (amount > 0 and provider_cost >= 0 and discount_amount >= 0 and cashback_amount >= 0 and platform_fee >= 0),
  constraint service_transactions_currency check (currency = 'NGN'),
  constraint service_transactions_source check (payment_source in ('wallet', 'card', 'bank_transfer', 'virtual_account', 'admin')),
  constraint service_transactions_status check (status in ('initiated', 'processing', 'pending', 'successful', 'failed', 'reversed', 'refunded', 'cancelled'))
);

create index if not exists service_transactions_user_created_idx on public.service_transactions(user_id, created_at desc);
create index if not exists service_transactions_status_created_idx on public.service_transactions(status, created_at desc);
create index if not exists service_transactions_provider_created_idx on public.service_transactions(provider_id, created_at desc);
create index if not exists service_transactions_type_created_idx on public.service_transactions(service_type, created_at desc);

create table if not exists public.transaction_events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.service_transactions(id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text,
  summary text not null,
  actor_type text not null default 'system',
  actor_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint transaction_events_actor check (actor_type in ('system', 'customer', 'provider', 'admin', 'webhook'))
);

create index if not exists transaction_events_transaction_created_idx on public.transaction_events(transaction_id, created_at);

create table if not exists public.provider_attempts (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.service_transactions(id) on delete restrict,
  provider_id uuid not null references public.provider_registry(id) on delete restrict,
  attempt_number integer not null,
  request_redacted jsonb not null default '{}'::jsonb,
  response_redacted jsonb not null default '{}'::jsonb,
  http_status integer,
  latency_ms integer,
  outcome text not null,
  provider_reference text,
  created_at timestamptz not null default now(),
  unique(transaction_id, attempt_number),
  constraint provider_attempt_outcome check (outcome in ('sent', 'processing', 'successful', 'failed', 'timeout', 'unknown'))
);

create table if not exists public.wallet_adjustment_requests (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null unique references public.admin_approval_requests(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  direction text not null,
  amount numeric(20,2) not null,
  reference text not null unique,
  reason text not null,
  status text not null default 'pending_approval',
  requested_by uuid not null references public.admin_users(id) on delete restrict,
  executed_by uuid references public.admin_users(id) on delete restrict,
  ledger_entry_id uuid references public.wallet_ledger_entries(id) on delete restrict,
  created_at timestamptz not null default now(),
  executed_at timestamptz,
  constraint wallet_adjustment_direction check (direction in ('credit', 'debit')),
  constraint wallet_adjustment_amount check (amount > 0 and amount <= 5000000),
  constraint wallet_adjustment_status check (status in ('pending_approval', 'approved', 'rejected', 'executed', 'cancelled')),
  constraint wallet_adjustment_reason_length check (char_length(reason) between 5 and 1000)
);

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.service_transactions(id) on delete restrict,
  approval_request_id uuid references public.admin_approval_requests(id) on delete restrict,
  amount numeric(20,2) not null,
  reason text not null,
  status text not null default 'requested',
  provider_refund_reference text,
  requested_by uuid not null references public.admin_users(id) on delete restrict,
  resolved_by uuid references public.admin_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint refund_request_amount check (amount > 0),
  constraint refund_request_status check (status in ('requested', 'pending_approval', 'approved', 'processing', 'refunded', 'rejected', 'failed')),
  constraint refund_request_reason_length check (char_length(reason) between 5 and 1000)
);

create index if not exists refund_requests_status_created_idx on public.refund_requests(status, created_at desc);
alter table public.refund_requests add column if not exists ledger_entry_id uuid references public.wallet_ledger_entries(id) on delete restrict;

create table if not exists public.provider_balances (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_registry(id) on delete cascade,
  balance numeric(20,2) not null,
  currency text not null default 'NGN',
  source text not null default 'api',
  checked_at timestamptz not null default now(),
  raw_response_redacted jsonb not null default '{}'::jsonb,
  constraint provider_balances_currency check (currency = 'NGN'),
  constraint provider_balances_source check (source in ('api', 'manual', 'webhook'))
);

create index if not exists provider_balances_provider_checked_idx on public.provider_balances(provider_id, checked_at desc);

create table if not exists public.provider_routing_rules (
  id uuid primary key default gen_random_uuid(),
  service_type text not null,
  network text,
  product_id uuid references public.service_products(id) on delete cascade,
  provider_id uuid not null references public.provider_registry(id) on delete cascade,
  priority integer not null default 100,
  enabled boolean not null default true,
  minimum_success_rate numeric(5,2) not null default 90,
  maximum_latency_ms integer,
  minimum_balance numeric(20,2),
  conditions jsonb not null default '{}'::jsonb,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_routing_priority check (priority between 1 and 1000),
  constraint provider_routing_success check (minimum_success_rate between 0 and 100)
);

create index if not exists provider_routing_lookup_idx on public.provider_routing_rules(service_type, network, enabled, priority);

create table if not exists public.provider_health_checks (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_registry(id) on delete cascade,
  component text not null default 'api',
  status text not null,
  latency_ms integer,
  success_rate numeric(5,2),
  message text,
  checked_at timestamptz not null default now(),
  constraint provider_health_status check (status in ('operational', 'degraded', 'down', 'unknown')),
  constraint provider_health_success check (success_rate is null or success_rate between 0 and 100)
);

create index if not exists provider_health_provider_checked_idx on public.provider_health_checks(provider_id, checked_at desc);

create table if not exists public.provider_incidents (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references public.provider_registry(id) on delete set null,
  service_type text,
  network text,
  severity text not null default 'minor',
  status text not null default 'investigating',
  title text not null,
  description text,
  affected_transaction_count integer not null default 0,
  affected_value numeric(20,2) not null default 0,
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  opened_by uuid references public.admin_users(id) on delete set null,
  resolved_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_incident_severity check (severity in ('minor', 'major', 'critical')),
  constraint provider_incident_status check (status in ('investigating', 'identified', 'monitoring', 'resolved'))
);

create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.service_products(id) on delete cascade,
  service_type text,
  customer_segment text,
  rule_type text not null,
  value numeric(20,4) not null,
  minimum_amount numeric(20,2),
  maximum_amount numeric(20,2),
  priority integer not null default 100,
  starts_at timestamptz,
  ends_at timestamptz,
  enabled boolean not null default true,
  created_by uuid references public.admin_users(id) on delete set null,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricing_rule_type check (rule_type in ('fixed_markup', 'percentage_markup', 'fixed_discount', 'percentage_discount', 'override_price')),
  constraint pricing_rule_value check (value >= 0),
  constraint pricing_rule_period check (starts_at is null or ends_at is null or starts_at < ends_at)
);

create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references public.provider_registry(id) on delete cascade,
  product_id uuid references public.service_products(id) on delete cascade,
  service_type text,
  calculation_type text not null,
  value numeric(20,4) not null,
  enabled boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commission_rule_type check (calculation_type in ('fixed', 'percentage')),
  constraint commission_rule_value check (value >= 0)
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  transaction_id uuid references public.service_transactions(id) on delete set null,
  category text not null,
  subject text not null,
  description text not null,
  priority text not null default 'normal',
  status text not null default 'new',
  assigned_to uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint support_ticket_priority check (priority in ('low', 'normal', 'high', 'critical')),
  constraint support_ticket_status check (status in ('new', 'assigned', 'waiting_customer', 'investigating', 'escalated', 'resolved', 'closed'))
);

create index if not exists support_tickets_queue_idx on public.support_tickets(status, priority, created_at);

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_type text not null,
  author_id text,
  body text not null,
  internal boolean not null default false,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint support_message_author check (author_type in ('customer', 'admin', 'system')),
  constraint support_message_body check (char_length(body) between 1 and 10000)
);

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  dispute_number text not null unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  transaction_id uuid not null references public.service_transactions(id) on delete restrict,
  category text not null,
  customer_message text not null,
  evidence jsonb not null default '[]'::jsonb,
  priority text not null default 'normal',
  status text not null default 'open',
  resolution text,
  assigned_to uuid references public.admin_users(id) on delete set null,
  resolved_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint dispute_priority check (priority in ('low', 'normal', 'high', 'critical')),
  constraint dispute_status check (status in ('open', 'investigating', 'waiting_provider', 'waiting_customer', 'resolved', 'rejected'))
);

create index if not exists disputes_queue_idx on public.disputes(status, priority, created_at);

create table if not exists public.dispute_events (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete cascade,
  event_type text not null,
  summary text not null,
  admin_user_id uuid references public.admin_users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.user_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  segment_type text not null default 'dynamic',
  rules jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_segment_type check (segment_type in ('dynamic', 'static'))
);

create table if not exists public.user_segment_memberships (
  segment_id uuid not null references public.user_segments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'rule',
  added_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key(segment_id, user_id),
  constraint segment_membership_source check (source in ('rule', 'manual', 'import'))
);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  reward_type text not null,
  reward_value numeric(20,4) not null,
  minimum_purchase numeric(20,2) not null default 0,
  maximum_discount numeric(20,2),
  applicable_services text[] not null default '{}',
  applicable_products uuid[] not null default '{}',
  applicable_networks text[] not null default '{}',
  segment_id uuid references public.user_segments(id) on delete set null,
  total_redemption_limit integer,
  per_user_limit integer not null default 1,
  first_purchase_only boolean not null default false,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft',
  budget numeric(20,2),
  spent numeric(20,2) not null default 0,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupon_code_format check (code ~ '^[A-Z0-9_-]{3,40}$'),
  constraint coupon_reward_type check (reward_type in ('fixed_discount', 'percentage_discount', 'cashback', 'fee_waiver')),
  constraint coupon_values check (reward_value >= 0 and minimum_purchase >= 0 and coalesce(maximum_discount,0) >= 0 and spent >= 0),
  constraint coupon_period check (starts_at < ends_at),
  constraint coupon_status check (status in ('draft', 'scheduled', 'active', 'paused', 'ended'))
);

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  transaction_id uuid references public.service_transactions(id) on delete restrict,
  discount_amount numeric(20,2) not null,
  status text not null default 'reserved',
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  constraint coupon_redemption_amount check (discount_amount >= 0),
  constraint coupon_redemption_status check (status in ('reserved', 'applied', 'released', 'reversed'))
);

create index if not exists coupon_redemptions_user_coupon_idx on public.coupon_redemptions(user_id, coupon_id, created_at desc);

create table if not exists public.cashback_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope_type text not null,
  scope_id text,
  reward_type text not null,
  reward_value numeric(20,4) not null,
  maximum_payout numeric(20,2),
  segment_id uuid references public.user_segments(id) on delete set null,
  budget numeric(20,2),
  spent numeric(20,2) not null default 0,
  conditions jsonb not null default '{}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft',
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cashback_scope check (scope_type in ('global', 'service', 'product', 'network', 'campaign', 'customer')),
  constraint cashback_reward check (reward_type in ('fixed', 'percentage')),
  constraint cashback_values check (reward_value >= 0 and spent >= 0),
  constraint cashback_status check (status in ('draft', 'scheduled', 'active', 'paused', 'ended'))
);

create table if not exists public.cashback_awards (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references public.cashback_rules(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete restrict,
  transaction_id uuid not null unique references public.service_transactions(id) on delete restrict,
  amount numeric(20,2) not null,
  status text not null default 'pending',
  ledger_entry_id uuid references public.wallet_ledger_entries(id) on delete restrict,
  created_at timestamptz not null default now(),
  credited_at timestamptz,
  constraint cashback_award_amount check (amount > 0),
  constraint cashback_award_status check (status in ('pending', 'credited', 'reversed', 'expired'))
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  campaign_type text not null,
  segment_id uuid references public.user_segments(id) on delete set null,
  configuration jsonb not null default '{}'::jsonb,
  budget numeric(20,2),
  spent numeric(20,2) not null default 0,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft',
  created_by uuid references public.admin_users(id) on delete set null,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_type check (campaign_type in ('promotion', 'cashback', 'coupon', 'referral', 'retention', 'acquisition')),
  constraint campaign_period check (starts_at < ends_at),
  constraint campaign_budget check (coalesce(budget,0) >= 0 and spent >= 0),
  constraint campaign_status check (status in ('draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled'))
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete restrict,
  referred_user_id uuid not null unique references auth.users(id) on delete restrict,
  campaign_id uuid references public.campaigns(id) on delete set null,
  status text not null default 'pending',
  reward_amount numeric(20,2) not null default 0,
  reward_ledger_entry_id uuid references public.wallet_ledger_entries(id) on delete restrict,
  qualified_at timestamptz,
  rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint referral_distinct_users check (referrer_user_id <> referred_user_id),
  constraint referral_status check (status in ('pending', 'qualified', 'rewarded', 'rejected', 'fraud_review'))
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  placement text not null,
  priority text not null default 'normal',
  audience jsonb not null default '{"type":"all"}'::jsonb,
  dismissible boolean not null default true,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'draft',
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcement_placement check (placement in ('dashboard', 'banner', 'service', 'maintenance', 'modal')),
  constraint announcement_priority check (priority in ('low', 'normal', 'high', 'critical')),
  constraint announcement_status check (status in ('draft', 'scheduled', 'active', 'paused', 'ended'))
);

create table if not exists public.message_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null,
  subject text,
  content text not null,
  audience jsonb not null,
  scheduled_at timestamptz,
  throttle_per_minute integer not null default 100,
  status text not null default 'draft',
  created_by uuid references public.admin_users(id) on delete set null,
  approved_request_id uuid references public.admin_approval_requests(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_campaign_channel check (channel in ('in_app', 'push', 'email', 'sms', 'whatsapp')),
  constraint message_campaign_status check (status in ('draft', 'pending_approval', 'scheduled', 'sending', 'paused', 'completed', 'cancelled', 'failed')),
  constraint message_campaign_throttle check (throttle_per_minute between 1 and 10000)
);

create table if not exists public.message_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.message_campaigns(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  destination_hash text,
  channel text not null,
  provider text,
  provider_reference text,
  status text not null default 'queued',
  error_code text,
  error_message text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  constraint message_delivery_status check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'suppressed'))
);

create index if not exists message_deliveries_campaign_status_idx on public.message_deliveries(campaign_id, status);

create table if not exists public.risk_cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  transaction_id uuid references public.service_transactions(id) on delete set null,
  risk_score integer not null default 0,
  severity text not null default 'low',
  status text not null default 'open',
  title text not null,
  summary text,
  assigned_to uuid references public.admin_users(id) on delete set null,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint risk_case_score check (risk_score between 0 and 100),
  constraint risk_case_severity check (severity in ('low', 'medium', 'high', 'critical')),
  constraint risk_case_status check (status in ('open', 'investigating', 'monitoring', 'resolved', 'false_positive'))
);

create table if not exists public.risk_signals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.risk_cases(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  signal_type text not null,
  score integer not null,
  source text not null,
  evidence jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint risk_signal_score check (score between 0 and 100)
);

create index if not exists risk_signals_user_detected_idx on public.risk_signals(user_id, detected_at desc);

create table if not exists public.reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references public.provider_registry(id) on delete restrict,
  run_type text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null default 'queued',
  internal_count integer not null default 0,
  provider_count integer not null default 0,
  matched_count integer not null default 0,
  mismatch_count integer not null default 0,
  internal_value numeric(20,2) not null default 0,
  provider_value numeric(20,2) not null default 0,
  started_by uuid references public.admin_users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reconciliation_run_type check (run_type in ('provider', 'gateway', 'wallet', 'daily')),
  constraint reconciliation_status check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  constraint reconciliation_period check (period_start < period_end)
);

create table if not exists public.reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.reconciliation_runs(id) on delete cascade,
  internal_reference text,
  external_reference text,
  internal_amount numeric(20,2),
  external_amount numeric(20,2),
  internal_status text,
  external_status text,
  match_status text not null,
  resolution_status text not null default 'unresolved',
  resolution_note text,
  resolved_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint reconciliation_match_status check (match_status in ('matched', 'amount_mismatch', 'status_mismatch', 'missing_internal', 'missing_external', 'duplicate')),
  constraint reconciliation_resolution check (resolution_status in ('unresolved', 'investigating', 'resolved', 'ignored'))
);

create index if not exists reconciliation_items_run_status_idx on public.reconciliation_items(run_id, match_status, resolution_status);

create table if not exists public.provider_settlements (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_registry(id) on delete restrict,
  period_start timestamptz not null,
  period_end timestamptz not null,
  gross_value numeric(20,2) not null,
  fees numeric(20,2) not null default 0,
  adjustments numeric(20,2) not null default 0,
  net_value numeric(20,2) not null,
  status text not null default 'draft',
  approval_request_id uuid references public.admin_approval_requests(id) on delete restrict,
  external_reference text,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint provider_settlement_status check (status in ('draft', 'pending_approval', 'approved', 'processing', 'paid', 'failed', 'cancelled'))
);

create table if not exists public.daily_financial_snapshots (
  snapshot_date date primary key,
  gross_transaction_value numeric(20,2) not null default 0,
  provider_cost numeric(20,2) not null default 0,
  fees numeric(20,2) not null default 0,
  discount_expense numeric(20,2) not null default 0,
  cashback_expense numeric(20,2) not null default 0,
  refund_value numeric(20,2) not null default 0,
  net_revenue numeric(20,2) not null default 0,
  gross_profit numeric(20,2) not null default 0,
  transaction_count integer not null default 0,
  successful_count integer not null default 0,
  generated_at timestamptz not null default now()
);

create table if not exists public.webhook_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text,
  event_type text,
  direction text not null,
  status text not null,
  http_status integer,
  payload_redacted jsonb not null default '{}'::jsonb,
  error_message text,
  attempt_count integer not null default 1,
  next_retry_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint webhook_log_direction check (direction in ('incoming', 'outgoing')),
  constraint webhook_log_status check (status in ('received', 'processed', 'failed', 'retrying', 'ignored', 'unknown'))
);

create index if not exists webhook_logs_status_received_idx on public.webhook_delivery_logs(status, received_at desc);

create table if not exists public.api_request_logs (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  provider text,
  transaction_reference text,
  method text not null,
  endpoint_redacted text not null,
  request_redacted jsonb not null default '{}'::jsonb,
  response_redacted jsonb not null default '{}'::jsonb,
  http_status integer,
  latency_ms integer,
  outcome text not null,
  created_at timestamptz not null default now(),
  constraint api_request_log_outcome check (outcome in ('successful', 'failed', 'timeout', 'cancelled'))
);

create index if not exists api_request_logs_reference_created_idx on public.api_request_logs(transaction_reference, created_at desc);
create index if not exists api_request_logs_provider_created_idx on public.api_request_logs(provider, created_at desc);

create table if not exists public.system_health_checks (
  id uuid primary key default gen_random_uuid(),
  component text not null,
  status text not null,
  latency_ms integer,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  constraint system_health_status check (status in ('operational', 'degraded', 'down', 'unknown'))
);

create index if not exists system_health_component_checked_idx on public.system_health_checks(component, checked_at desc);

create table if not exists public.admin_saved_views (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  module text not null,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  columns jsonb not null default '[]'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(admin_user_id, module, name)
);

create table if not exists public.admin_export_jobs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete restrict,
  report_type text not null,
  format text not null default 'csv',
  filters jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  storage_path text,
  row_count integer,
  failure_reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint admin_export_format check (format in ('csv', 'xlsx', 'json')),
  constraint admin_export_status check (status in ('queued', 'processing', 'completed', 'failed', 'expired'))
);

-- Mutable tables share the existing safe updated_at trigger.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'admin_approval_requests','customer_account_controls','kyc_reviews','account_limit_rules',
    'service_transactions','provider_routing_rules','provider_incidents','pricing_rules','commission_rules',
    'support_tickets','disputes','user_segments','coupons','cashback_rules','campaigns','announcements',
    'message_campaigns','risk_cases','admin_saved_views'
  ] loop
    execute format('drop trigger if exists %I_updated_at on public.%I', table_name, table_name);
    execute format('create trigger %I_updated_at before update on public.%I for each row execute procedure public.set_updated_at()', table_name, table_name);
  end loop;
end $$;

create or replace function public.prevent_immutable_record_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'This operational record is immutable';
end;
$$;

revoke all on function public.prevent_immutable_record_mutation() from public, anon, authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'admin_approval_decisions','transaction_events','provider_attempts','support_ticket_messages',
    'dispute_events','risk_signals','daily_financial_snapshots','api_request_logs'
  ] loop
    execute format('drop trigger if exists %I_immutable on public.%I', table_name, table_name);
    execute format('create trigger %I_immutable before update or delete on public.%I for each row execute procedure public.prevent_immutable_record_mutation()', table_name, table_name);
  end loop;
end $$;

create or replace function public.admin_record_approval_decision(
  p_request_id uuid,
  p_admin_user_id uuid,
  p_decision text,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  approval public.admin_approval_requests%rowtype;
  approvals_count integer;
begin
  select * into approval from public.admin_approval_requests where id = p_request_id for update;
  if not found then raise exception 'Approval request not found'; end if;
  if approval.status <> 'pending' then raise exception 'Approval request is no longer pending'; end if;
  if approval.expires_at <= now() then
    update public.admin_approval_requests set status = 'expired', resolved_at = now() where id = p_request_id;
    raise exception 'Approval request expired';
  end if;
  if approval.requested_by = p_admin_user_id then raise exception 'Requesters cannot approve their own action'; end if;
  if p_decision not in ('approve','reject') then raise exception 'Invalid approval decision'; end if;

  insert into public.admin_approval_decisions(request_id, admin_user_id, decision, note)
  values (p_request_id, p_admin_user_id, p_decision, nullif(trim(p_note), ''));

  if p_decision = 'reject' then
    update public.admin_approval_requests set status = 'rejected', resolved_at = now() where id = p_request_id;
    update public.wallet_adjustment_requests set status='rejected' where approval_request_id=p_request_id and status='pending_approval';
    update public.refund_requests set status='rejected',resolved_by=p_admin_user_id,resolved_at=now() where approval_request_id=p_request_id and status='pending_approval';
    return 'rejected';
  end if;

  select count(*) into approvals_count from public.admin_approval_decisions
  where request_id = p_request_id and decision = 'approve';
  if approvals_count >= approval.required_approvals then
    update public.admin_approval_requests set status = 'approved', resolved_at = now() where id = p_request_id;
    update public.wallet_adjustment_requests set status='approved' where approval_request_id=p_request_id and status='pending_approval';
    update public.refund_requests set status='approved' where approval_request_id=p_request_id and status='pending_approval';
    return 'approved';
  end if;
  return 'pending';
end;
$$;

create or replace function public.admin_request_wallet_adjustment(
  p_requester_id uuid,
  p_user_id uuid,
  p_direction text,
  p_amount numeric,
  p_reason text,
  p_reference text
)
returns table(approval_request_id uuid, adjustment_request_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare approval_id uuid; adjustment_id uuid;
begin
  if p_direction not in ('credit','debit') then raise exception 'Invalid adjustment direction'; end if;
  if p_amount <= 0 or p_amount > 5000000 then raise exception 'Invalid adjustment amount'; end if;
  if char_length(trim(p_reason)) < 5 then raise exception 'Adjustment reason is required'; end if;
  if not exists(select 1 from auth.users where id = p_user_id) then raise exception 'Customer not found'; end if;

  insert into public.admin_approval_requests(action_type, entity_type, entity_id, requested_by, payload, reason, risk_level, required_approvals)
  values ('wallet.adjust', 'customer_wallet', p_user_id::text, p_requester_id,
    jsonb_build_object('direction',p_direction,'amount',round(p_amount,2),'reference',p_reference),
    trim(p_reason), case when p_amount >= 100000 then 'critical' else 'high' end,
    case when p_amount >= 1000000 then 2 else 1 end)
  returning id into approval_id;

  insert into public.wallet_adjustment_requests(approval_request_id,user_id,direction,amount,reference,reason,requested_by)
  values (approval_id,p_user_id,p_direction,round(p_amount,2),p_reference,trim(p_reason),p_requester_id)
  returning id into adjustment_id;

  return query select approval_id, adjustment_id;
end;
$$;

create or replace function public.admin_execute_wallet_adjustment(
  p_adjustment_request_id uuid,
  p_executor_id uuid
)
returns table(ledger_entry_id uuid, balance numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  adjustment public.wallet_adjustment_requests%rowtype;
  approval public.admin_approval_requests%rowtype;
  current_balance numeric(20,2);
  next_balance numeric(20,2);
  entry_id uuid;
begin
  select * into adjustment from public.wallet_adjustment_requests where id = p_adjustment_request_id for update;
  if not found then raise exception 'Adjustment request not found'; end if;
  if adjustment.status not in ('pending_approval','approved') then raise exception 'Adjustment request cannot be executed'; end if;

  select * into approval from public.admin_approval_requests where id = adjustment.approval_request_id for update;
  if approval.status <> 'approved' then raise exception 'Adjustment has not received required approval'; end if;
  if adjustment.requested_by = p_executor_id then raise exception 'Requesters cannot execute their own wallet adjustment'; end if;

  insert into public.wallets(user_id,currency,available_balance) values(adjustment.user_id,'NGN',0) on conflict(user_id) do nothing;
  select available_balance into current_balance from public.wallets where user_id = adjustment.user_id for update;
  next_balance := case when adjustment.direction = 'credit' then current_balance + adjustment.amount else current_balance - adjustment.amount end;
  if next_balance < 0 then raise exception 'Adjustment would create a negative wallet balance'; end if;

  update public.wallets set available_balance = next_balance, updated_at = now() where user_id = adjustment.user_id;
  insert into public.wallet_ledger_entries(user_id,entry_type,amount,currency,balance_after,reference,description,metadata)
  values(adjustment.user_id,adjustment.direction,adjustment.amount,'NGN',next_balance,adjustment.reference,
    'Admin wallet adjustment: ' || adjustment.reason,
    jsonb_build_object('adjustment_request_id',adjustment.id,'approval_request_id',approval.id,'executor_id',p_executor_id))
  returning id into entry_id;

  update public.wallet_adjustment_requests set status='executed',executed_by=p_executor_id,ledger_entry_id=entry_id,executed_at=now() where id=adjustment.id;
  update public.admin_approval_requests set status='executed',executed_at=now() where id=approval.id;
  return query select entry_id,next_balance;
end;
$$;

create or replace function public.admin_request_refund(
  p_requester_id uuid,
  p_transaction_id uuid,
  p_amount numeric,
  p_reason text
)
returns table(approval_request_id uuid, refund_request_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  transaction_row public.service_transactions%rowtype;
  approval_id uuid;
  refund_id uuid;
  already_refunded numeric(20,2);
begin
  select * into transaction_row from public.service_transactions where id=p_transaction_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if transaction_row.status not in ('successful','failed') then raise exception 'Only completed transactions can be refunded'; end if;
  if p_amount <= 0 then raise exception 'Refund amount must be positive'; end if;
  select coalesce(sum(amount),0) into already_refunded from public.refund_requests
    where transaction_id=p_transaction_id and status in ('approved','processing','refunded');
  if round(p_amount,2) + already_refunded > transaction_row.amount then raise exception 'Refund exceeds the remaining refundable value'; end if;
  if char_length(trim(p_reason)) < 5 then raise exception 'Refund reason is required'; end if;

  insert into public.admin_approval_requests(action_type,entity_type,entity_id,requested_by,payload,reason,risk_level,required_approvals)
  values('transaction.refund','service_transaction',p_transaction_id::text,p_requester_id,
    jsonb_build_object('amount',round(p_amount,2),'user_id',transaction_row.user_id),trim(p_reason),
    case when p_amount >= 100000 then 'critical' else 'high' end,case when p_amount >= 1000000 then 2 else 1 end)
  returning id into approval_id;

  insert into public.refund_requests(transaction_id,approval_request_id,amount,reason,status,requested_by)
  values(p_transaction_id,approval_id,round(p_amount,2),trim(p_reason),'pending_approval',p_requester_id)
  returning id into refund_id;
  return query select approval_id,refund_id;
end;
$$;

create or replace function public.admin_execute_refund(
  p_refund_request_id uuid,
  p_executor_id uuid
)
returns table(ledger_entry_id uuid, balance numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  refund public.refund_requests%rowtype;
  approval public.admin_approval_requests%rowtype;
  transaction_row public.service_transactions%rowtype;
  next_balance numeric(20,2);
  refunded_total numeric(20,2);
  next_transaction_status text;
  entry_id uuid;
begin
  select * into refund from public.refund_requests where id=p_refund_request_id for update;
  if not found then raise exception 'Refund request not found'; end if;
  if refund.status not in ('pending_approval','approved') then raise exception 'Refund request cannot be executed'; end if;
  select * into approval from public.admin_approval_requests where id=refund.approval_request_id for update;
  if approval.status <> 'approved' then raise exception 'Refund has not received required approval'; end if;
  if refund.requested_by=p_executor_id then raise exception 'Requesters cannot execute their own refund'; end if;
  select * into transaction_row from public.service_transactions where id=refund.transaction_id for update;
  if not found then raise exception 'Transaction not found'; end if;

  insert into public.wallets(user_id,currency,available_balance) values(transaction_row.user_id,'NGN',0) on conflict(user_id) do nothing;
  update public.wallets set available_balance=available_balance+refund.amount,updated_at=now()
    where user_id=transaction_row.user_id returning available_balance into next_balance;
  insert into public.wallet_ledger_entries(user_id,entry_type,amount,currency,balance_after,reference,description,metadata)
  values(transaction_row.user_id,'refund',refund.amount,'NGN',next_balance,'REFUND-' || refund.id::text,
    'Refund for ' || transaction_row.internal_reference,
    jsonb_build_object('refund_request_id',refund.id,'transaction_id',transaction_row.id,'executor_id',p_executor_id))
  returning id into entry_id;

  update public.refund_requests set status='refunded',resolved_by=p_executor_id,ledger_entry_id=entry_id,resolved_at=now() where id=refund.id;
  update public.admin_approval_requests set status='executed',executed_at=now() where id=approval.id;
  select coalesce(sum(amount),0) into refunded_total from public.refund_requests where transaction_id=transaction_row.id and status='refunded';
  next_transaction_status := case when refunded_total >= transaction_row.amount then 'refunded' else transaction_row.status end;
  update public.service_transactions set status=next_transaction_status,completed_at=now(),updated_at=now() where id=transaction_row.id;
  insert into public.transaction_events(transaction_id,event_type,from_status,to_status,summary,actor_type,actor_id,metadata)
  values(transaction_row.id,'refund_executed',transaction_row.status,next_transaction_status,'Approved refund credited to customer wallet','admin',p_executor_id::text,
    jsonb_build_object('refund_request_id',refund.id,'amount',refund.amount,'refunded_total',refunded_total,'ledger_entry_id',entry_id));
  return query select entry_id,next_balance;
end;
$$;

create or replace function public.admin_transition_service_transaction(
  p_transaction_id uuid,
  p_to_status text,
  p_summary text,
  p_actor_type text,
  p_actor_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare transaction_row public.service_transactions%rowtype;
begin
  select * into transaction_row from public.service_transactions where id=p_transaction_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if p_to_status not in ('initiated','processing','pending','successful','failed','reversed','refunded','cancelled') then raise exception 'Invalid transaction status'; end if;
  if transaction_row.status in ('successful','reversed','refunded','cancelled') and transaction_row.status <> p_to_status then
    raise exception 'Terminal transaction status cannot be overwritten';
  end if;
  if transaction_row.status = 'failed' and p_to_status not in ('processing','reversed','refunded') then raise exception 'Invalid recovery transition'; end if;

  update public.service_transactions set status=p_to_status,
    completed_at=case when p_to_status in ('successful','failed','reversed','refunded','cancelled') then now() else null end,
    updated_at=now() where id=p_transaction_id;
  insert into public.transaction_events(transaction_id,event_type,from_status,to_status,summary,actor_type,actor_id,metadata)
  values(p_transaction_id,'status_changed',transaction_row.status,p_to_status,p_summary,p_actor_type,p_actor_id,p_metadata);
  return p_to_status;
end;
$$;

revoke all on function public.admin_record_approval_decision(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.admin_request_wallet_adjustment(uuid,uuid,text,numeric,text,text) from public,anon,authenticated;
revoke all on function public.admin_execute_wallet_adjustment(uuid,uuid) from public,anon,authenticated;
revoke all on function public.admin_request_refund(uuid,uuid,numeric,text) from public,anon,authenticated;
revoke all on function public.admin_execute_refund(uuid,uuid) from public,anon,authenticated;
revoke all on function public.admin_transition_service_transaction(uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_record_approval_decision(uuid,uuid,text,text) to service_role;
grant execute on function public.admin_request_wallet_adjustment(uuid,uuid,text,numeric,text,text) to service_role;
grant execute on function public.admin_execute_wallet_adjustment(uuid,uuid) to service_role;
grant execute on function public.admin_request_refund(uuid,uuid,numeric,text) to service_role;
grant execute on function public.admin_execute_refund(uuid,uuid) to service_role;
grant execute on function public.admin_transition_service_transaction(uuid,text,text,text,text,jsonb) to service_role;

insert into public.admin_permissions(permission,description) values
  ('approvals.view','View sensitive action approvals.'),('approvals.review','Approve or reject sensitive actions.'),
  ('customers.note','Add internal customer notes.'),('kyc.review','Review customer identity submissions.'),
  ('providers.manage','Manage provider routing and incidents.'),('support.manage','Manage tickets and disputes.'),
  ('reports.export','Create filtered administrative exports.'),('config.manage','Manage runtime configuration.'),
  ('notifications.manage','Create and send customer communications.'),('reconciliation.manage','Run and resolve reconciliation.'),
  ('risk.view','View risk signals and cases.')
on conflict(permission) do update set description=excluded.description;

-- Practical least-privilege defaults. Super Admin already receives every permission.
with role_permission(role_slug,permission) as (values
  ('operations_admin','dashboard.view'),('operations_admin','users.view'),('operations_admin','wallet.view'),
  ('operations_admin','transactions.view'),('operations_admin','transactions.retry'),('operations_admin','products.view'),
  ('operations_admin','providers.manage'),('operations_admin','support.manage'),('operations_admin','approvals.view'),
  ('finance_admin','dashboard.view'),('finance_admin','users.view'),('finance_admin','wallet.view'),
  ('finance_admin','wallet.adjust'),('finance_admin','transactions.view'),('finance_admin','transactions.refund'),
  ('finance_admin','reconciliation.manage'),('finance_admin','reports.export'),('finance_admin','approvals.view'),('finance_admin','approvals.review'),
  ('customer_support','dashboard.view'),('customer_support','users.view'),('customer_support','customers.note'),
  ('customer_support','wallet.view'),('customer_support','transactions.view'),('customer_support','support.manage'),
  ('read_only_analyst','dashboard.view'),('read_only_analyst','users.view'),('read_only_analyst','wallet.view'),
  ('read_only_analyst','transactions.view'),('read_only_analyst','products.view'),('read_only_analyst','reports.export'),('read_only_analyst','risk.view')
)
insert into public.admin_role_permissions(role_id,permission_id)
select roles.id,permissions.id from role_permission mapping
join public.admin_roles roles on roles.slug=mapping.role_slug
join public.admin_permissions permissions on permissions.permission=mapping.permission
on conflict do nothing;

insert into public.account_limit_rules(name,kyc_tier,per_transaction_limit,daily_value_limit,daily_count_limit,wallet_funding_limit) values
  ('Tier 0 defaults',0,50000,50000,20,50000),('Tier 1 defaults',1,200000,200000,50,200000),('Tier 2 defaults',2,1000000,1000000,100,1000000)
on conflict do nothing;

-- Deny all client access to operational tables. The service role remains the only API path.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'admin_approval_requests','admin_approval_decisions','customer_account_controls','admin_customer_notes',
    'kyc_reviews','user_devices','account_limit_rules','customer_limit_overrides','service_transactions',
    'transaction_events','provider_attempts','wallet_adjustment_requests','refund_requests','provider_balances',
    'provider_routing_rules','provider_health_checks','provider_incidents','pricing_rules','commission_rules',
    'support_tickets','support_ticket_messages','disputes','dispute_events','user_segments','user_segment_memberships',
    'coupons','coupon_redemptions','cashback_rules','cashback_awards','campaigns','referrals','announcements',
    'message_campaigns','message_deliveries','risk_cases','risk_signals','reconciliation_runs','reconciliation_items',
    'provider_settlements','daily_financial_snapshots','webhook_delivery_logs','api_request_logs','system_health_checks',
    'admin_saved_views','admin_export_jobs'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('alter table public.%I force row level security',table_name);
    execute format('revoke all on public.%I from anon, authenticated',table_name);
  end loop;
end $$;

insert into public.customer_account_controls(user_id)
select id from auth.users on conflict(user_id) do nothing;

create or replace function public.handle_new_customer_controls()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.customer_account_controls(user_id)
  values(new.id)
  on conflict(user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_customer_controls() from public,anon,authenticated;
drop trigger if exists on_auth_user_created_customer_controls on auth.users;
create trigger on_auth_user_created_customer_controls
after insert on auth.users
for each row execute procedure public.handle_new_customer_controls();

comment on table public.wallet_adjustment_requests is 'Maker-checker requests. Wallet balances are changed only by admin_execute_wallet_adjustment.';
comment on table public.transaction_events is 'Append-only lifecycle of a service transaction.';
comment on table public.api_request_logs is 'Redacted request/response diagnostics. Secrets and authorization headers are forbidden.';
