-- One-time bank transfer accounts are issued by Bachs inside a bank-transfer
-- checkout. collection.succeeded then carries data.status:
--   SUCCEEDED  exact amount collected            -> credit
--   OVERPAID   more than due arrived             -> credit the amount due, hold the extra for review
--   ACCEPTED   accepted on other terms than asked -> hold for review (amount needs a human check)
-- A short bank transfer never completes the checkout, so no event is sent for it.

alter table public.payment_review_queue drop constraint if exists payment_review_reason;
alter table public.payment_review_queue add constraint payment_review_reason check (reason in (
  'unmatched_deposit', 'sender_match_unconfirmed', 'amount_mismatch', 'currency_mismatch',
  'underpaid', 'overpaid', 'accepted_other_terms', 'funding_limit', 'wallet_restricted', 'amount_too_large'
));

drop function if exists public.credit_bachs_wallet(text, text, text, numeric, text, jsonb, text);

create or replace function public.credit_bachs_wallet(
  p_event_id text,
  p_checkout_id text,
  p_charge_id text,
  p_amount numeric,
  p_currency text,
  p_payload jsonb,
  p_event_type text default 'collection.succeeded',
  p_charge_status text default null,
  p_overpaid_amount numeric default null
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
  v_status text := upper(coalesce(p_charge_status, 'SUCCEEDED'));
begin
  if p_event_id is null or p_checkout_id is null or p_charge_id is null then
    raise exception 'Missing Bachs payment identifiers';
  end if;

  select * into v_funding
  from public.wallet_funding_transactions
  where checkout_id = p_checkout_id
  for update;

  -- Not one of our wallet checkouts; deliberately not recorded so the caller can process it elsewhere.
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
    when v_status = 'ACCEPTED' then 'accepted_other_terms'
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

  -- Deduct flat 10 NGN Bachs transfer fee
  insert into public.wallets (user_id, currency, available_balance)
  values (v_funding.user_id, 'NGN', greatest(v_funding.amount - 10.00, 0))
  on conflict (user_id) do update
    set available_balance = public.wallets.available_balance + excluded.available_balance,
        updated_at = now()
  returning available_balance into v_balance;

  insert into public.wallet_ledger_entries (
    user_id, funding_transaction_id, entry_type, amount, currency,
    balance_after, reference, description, metadata
  ) values (
    v_funding.user_id, v_funding.id, 'credit', greatest(v_funding.amount - 10.00, 0), v_funding.currency,
    v_balance, p_charge_id, 'Wallet funding via Bachs', jsonb_build_object('event_id', p_event_id, 'checkout_id', p_checkout_id, 'channel', 'checkout', 'gross_amount', v_funding.amount, 'fee', 10.00)
  );

  update public.wallet_funding_transactions
  set status = 'succeeded', charge_id = p_charge_id, provider_payload = p_payload, credited_at = now(), failure_reason = null
  where id = v_funding.id;

  -- The extra money is the customer's; an operator credits or refunds it. Its own charge
  -- reference keeps it separate from the credit above.
  if v_status = 'OVERPAID' and coalesce(p_overpaid_amount, 0) > 0 then
    perform public.hold_payment_for_review(
      p_event_id || ':overpaid', p_event_type, v_funding.user_id, null, 'overpaid',
      p_charge_id || ':overpaid', p_checkout_id, p_overpaid_amount, p_currency, p_payload
    );
  end if;

  return query select 'credited'::text, v_balance;
end;
$$;

revoke all on function public.credit_bachs_wallet(text, text, text, numeric, text, jsonb, text, text, numeric) from public, anon, authenticated;
grant execute on function public.credit_bachs_wallet(text, text, text, numeric, text, jsonb, text, text, numeric) to service_role;
