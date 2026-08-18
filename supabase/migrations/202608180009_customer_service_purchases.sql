-- Phase 4: atomic customer service purchases. The server passes an already
-- validated product/route; this migration owns the wallet debit and reversal.

create or replace function public.customer_start_service_purchase(
  p_user_id uuid, p_idempotency_key text, p_reference text, p_service_type text,
  p_product_id uuid, p_provider_id uuid, p_destination text, p_amount numeric,
  p_provider_cost numeric, p_cashback_amount numeric, p_metadata jsonb default '{}'::jsonb
)
returns table(transaction_id uuid, internal_reference text, status text, balance numeric, reused boolean)
language plpgsql security definer set search_path = '' as $$
declare existing public.service_transactions%rowtype; current_balance numeric(20,2); next_balance numeric(20,2); new_id uuid;
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
  select available_balance into current_balance from public.wallets where user_id=p_user_id for update;
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

create or replace function public.customer_settle_service_purchase(
  p_user_id uuid,p_transaction_id uuid,p_status text,p_summary text,p_provider_reference text default null,p_metadata jsonb default '{}'::jsonb
)
returns table(status text,balance numeric,refunded boolean)
language plpgsql security definer set search_path = '' as $$
declare tx public.service_transactions%rowtype; current_balance numeric(20,2); next_balance numeric(20,2); did_refund boolean:=false;
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
  else
    select available_balance into next_balance from public.wallets where user_id=p_user_id;
  end if;
  update public.service_transactions set status=p_status,provider_reference=coalesce(p_provider_reference,provider_reference),failure_reason=case when p_status='failed' then left(p_summary,1000) else null end,completed_at=case when p_status in ('successful','failed') then now() else null end,updated_at=now() where id=tx.id;
  insert into public.transaction_events(transaction_id,event_type,from_status,to_status,summary,actor_type,actor_id,metadata)
  values(tx.id,'provider_settlement',tx.status,p_status,left(p_summary,1000),'provider',null,coalesce(p_metadata,'{}'::jsonb));
  return query select p_status,coalesce(next_balance,0),did_refund;
end; $$;

revoke all on function public.customer_start_service_purchase(uuid,text,text,text,uuid,uuid,text,numeric,numeric,numeric,jsonb),public.customer_settle_service_purchase(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.customer_start_service_purchase(uuid,text,text,text,uuid,uuid,text,numeric,numeric,numeric,jsonb),public.customer_settle_service_purchase(uuid,uuid,text,text,text,jsonb) to service_role;

grant select on public.service_transactions to authenticated;
drop policy if exists customer_read_own_service_transactions on public.service_transactions;
create policy customer_read_own_service_transactions on public.service_transactions for select to authenticated using ((select auth.uid()) = user_id);
