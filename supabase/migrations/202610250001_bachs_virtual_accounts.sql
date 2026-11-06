-- Bachs Virtual Accounts & flexible wallet funding amounts (removes the old 100/1000 minimum constraint)

alter table public.wallet_funding_transactions
  drop constraint if exists wallet_funding_amount;

alter table public.wallet_funding_transactions
  add constraint wallet_funding_amount check (amount > 0 and amount <= 5000000);

create table if not exists public.user_virtual_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  provider text not null default 'bachs',
  account_scope text not null default 'connected',
  bachs_account_id text unique,
  virtual_account_id text,
  account_number text,
  account_name text,
  bank_name text,
  bank_code text,
  currency text not null default 'NGN',
  status text not null default 'pending',
  status_reason text,
  transfer_reference_code text not null unique,
  known_sender_accounts text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_virtual_accounts_provider check (provider = 'bachs'),
  constraint user_virtual_accounts_scope check (account_scope in ('connected', 'platform')),
  constraint user_virtual_accounts_currency check (currency = 'NGN'),
  constraint user_virtual_accounts_status check (status in ('pending', 'active', 'inactive', 'failed'))
);

create index if not exists user_virtual_accounts_account_number_idx
  on public.user_virtual_accounts (account_number)
  where account_number is not null;

create index if not exists user_virtual_accounts_bachs_account_idx
  on public.user_virtual_accounts (bachs_account_id)
  where bachs_account_id is not null;

alter table public.user_virtual_accounts enable row level security;
alter table public.user_virtual_accounts force row level security;

revoke all on public.user_virtual_accounts from anon;
grant select on public.user_virtual_accounts to authenticated;

drop policy if exists "Users read their own virtual account" on public.user_virtual_accounts;
create policy "Users read their own virtual account"
  on public.user_virtual_accounts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop trigger if exists user_virtual_accounts_updated_at on public.user_virtual_accounts;
create trigger user_virtual_accounts_updated_at
  before update on public.user_virtual_accounts
  for each row execute procedure public.set_updated_at();

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
  p_payload jsonb default '{}'::jsonb
)
returns table(credited boolean, balance numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_funding_id uuid;
  v_balance numeric(20, 2);
  v_clean_amount numeric(20, 2);
  v_desc text;
begin
  if p_event_id is null or p_user_id is null or p_charge_id is null then
    raise exception 'Missing Bachs virtual account deposit identifiers';
  end if;

  if upper(coalesce(p_currency, '')) <> 'NGN' then
    raise exception 'Virtual account deposit currency must be NGN';
  end if;

  v_clean_amount := round(p_amount, 2);
  if v_clean_amount <= 0 then
    raise exception 'Virtual account deposit amount must be positive';
  end if;

  insert into public.payment_webhook_events (event_id, event_type, payload)
  values (p_event_id, 'collection.succeeded', coalesce(p_payload, '{}'::jsonb))
  on conflict (event_id) do nothing;

  if not found then
    select w.available_balance into v_balance
    from public.wallets w
    where w.user_id = p_user_id;
    return query select false, coalesce(v_balance, 0);
    return;
  end if;

  if exists (
    select 1 from public.wallet_funding_transactions f where f.charge_id = p_charge_id
  ) or exists (
    select 1 from public.wallet_ledger_entries l where l.reference = p_charge_id and l.entry_type = 'credit'
  ) then
    select w.available_balance into v_balance
    from public.wallets w
    where w.user_id = p_user_id;
    return query select false, coalesce(v_balance, 0);
    return;
  end if;

  begin
    insert into public.wallet_funding_transactions (
      user_id,
      provider,
      merchant_reference,
      idempotency_key,
      checkout_id,
      charge_id,
      amount,
      currency,
      status,
      provider_payload,
      credited_at
    ) values (
      p_user_id,
      'bachs',
      'funda_va_' || p_charge_id,
      'bachs_va_' || p_charge_id,
      null,
      p_charge_id,
      v_clean_amount,
      'NGN',
      'succeeded',
      coalesce(p_payload, '{}'::jsonb),
      now()
    )
    returning id into v_funding_id;
  exception
    when check_violation then
      v_funding_id := null;
  end;

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
    user_id,
    funding_transaction_id,
    entry_type,
    amount,
    currency,
    balance_after,
    reference,
    description,
    metadata
  ) values (
    p_user_id,
    v_funding_id,
    'credit',
    v_clean_amount,
    'NGN',
    v_balance,
    p_charge_id,
    v_desc,
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
    exception
      when others then
        null;
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
  exception
    when others then
      null;
  end;

  return query select true, v_balance;
end;
$$;

revoke all on function public.credit_bachs_virtual_account_deposit(text, uuid, text, numeric, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.credit_bachs_virtual_account_deposit(text, uuid, text, numeric, text, text, text, text, text, jsonb) to service_role;
