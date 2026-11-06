-- Payment hardening: review queue for payments that must not be auto-credited,
-- durable connected-account sweeps, KYC funding limits, atomic purchase limits,
-- cashback crediting, and indexed temporary virtual account matching.

-- ---------------------------------------------------------------------------
-- Funding status: payments held for an operator are marked 'review'.
-- ---------------------------------------------------------------------------
alter table public.wallet_funding_transactions
  drop constraint if exists wallet_funding_status;
alter table public.wallet_funding_transactions
  add constraint wallet_funding_status check (status in ('initializing', 'pending', 'succeeded', 'failed', 'underpaid', 'expired', 'review'));

create index if not exists wallet_funding_pending_idx
  on public.wallet_funding_transactions (status, created_at)
  where status = 'pending';

create index if not exists user_virtual_accounts_metadata_gin
  on public.user_virtual_accounts using gin (metadata jsonb_path_ops);

-- ---------------------------------------------------------------------------
-- Review queue: received money that could not be safely credited automatically.
-- ---------------------------------------------------------------------------
create table if not exists public.payment_review_queue (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  reason text not null,
  user_id uuid references auth.users(id) on delete set null,
  suggested_user_id uuid references auth.users(id) on delete set null,
  charge_id text,
  checkout_id text,
  amount numeric(20, 2),
  currency text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  resolution_note text,
  resolved_by uuid references public.admin_users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_review_reason check (reason in (
    'unmatched_deposit', 'sender_match_unconfirmed', 'amount_mismatch', 'currency_mismatch',
    'underpaid', 'funding_limit', 'wallet_restricted', 'amount_too_large'
  )),
  constraint payment_review_status check (status in ('pending', 'credited', 'dismissed'))
);

create index if not exists payment_review_status_created_idx
  on public.payment_review_queue (status, created_at desc);

alter table public.payment_review_queue enable row level security;
alter table public.payment_review_queue force row level security;
revoke all on public.payment_review_queue from anon, authenticated;

drop trigger if exists payment_review_queue_updated_at on public.payment_review_queue;
create trigger payment_review_queue_updated_at before update on public.payment_review_queue
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Durable sweeps from per-user connected accounts back to the platform balance.
-- ---------------------------------------------------------------------------
create table if not exists public.connected_account_sweeps (
  id uuid primary key default gen_random_uuid(),
  charge_id text not null unique,
  account_id text not null,
  amount numeric(20, 2) not null,
  currency text not null default 'NGN',
  status text not null default 'pending',
  attempts integer not null default 0,
  transfer_id text,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connected_account_sweeps_amount check (amount > 0),
  constraint connected_account_sweeps_currency check (currency = 'NGN'),
  constraint connected_account_sweeps_status check (status in ('pending', 'succeeded', 'failed'))
);

create index if not exists connected_account_sweeps_pending_idx
  on public.connected_account_sweeps (status, created_at)
  where status = 'pending';

alter table public.connected_account_sweeps enable row level security;
alter table public.connected_account_sweeps force row level security;
revoke all on public.connected_account_sweeps from anon, authenticated;

drop trigger if exists connected_account_sweeps_updated_at on public.connected_account_sweeps;
create trigger connected_account_sweeps_updated_at before update on public.connected_account_sweeps
for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.lagos_day_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos');
$$;

