-- Live wallet funding through Bachs. Client roles can read their own wallet data but cannot credit balances.
create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency text not null default 'NGN',
  available_balance numeric(20, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallets_currency check (currency = 'NGN'),
  constraint wallets_nonnegative_balance check (available_balance >= 0)
);

create table if not exists public.wallet_funding_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'bachs',
  merchant_reference text not null unique,
  idempotency_key text not null unique,
  checkout_id text unique,
  charge_id text unique,
  amount numeric(20, 2) not null,
  currency text not null default 'NGN',
  status text not null default 'initializing',
  checkout_url text,
  failure_reason text,
  provider_payload jsonb not null default '{}'::jsonb,
  credited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_funding_provider check (provider = 'bachs'),
  constraint wallet_funding_amount check (amount between 100 and 500000),
  constraint wallet_funding_currency check (currency = 'NGN'),
  constraint wallet_funding_status check (status in ('initializing', 'pending', 'succeeded', 'failed', 'underpaid', 'expired'))
);

create index if not exists wallet_funding_user_created_idx
  on public.wallet_funding_transactions (user_id, created_at desc);

create table if not exists public.wallet_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  funding_transaction_id uuid references public.wallet_funding_transactions(id) on delete restrict,
  entry_type text not null,
  amount numeric(20, 2) not null,
  currency text not null default 'NGN',
  balance_after numeric(20, 2) not null,
  reference text not null unique,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint wallet_ledger_type check (entry_type in ('credit', 'debit', 'refund', 'cashback')),
  constraint wallet_ledger_amount check (amount > 0),
  constraint wallet_ledger_currency check (currency = 'NGN')
);

create index if not exists wallet_ledger_user_created_idx
  on public.wallet_ledger_entries (user_id, created_at desc);

create table if not exists public.payment_webhook_events (
  event_id text primary key,
  provider text not null default 'bachs',
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now(),
  constraint payment_webhook_provider check (provider = 'bachs')
);

alter table public.wallets enable row level security;
alter table public.wallets force row level security;
alter table public.wallet_funding_transactions enable row level security;
alter table public.wallet_funding_transactions force row level security;
alter table public.wallet_ledger_entries enable row level security;
alter table public.wallet_ledger_entries force row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.payment_webhook_events force row level security;

revoke all on public.wallets, public.wallet_funding_transactions, public.wallet_ledger_entries, public.payment_webhook_events from anon;
grant select on public.wallets, public.wallet_funding_transactions, public.wallet_ledger_entries to authenticated;

drop policy if exists "Users read their own wallet" on public.wallets;
create policy "Users read their own wallet" on public.wallets for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users read their own funding" on public.wallet_funding_transactions;
create policy "Users read their own funding" on public.wallet_funding_transactions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users read their own ledger" on public.wallet_ledger_entries;
create policy "Users read their own ledger" on public.wallet_ledger_entries for select to authenticated
  using ((select auth.uid()) = user_id);

drop trigger if exists wallets_updated_at on public.wallets;
create trigger wallets_updated_at before update on public.wallets
for each row execute procedure public.set_updated_at();

drop trigger if exists wallet_funding_updated_at on public.wallet_funding_transactions;
create trigger wallet_funding_updated_at before update on public.wallet_funding_transactions
for each row execute procedure public.set_updated_at();

create or replace function public.credit_bachs_wallet(
  p_event_id text,
  p_checkout_id text,
  p_charge_id text,
  p_amount numeric,
  p_currency text,
  p_payload jsonb
)
returns table(credited boolean, balance numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_funding public.wallet_funding_transactions%rowtype;
  v_balance numeric(20, 2);
begin
  if p_event_id is null or p_checkout_id is null or p_charge_id is null then
    raise exception 'Missing Bachs payment identifiers';
  end if;

  insert into public.payment_webhook_events (event_id, event_type, payload)
  values (p_event_id, 'collection.succeeded', p_payload)
  on conflict (event_id) do nothing;

  if not found then
    select w.available_balance into v_balance
    from public.wallet_funding_transactions f
    join public.wallets w on w.user_id = f.user_id
    where f.checkout_id = p_checkout_id;
    return query select false, coalesce(v_balance, 0);
    return;
  end if;

  select * into v_funding
  from public.wallet_funding_transactions
  where checkout_id = p_checkout_id
  for update;

  if not found then raise exception 'Unknown Bachs checkout'; end if;
  if v_funding.currency <> upper(p_currency) then raise exception 'Payment currency mismatch'; end if;
  if v_funding.amount <> round(p_amount, 2) then raise exception 'Payment amount mismatch'; end if;

  if v_funding.status = 'succeeded' then
    select available_balance into v_balance from public.wallets where user_id = v_funding.user_id;
    return query select false, coalesce(v_balance, 0);
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
    v_balance, p_charge_id, 'Wallet funding via Bachs', jsonb_build_object('event_id', p_event_id, 'checkout_id', p_checkout_id)
  );

  update public.wallet_funding_transactions
  set status = 'succeeded', charge_id = p_charge_id, provider_payload = p_payload, credited_at = now()
  where id = v_funding.id;

  return query select true, v_balance;
end;
$$;

revoke all on function public.credit_bachs_wallet(text, text, text, numeric, text, jsonb) from public, anon, authenticated;
grant execute on function public.credit_bachs_wallet(text, text, text, numeric, text, jsonb) to service_role;

insert into public.wallets (user_id)
select id from auth.users
on conflict (user_id) do nothing;