-- Remaining wallet funding allowed today for the customer's approved KYC tier.
-- account_limit_rules.wallet_funding_limit is treated as a daily (Lagos time) funding cap.
-- Returns null when no cap is configured.
create or replace function public.wallet_funding_headroom(p_user_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tier integer;
  v_limit numeric(20, 2);
  v_used numeric(20, 2);
begin
  select coalesce(max(k.tier), 0) into v_tier
  from public.kyc_reviews k
  where k.user_id = p_user_id and k.status = 'approved';

  select min(r.wallet_funding_limit) into v_limit
  from public.account_limit_rules r
  where r.kyc_tier = v_tier and r.enabled and r.wallet_funding_limit is not null and r.wallet_funding_limit > 0;

  if v_limit is null then return null; end if;

  select coalesce(sum(l.amount), 0) into v_used
  from public.wallet_ledger_entries l
  where l.user_id = p_user_id
    and l.entry_type = 'credit'
    and l.funding_transaction_id is not null
    and l.created_at >= public.lagos_day_start();

  return greatest(v_limit - v_used, 0);
end;
$$;

create or replace function public.hold_payment_for_review(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_suggested_user_id uuid,
  p_reason text,
  p_charge_id text,
  p_checkout_id text,
  p_amount numeric,
  p_currency text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.payment_webhook_events (event_id, event_type, payload)
  values (p_event_id, 'held_for_review', coalesce(p_payload, '{}'::jsonb))
  on conflict (event_id) do nothing;

  insert into public.payment_review_queue (
    event_id, event_type, reason, user_id, suggested_user_id, charge_id, checkout_id, amount, currency, payload
  ) values (
    p_event_id, coalesce(p_event_type, 'collection.succeeded'), p_reason, p_user_id, p_suggested_user_id,
    p_charge_id, p_checkout_id, round(p_amount, 2), upper(p_currency), coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (event_id) do update set updated_at = now()
  returning id into v_id;

  if p_user_id is not null then
    begin
      insert into public.user_notifications (user_id, title, body, kind)
      values (
        p_user_id,
        'Payment Under Review',
        'We received ₦' || round(p_amount, 2)::text || ' and are reviewing it before crediting your wallet. No action is needed.',
        'transaction'
      );
    exception when others then null;
    end;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Checkout funding credit. Returns an outcome instead of raising for business
-- mismatches, so the webhook can tell "hold for review" from "retry later".
-- Outcomes: credited | duplicate | unknown_checkout | held_for_review
-- ---------------------------------------------------------------------------
drop function if exists public.credit_bachs_wallet(text, text, text, numeric, text, jsonb);

create or replace function public.credit_bachs_wallet(
  p_event_id text,
  p_checkout_id text,
  p_charge_id text,
  p_amount numeric,
  p_currency text,
  p_payload jsonb,
  p_event_type text default 'collection.succeeded'
)
returns table(outcome text, balance numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_funding public.wallet_funding_transactions%rowtype;
  v_balance numeric(20, 2);
  v_reason text;
  v_wallet_status text;
  v_headroom numeric;
begin
  if p_event_id is null or p_checkout_id is null or p_charge_id is null then
    raise exception 'Missing Bachs payment identifiers';
  end if;

  select * into v_funding
  from public.wallet_funding_transactions
  where checkout_id = p_checkout_id
  for update;

  -- Not one of our wallet checkouts (e.g. a temporary virtual account checkout).
  -- The event is deliberately not recorded so the caller can process it elsewhere.
  if not found then
    return query select 'unknown_checkout'::text, 0::numeric;
    return;
  end if;

  insert into public.payment_webhook_events (event_id, event_type, payload)
  values (p_event_id, coalesce(p_event_type, 'collection.succeeded'), p_payload)
  on conflict (event_id) do nothing;

  if not found
     or v_funding.status = 'succeeded'
     or exists (select 1 from public.wallet_ledger_entries l where l.reference = p_charge_id and l.entry_type = 'credit') then
    select w.available_balance into v_balance from public.wallets w where w.user_id = v_funding.user_id;
    return query select 'duplicate'::text, coalesce(v_balance, 0);
    return;
  end if;

  v_reason := case
    when p_event_type = 'collection.underpaid' then 'underpaid'
    when v_funding.currency <> upper(p_currency) then 'currency_mismatch'
    when v_funding.amount <> round(p_amount, 2) then 'amount_mismatch'
    else null
  end;

  if v_reason is null then
    select c.wallet_status into v_wallet_status from public.customer_account_controls c where c.user_id = v_funding.user_id;
    if v_wallet_status in ('frozen', 'credits_blocked') then v_reason := 'wallet_restricted'; end if;
  end if;

  if v_reason is null then
    v_headroom := public.wallet_funding_headroom(v_funding.user_id);
    if v_headroom is not null and v_funding.amount > v_headroom then v_reason := 'funding_limit'; end if;
  end if;

  if v_reason is not null then
    update public.wallet_funding_transactions
    set status = case when v_reason = 'underpaid' then 'underpaid' else 'review' end,
        failure_reason = v_reason,
        provider_payload = p_payload
    where id = v_funding.id;

    perform public.hold_payment_for_review(
      p_event_id, p_event_type, v_funding.user_id, null, v_reason,
      p_charge_id, p_checkout_id, p_amount, p_currency, p_payload
    );

    select w.available_balance into v_balance from public.wallets w where w.user_id = v_funding.user_id;
    return query select 'held_for_review'::text, coalesce(v_balance, 0);
    return;
  end if;

  insert into public.wallets (user_id, currency, available_balance)
  values (v_funding.user_id, 'NGN', v_funding.amount)
  on conflict (user_id) do update
    set available_balance = public.wallets.available_balance + excluded.available_balance,
        updated_at = now()
  returning available_balance into v_balance;

  insert into public.wallet_ledger_entries (
    user_id, funding_transaction_id, entry_type, amount, currency,
    balance_after, reference, description, metadata
  ) values (
    v_funding.user_id, v_funding.id, 'credit', v_funding.amount, v_funding.currency,
    v_balance, p_charge_id, 'Wallet funding via Bachs', jsonb_build_object('event_id', p_event_id, 'checkout_id', p_checkout_id, 'channel', 'checkout')
  );

  update public.wallet_funding_transactions
  set status = 'succeeded', charge_id = p_charge_id, provider_payload = p_payload, credited_at = now(), failure_reason = null
  where id = v_funding.id;

  return query select 'credited'::text, v_balance;
end;
$$;

-- ---------------------------------------------------------------------------
-- Virtual account / bank transfer deposit credit.
-- Outcomes: credited | duplicate | held_for_review
-- p_bypass_limits is only used when an operator resolves a review item.
-- ---------------------------------------------------------------------------
drop function if exists public.credit_bachs_virtual_account_deposit(text, uuid, text, numeric, text, text, text, text, text, jsonb);

create or replace function public.credit_bachs_virtual_account_deposit(
  p_event_id text,
  p_user_id uuid,
  p_charge_id text,
  p_amount numeric,
  p_currency text,
  p_sender_name text default null,
  p_sender_bank text default null,
  p_sender_account_number text default null,
  p_narration text default null,
  p_payload jsonb default '{}'::jsonb,
  p_bypass_limits boolean default false
)
returns table(outcome text, balance numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_funding_id uuid;
  v_balance numeric(20, 2);
  v_clean_amount numeric(20, 2);
  v_desc text;
  v_reason text;
  v_wallet_status text;
  v_headroom numeric;
begin
  if p_event_id is null or p_user_id is null or p_charge_id is null then
    raise exception 'Missing Bachs virtual account deposit identifiers';
  end if;

  v_clean_amount := round(p_amount, 2);
  if v_clean_amount is null or v_clean_amount <= 0 then
    raise exception 'Virtual account deposit amount must be positive';
  end if;

  insert into public.payment_webhook_events (event_id, event_type, payload)
  values (p_event_id, 'collection.succeeded', coalesce(p_payload, '{}'::jsonb))
  on conflict (event_id) do nothing;

  if not found
     or exists (select 1 from public.wallet_funding_transactions f where f.charge_id = p_charge_id)
     or exists (select 1 from public.wallet_ledger_entries l where l.reference = p_charge_id and l.entry_type = 'credit') then
    select w.available_balance into v_balance from public.wallets w where w.user_id = p_user_id;
    return query select 'duplicate'::text, coalesce(v_balance, 0);
    return;
  end if;

  if upper(coalesce(p_currency, '')) <> 'NGN' then
    v_reason := 'currency_mismatch';
  elsif not p_bypass_limits then
    if v_clean_amount > 5000000 then
      v_reason := 'amount_too_large';
    else
      select c.wallet_status into v_wallet_status from public.customer_account_controls c where c.user_id = p_user_id;
      if v_wallet_status in ('frozen', 'credits_blocked') then
        v_reason := 'wallet_restricted';
      else
        v_headroom := public.wallet_funding_headroom(p_user_id);
        if v_headroom is not null and v_clean_amount > v_headroom then v_reason := 'funding_limit'; end if;
      end if;
    end if;
  end if;

  if v_reason is not null then
    perform public.hold_payment_for_review(
      p_event_id, 'collection.succeeded', p_user_id, null, v_reason,
      p_charge_id, null, v_clean_amount, p_currency, p_payload
    );
    select w.available_balance into v_balance from public.wallets w where w.user_id = p_user_id;
    return query select 'held_for_review'::text, coalesce(v_balance, 0);
    return;
  end if;

  insert into public.wallet_funding_transactions (
    user_id, provider, merchant_reference, idempotency_key, checkout_id, charge_id,
    amount, currency, status, provider_payload, credited_at
  ) values (
    p_user_id, 'bachs', 'funda_va_' || p_charge_id, 'bachs_va_' || p_charge_id, null, p_charge_id,
    v_clean_amount, 'NGN', 'succeeded', coalesce(p_payload, '{}'::jsonb), now()
  )
  returning id into v_funding_id;

  insert into public.wallets (user_id, currency, available_balance)
  values (p_user_id, 'NGN', v_clean_amount)
  on conflict (user_id) do update
    set available_balance = public.wallets.available_balance + excluded.available_balance,
        updated_at = now()
  returning available_balance into v_balance;

  v_desc := case
    when nullif(trim(coalesce(p_sender_name, '')), '') is not null
      then 'Wallet deposit from ' || trim(p_sender_name)
    else 'Wallet deposit via Virtual Account'
  end;

  insert into public.wallet_ledger_entries (
    user_id, funding_transaction_id, entry_type, amount, currency,
    balance_after, reference, description, metadata
  ) values (
    p_user_id, v_funding_id, 'credit', v_clean_amount, 'NGN',
    v_balance, p_charge_id, v_desc,
    jsonb_build_object(
      'event_id', p_event_id,
      'channel', 'virtual_account',
      'sender_name', p_sender_name,
      'sender_bank', p_sender_bank,
      'sender_account_number', p_sender_account_number,
      'narration', p_narration
    )
  );

  update public.user_virtual_accounts
  set known_sender_accounts = case
        when nullif(trim(coalesce(p_sender_account_number, '')), '') is not null
             and not (trim(p_sender_account_number) = any(known_sender_accounts))
          then array_append(known_sender_accounts, trim(p_sender_account_number))
        else known_sender_accounts
      end,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'verified_sender_name', nullif(trim(coalesce(p_sender_name, '')), ''),
        'verified_sender_bank', nullif(trim(coalesce(p_sender_bank, '')), ''),
        'verified_sender_account', nullif(trim(coalesce(p_sender_account_number, '')), ''),
        'last_deposit_amount', v_clean_amount,
        'last_deposit_charge_id', p_charge_id,
        'last_deposit_at', now()
      )),
      updated_at = now()
  where user_id = p_user_id;

  if nullif(trim(coalesce(p_sender_name, '')), '') is not null then
    begin
      update public.profiles
      set full_name = case
            when coalesce(trim(full_name), '') in ('', 'Funda Customer', 'Customer')
              then initcap(trim(p_sender_name))
            else full_name
          end,
          display_name = case
            when coalesce(trim(display_name), '') in ('', 'Funda Customer', 'Customer')
              then split_part(initcap(trim(p_sender_name)), ' ', 1)
            else display_name
          end,
          updated_at = now()
      where id = p_user_id;
    exception when others then null;
    end;
  end if;

  begin
    insert into public.user_notifications (user_id, title, body, kind)
    values (
      p_user_id,
      'Wallet Funded via Bank Transfer',
      '₦' || v_clean_amount::text || ' has been credited to your Funda wallet (' || v_desc || ').',
      'transaction'
    );
  exception when others then null;
  end;

  return query select 'credited'::text, v_balance;
end;
$$;

-- ---------------------------------------------------------------------------
-- Operator resolution of review items.
-- ---------------------------------------------------------------------------
create or replace function public.admin_resolve_payment_review(
  p_review_id uuid,
  p_user_id uuid,
  p_admin_user_id uuid,
  p_note text
)
returns table(outcome text, balance numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.payment_review_queue%rowtype;
  v_transfer jsonb;
  v_outcome text;
  v_balance numeric;
begin
  select * into v_review from public.payment_review_queue where id = p_review_id for update;
  if not found then raise exception 'Review item not found'; end if;
  if v_review.status <> 'pending' then raise exception 'This review item is already resolved'; end if;
  if v_review.charge_id is null or v_review.amount is null or v_review.amount <= 0 then
    raise exception 'This review item has no creditable charge';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then raise exception 'Customer not found'; end if;

  v_transfer := v_review.payload -> 'data' -> 'payment_method_details' -> 'bank_transfer';

  select c.outcome, c.balance into v_outcome, v_balance
  from public.credit_bachs_virtual_account_deposit(
    'review:' || v_review.id::text,
    p_user_id,
    v_review.charge_id,
    v_review.amount,
    coalesce(v_review.currency, 'NGN'),
    v_transfer ->> 'sender_name',
    v_transfer ->> 'sender_bank',
    v_transfer ->> 'sender_account_number',
    v_transfer ->> 'narration',
    v_review.payload,
    true
  ) c;

  if v_outcome = 'duplicate' then raise exception 'This charge has already been credited'; end if;
  if v_outcome <> 'credited' then raise exception 'The deposit could not be credited (%)', v_outcome; end if;

  update public.payment_review_queue
  set status = 'credited', user_id = p_user_id, resolved_by = p_admin_user_id, resolved_at = now(),
      resolution_note = left(p_note, 1000)
  where id = v_review.id;

  if v_review.checkout_id is not null then
    update public.wallet_funding_transactions
    set failure_reason = coalesce(failure_reason, '') || ' (resolved by operator)'
    where checkout_id = v_review.checkout_id;
  end if;

  return query select v_outcome, v_balance;
end;
$$;

create or replace function public.admin_dismiss_payment_review(
  p_review_id uuid,
  p_admin_user_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payment_review_queue
  set status = 'dismissed', resolved_by = p_admin_user_id, resolved_at = now(), resolution_note = left(p_note, 1000)
  where id = p_review_id and status = 'pending';
  if not found then raise exception 'Review item not found or already resolved'; end if;
end;
$$;

create or replace function public.admin_find_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Service purchases: enforce limits under the wallet row lock so concurrent
-- requests cannot exceed daily limits.
-- ---------------------------------------------------------------------------
drop function if exists public.customer_start_service_purchase(uuid, text, text, text, uuid, uuid, text, numeric, numeric, numeric, jsonb);

create or replace function public.customer_start_service_purchase(
  p_user_id uuid, p_idempotency_key text, p_reference text, p_service_type text,
  p_product_id uuid, p_provider_id uuid, p_destination text, p_amount numeric,
  p_provider_cost numeric, p_cashback_amount numeric, p_metadata jsonb default '{}'::jsonb,
  p_per_transaction_limit numeric default null, p_daily_value_limit numeric default null, p_daily_count_limit integer default null
)
returns table(transaction_id uuid, internal_reference text, status text, balance numeric, reused boolean)
language plpgsql security definer set search_path = '' as $$
declare
  existing public.service_transactions%rowtype;
  current_balance numeric(20,2);
  next_balance numeric(20,2);
  new_id uuid;
  used_value numeric(20,2);
  used_count integer;
begin
  if p_user_id is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{16,160}$' then raise exception 'Invalid purchase request'; end if;
  if p_reference !~ '^FND-[A-Z0-9-]{10,120}$' then raise exception 'Invalid transaction reference'; end if;
  if p_service_type not in ('data','airtime') or p_amount <= 0 or p_provider_cost < 0 or p_cashback_amount < 0 then raise exception 'Invalid purchase values'; end if;
  if char_length(trim(p_destination)) < 8 or char_length(trim(p_destination)) > 100 then raise exception 'Invalid destination'; end if;

  select * into existing from public.service_transactions where idempotency_key=p_idempotency_key for update;
  if found then
    if existing.user_id <> p_user_id then raise exception 'Idempotency key collision'; end if;
    select available_balance into current_balance from public.wallets where user_id=p_user_id;
    return query select existing.id,existing.internal_reference,existing.status,coalesce(current_balance,0),true;
    return;
  end if;

  insert into public.wallets(user_id,currency,available_balance) values(p_user_id,'NGN',0) on conflict(user_id) do nothing;
  -- The wallet row lock serialises this customer's purchases, making the limit checks below atomic.
  select available_balance into current_balance from public.wallets where user_id=p_user_id for update;

  if p_per_transaction_limit is not null and round(p_amount,2) > p_per_transaction_limit then
    raise exception 'This purchase is above your per-transaction limit';
  end if;
  if p_daily_value_limit is not null or p_daily_count_limit is not null then
    select coalesce(sum(t.amount),0), count(*) into used_value, used_count
    from public.service_transactions t
    where t.user_id=p_user_id and t.status in ('initiated','processing','pending','successful') and t.created_at >= public.lagos_day_start();
    if p_daily_value_limit is not null and used_value + round(p_amount,2) > p_daily_value_limit then
      raise exception 'This purchase would exceed your daily spending limit';
    end if;
    if p_daily_count_limit is not null and used_count + 1 > p_daily_count_limit then
      raise exception 'You have reached your daily purchase limit';
    end if;
  end if;

  if current_balance < round(p_amount,2) then raise exception 'Insufficient wallet balance'; end if;
  next_balance := current_balance-round(p_amount,2);
  insert into public.service_transactions(internal_reference,idempotency_key,user_id,service_type,product_id,provider_id,destination,amount,provider_cost,cashback_amount,status,metadata)
  values(p_reference,p_idempotency_key,p_user_id,p_service_type,p_product_id,p_provider_id,trim(p_destination),round(p_amount,2),round(p_provider_cost,2),round(p_cashback_amount,2),'processing',coalesce(p_metadata,'{}'::jsonb)) returning id into new_id;
  update public.wallets set available_balance=next_balance,updated_at=now() where user_id=p_user_id;
  insert into public.wallet_ledger_entries(user_id,entry_type,amount,currency,balance_after,reference,description,metadata)
  values(p_user_id,'debit',round(p_amount,2),'NGN',next_balance,'DEBIT-'||p_reference,'Service purchase: '||p_service_type,jsonb_build_object('transaction_id',new_id));
  insert into public.transaction_events(transaction_id,event_type,to_status,summary,actor_type,actor_id,metadata)
  values(new_id,'purchase_started','processing','Wallet debited and provider purchase started','customer',p_user_id::text,jsonb_build_object('amount',round(p_amount,2)));
  return query select new_id,p_reference,'processing',next_balance,false;
end; $$;

-- Settlement now also credits cashback (when the rewards.cashback flag is on)
-- the first time a purchase becomes successful.
create or replace function public.customer_settle_service_purchase(
  p_user_id uuid,p_transaction_id uuid,p_status text,p_summary text,p_provider_reference text default null,p_metadata jsonb default '{}'::jsonb
)
returns table(status text,balance numeric,refunded boolean)
language plpgsql security definer set search_path = '' as $$
declare
  tx public.service_transactions%rowtype;
  current_balance numeric(20,2);
  next_balance numeric(20,2);
  did_refund boolean:=false;
  cashback_on boolean;
  cashback_ledger_id uuid;
begin
  select * into tx from public.service_transactions where id=p_transaction_id for update;
  if not found or tx.user_id <> p_user_id then raise exception 'Transaction not found'; end if;
  if p_status not in ('successful','pending','failed') then raise exception 'Invalid settlement status'; end if;
  if tx.status in ('successful','reversed','refunded','cancelled') then
    select available_balance into current_balance from public.wallets where user_id=p_user_id;
    return query select tx.status,coalesce(current_balance,0),false; return;
  end if;
  if tx.status='failed' and p_status <> 'failed' then raise exception 'Failed purchase cannot be overwritten'; end if;
  if p_status='failed' then
    insert into public.wallets(user_id,currency,available_balance) values(p_user_id,'NGN',0) on conflict(user_id) do nothing;
    select available_balance into current_balance from public.wallets where user_id=p_user_id for update;
    if not exists(select 1 from public.wallet_ledger_entries where reference='REFUND-'||tx.internal_reference) then
      next_balance:=current_balance+tx.amount;
      update public.wallets set available_balance=next_balance,updated_at=now() where user_id=p_user_id;
      insert into public.wallet_ledger_entries(user_id,entry_type,amount,currency,balance_after,reference,description,metadata)
      values(p_user_id,'refund',tx.amount,'NGN',next_balance,'REFUND-'||tx.internal_reference,'Automatic refund for failed service purchase',jsonb_build_object('transaction_id',tx.id));
      did_refund:=true;
    else next_balance:=current_balance; end if;
  elsif p_status='successful' and tx.cashback_amount > 0 then
    select coalesce(bool_or(f.enabled), false) into cashback_on from public.feature_flags f where f.key='rewards.cashback';
    if cashback_on and not exists(select 1 from public.wallet_ledger_entries where reference='CASHBACK-'||tx.internal_reference) then
      select available_balance into current_balance from public.wallets where user_id=p_user_id for update;
      next_balance:=coalesce(current_balance,0)+tx.cashback_amount;
      update public.wallets set available_balance=next_balance,updated_at=now() where user_id=p_user_id;
      insert into public.wallet_ledger_entries(user_id,entry_type,amount,currency,balance_after,reference,description,metadata)
      values(p_user_id,'cashback',tx.cashback_amount,'NGN',next_balance,'CASHBACK-'||tx.internal_reference,'Cashback on service purchase',jsonb_build_object('transaction_id',tx.id))
      returning id into cashback_ledger_id;
      insert into public.cashback_awards(user_id,transaction_id,amount,status,ledger_entry_id,credited_at)
      values(p_user_id,tx.id,tx.cashback_amount,'credited',cashback_ledger_id,now())
      on conflict (transaction_id) do nothing;
    else
      select available_balance into next_balance from public.wallets where user_id=p_user_id;
    end if;
  else
    select available_balance into next_balance from public.wallets where user_id=p_user_id;
  end if;
  update public.service_transactions set status=p_status,provider_reference=coalesce(p_provider_reference,provider_reference),failure_reason=case when p_status='failed' then left(p_summary,1000) else null end,completed_at=case when p_status in ('successful','failed') then now() else null end,updated_at=now() where id=tx.id;
  insert into public.transaction_events(transaction_id,event_type,from_status,to_status,summary,actor_type,actor_id,metadata)
  values(tx.id,'provider_settlement',tx.status,p_status,left(p_summary,1000),'provider',null,coalesce(p_metadata,'{}'::jsonb));
  return query select p_status,coalesce(next_balance,0),did_refund;
end; $$;

-- ---------------------------------------------------------------------------
-- Grants: service role only.
-- ---------------------------------------------------------------------------
revoke all on function public.wallet_funding_headroom(uuid) from public, anon, authenticated;
revoke all on function public.hold_payment_for_review(text, text, uuid, uuid, text, text, text, numeric, text, jsonb) from public, anon, authenticated;
revoke all on function public.credit_bachs_wallet(text, text, text, numeric, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.credit_bachs_virtual_account_deposit(text, uuid, text, numeric, text, text, text, text, text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.admin_resolve_payment_review(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_dismiss_payment_review(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_find_user_id_by_email(text) from public, anon, authenticated;
revoke all on function public.customer_start_service_purchase(uuid,text,text,text,uuid,uuid,text,numeric,numeric,numeric,jsonb,numeric,numeric,integer) from public, anon, authenticated;
revoke all on function public.customer_settle_service_purchase(uuid,uuid,text,text,text,jsonb) from public, anon, authenticated;

grant execute on function public.wallet_funding_headroom(uuid) to service_role;
grant execute on function public.hold_payment_for_review(text, text, uuid, uuid, text, text, text, numeric, text, jsonb) to service_role;
grant execute on function public.credit_bachs_wallet(text, text, text, numeric, text, jsonb, text) to service_role;
grant execute on function public.credit_bachs_virtual_account_deposit(text, uuid, text, numeric, text, text, text, text, text, jsonb, boolean) to service_role;
grant execute on function public.admin_resolve_payment_review(uuid, uuid, uuid, text) to service_role;
grant execute on function public.admin_dismiss_payment_review(uuid, uuid, text) to service_role;
grant execute on function public.admin_find_user_id_by_email(text) to service_role;
grant execute on function public.customer_start_service_purchase(uuid,text,text,text,uuid,uuid,text,numeric,numeric,numeric,jsonb,numeric,numeric,integer) to service_role;
grant execute on function public.customer_settle_service_purchase(uuid,uuid,text,text,text,jsonb) to service_role;
