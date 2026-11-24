-- Recharge cards are bearer value. Debit, delivery evidence and settlement must agree.
create table if not exists public.recharge_card_catalogue (
  id uuid primary key default gen_random_uuid(),
  network text not null check(network in ('mtn','airtel','glo','9mobile')),
  denomination integer not null check(denomination in (100,200,500,1000)),
  provider_id uuid not null references public.provider_registry(id) on delete restrict,
  unit_cost numeric(20,2) not null check(unit_cost>0),
  max_quantity integer not null default 20 check(max_quantity between 1 and 20),
  is_active boolean not null default false,
  verified_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(network,denomination,provider_id)
);
alter table public.recharge_card_catalogue enable row level security;
alter table public.recharge_card_catalogue force row level security;
revoke all on public.recharge_card_catalogue from public,anon,authenticated;
grant all on public.recharge_card_catalogue to service_role;

create table if not exists public.recharge_card_pin_claims (
  pin_hash text primary key check (pin_hash ~ '^[a-f0-9]{64}$'),
  transaction_id uuid not null references public.service_transactions(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists recharge_card_claims_transaction_idx on public.recharge_card_pin_claims(transaction_id);
alter table public.recharge_card_pin_claims enable row level security;
alter table public.recharge_card_pin_claims force row level security;
revoke all on public.recharge_card_pin_claims from public, anon, authenticated;
grant all on public.recharge_card_pin_claims to service_role;

create index if not exists recharge_card_operations_idx on public.service_transactions(created_at desc, status)
  where service_type = 'airtime' and metadata->>'mode' = 'epin';

-- amount is the actual wallet debit. For this pipeline discount_amount is the
-- saving already deducted from face value, and must not be expensed twice.
alter table public.service_transactions drop column if exists gross_margin;
alter table public.service_transactions add column gross_margin numeric(20,2) generated always as (
  amount + platform_fee - provider_cost - cashback_amount -
  case when metadata->>'mode' = 'epin' then 0 else discount_amount end
) stored;

create or replace function public.customer_start_recharge_card_purchase(
  p_user_id uuid, p_idempotency_key text, p_reference text, p_provider_id uuid,
  p_snapshot jsonb, p_provider_cost numeric, p_limits jsonb default '{}'::jsonb
)
returns table(transaction_id uuid, internal_reference text, status text, balance numeric, reused boolean)
language plpgsql security definer set search_path = '' as $$
declare
  started record;
  previous public.service_transactions%rowtype;
  face_value numeric;
  payable numeric;
  saving numeric;
  reward numeric;
  quantity integer;
  denomination integer;
  meta jsonb;
  controls record;
  offer public.recharge_card_catalogue%rowtype;
begin
  if p_user_id is null or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{16,160}$' then raise exception 'Invalid purchase request'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key, 0));
  select * into previous from public.service_transactions where idempotency_key = p_idempotency_key for update;
  if found then
    if previous.user_id <> p_user_id or previous.metadata->>'requestFingerprint' is distinct from p_snapshot->>'requestFingerprint' then raise exception 'Idempotency key belongs to a different purchase'; end if;
    return query select previous.id, previous.internal_reference, previous.status, coalesce(w.available_balance,0), true from public.wallets w where w.user_id = p_user_id;
    return;
  end if;
  quantity := (p_snapshot->>'quantity')::integer;
  denomination := (p_snapshot->>'denomination')::integer;
  if quantity is null or quantity not between 1 and 20 or denomination is null or denomination not in (100,200,500,1000)
     or coalesce(p_snapshot->>'network','') not in ('mtn','airtel','glo','9mobile')
     or coalesce(p_snapshot->>'requestFingerprint','') !~ '^[a-f0-9]{64}$'
     or coalesce(p_snapshot->>'quoteId','') !~ '^[a-f0-9]{64}$'
     or coalesce((p_snapshot->>'discountPercentage')::numeric,-1) not between 0 and 99.99
     or coalesce((p_snapshot->>'cashbackPercentage')::numeric,-1) not between 0 and 100 then raise exception 'Invalid recharge-card purchase'; end if;
  face_value := denomination * quantity;
  saving := round(face_value * (p_snapshot->>'discountPercentage')::numeric / 100, 2);
  payable := face_value - saving;
  reward := round(payable * (p_snapshot->>'cashbackPercentage')::numeric / 100, 2);
  if payable <= 0 or payable is distinct from (p_snapshot->>'payable')::numeric or reward is distinct from (p_snapshot->>'cashback')::numeric or p_provider_cost is null or p_provider_cost<=0 then raise exception 'Recharge-card quote changed'; end if;
  select account_status,wallet_status into controls from public.customer_account_controls where user_id=p_user_id for update;
  if found and (controls.account_status<>'active' or controls.wallet_status in ('frozen','debits_blocked')) then raise exception 'This account or wallet is restricted'; end if;
  perform 1 from public.feature_flags where key='rewards.cashback' for share;
  perform 1 from public.airtime_provider_routes r join public.provider_registry p on p.id=p_provider_id and p.slug=r.primary_provider
    where r.id=(p_snapshot->>'ruleId')::uuid and r.is_active and r.primary_provider='maskawasub'
    and r.network in ('all',p_snapshot->>'network') and r.mode in ('all','epin')
    and r.min_amount<=face_value and r.max_amount>=face_value and r.discount_percentage=(p_snapshot->>'discountPercentage')::numeric
    and (case when exists(select 1 from public.feature_flags f where f.key='rewards.cashback' and f.enabled) then r.cashback_percentage else 0 end)=(p_snapshot->>'cashbackPercentage')::numeric
    and p.status in ('operational','degraded') and p.environment='live' for share of r,p;
  if not found then raise exception 'Recharge-card route changed or is unavailable. Refresh the quote'; end if;
  select * into offer from public.recharge_card_catalogue where id=(p_snapshot->>'catalogueId')::uuid for share;
  if not found or not offer.is_active or offer.network<>p_snapshot->>'network' or offer.denomination<>denomination or offer.provider_id<>p_provider_id or quantity>offer.max_quantity or p_provider_cost<>round(offer.unit_cost*quantity,2) then raise exception 'Recharge-card provider pricing changed or is unavailable'; end if;
  if payable-reward-p_provider_cost<0 then raise exception 'Recharge-card pricing is below the verified provider cost'; end if;
  if exists(select 1 from public.service_transactions where metadata->>'mode'='epin' and metadata->>'pinClaimsVersion' is null) then raise exception 'Recharge-card inventory is being reconciled. Try again shortly'; end if;
  meta := p_snapshot || jsonb_build_object('mode','epin','pipelineVersion',2,'pinClaimsVersion',2,'unitAmount',denomination,'faceValue',face_value,'discount',saving,'pinCount',0,'deliveryStatus','awaiting_provider','provider_cost_source','catalogue');
  select * into started from public.customer_start_service_purchase_v2(
    p_user_id,p_idempotency_key,p_reference,'airtime',null,p_provider_id,
    upper(p_snapshot->>'network') || ' recharge cards (' || quantity || ' x ' || denomination || ')',
    payable,p_provider_cost,reward,meta,
    (p_limits->>'perTransaction')::numeric,(p_limits->>'dailyValue')::numeric,(p_limits->>'dailyCount')::integer
  );
  update public.service_transactions set discount_amount = saving where id = started.transaction_id;
  insert into public.provider_attempts(transaction_id,provider_id,attempt_number,outcome,request_redacted)
    values(started.transaction_id,p_provider_id,1,'processing',jsonb_build_object('stage','reserved','network',p_snapshot->>'network','denomination',denomination,'quantity',quantity,'faceValue',face_value));
  -- Persist recovery before any external purchase call, including a process crash.
  insert into public.admin_job_queue(job_type,idempotency_key,payload,run_at)
    values('provider.requery','provider.requery:' || started.transaction_id || ':initial',jsonb_build_object('transactionId',started.transaction_id),now() + interval '2 minutes')
    on conflict(idempotency_key) do nothing;
  return query select started.transaction_id, started.internal_reference, started.status, started.balance, started.reused;
end; $$;

create or replace function public.complete_recharge_card_purchase(
  p_transaction_id uuid, p_provider_id uuid, p_status text, p_summary text,
  p_provider_reference text default null, p_encrypted_pins text default null,
  p_pin_hashes text[] default '{}', p_delivery_issue text default null, p_actor_id text default null
)
returns table(status text,balance numeric,refunded boolean)
language plpgsql security definer set search_path = '' as $$
declare
  tx public.service_transactions%rowtype;
  expected integer;
  held integer;
  issue text := p_delivery_issue;
  next_status text := 'pending';
  delivery text := 'awaiting_provider';
  settled record;
  next_balance numeric;
  reward_ledger uuid;
  hashes text[] := coalesce(p_pin_hashes,'{}');
begin
  select * into tx from public.service_transactions where id = p_transaction_id for update;
  if not found or tx.metadata->>'mode' is distinct from 'epin' then raise exception 'Recharge-card purchase not found'; end if;
  if p_status not in ('successful','pending','failed') or p_status is null then raise exception 'Invalid recharge-card settlement'; end if;
  if p_provider_id is distinct from tx.provider_id then raise exception 'Provider does not match this purchase'; end if;
  if tx.status in ('successful','failed','refunded','reversed','cancelled') and not (tx.status='successful' and coalesce(tx.metadata->>'pipelineVersion','1')<>'2' and tx.metadata->>'deliveryStatus' is distinct from 'ready' and p_status='successful') then
    if tx.status in ('failed','refunded','reversed','cancelled') and (p_status='successful' or cardinality(hashes)>0) then
      if cardinality(hashes) between 1 and 20 and coalesce(p_encrypted_pins,'') like 'v1.%' and not exists(select 1 from unnest(hashes) h where h is null or h !~ '^[a-f0-9]{64}$') then
        insert into public.recharge_card_pin_claims(pin_hash,transaction_id) select distinct h,tx.id from unnest(hashes) h on conflict(pin_hash) do nothing;
        update public.service_transactions set metadata=metadata || jsonb_build_object('late_pins_encrypted',p_encrypted_pins,'latePinCount',cardinality(hashes),'deliveryStatus','late_delivery_conflict','reconciliationIssue','late_delivery'),updated_at=now() where id=tx.id;
      else update public.service_transactions set metadata=metadata || jsonb_build_object('deliveryStatus','late_delivery_conflict','reconciliationIssue','late_delivery'),updated_at=now() where id=tx.id; end if;
      insert into public.transaction_events(transaction_id,event_type,summary,actor_type,metadata) values(tx.id,'recharge_terminal_conflict','Provider delivery contradicted a final refund. No customer wallet was debited again.','provider',jsonb_build_object('providerReference',p_provider_reference));
    elsif tx.status='successful' and p_status='failed' then
      update public.service_transactions set metadata=metadata || jsonb_build_object('reconciliationIssue','provider_status_conflict'),updated_at=now() where id=tx.id;
      insert into public.transaction_events(transaction_id,event_type,summary,actor_type) values(tx.id,'recharge_terminal_conflict','Provider failure contradicted an already verified delivery. No refund was issued.','provider');
    end if;
    return query select tx.status,coalesce(w.available_balance,0),false from public.wallets w where w.user_id=tx.user_id;
    return;
  end if;
  expected := (tx.metadata->>'quantity')::integer;
  if expected is null or expected not between 1 and 20 then raise exception 'Invalid expected PIN quantity'; end if;
  if cardinality(hashes) > 20 or exists(select 1 from unnest(hashes) h where h is null or h !~ '^[a-f0-9]{64}$') then raise exception 'Invalid PIN fingerprints'; end if;
  if cardinality(hashes) > 0 then
    if p_encrypted_pins is null or p_encrypted_pins not like 'v1.%' then raise exception 'Encrypted PIN storage is required'; end if;
    if cardinality(hashes) <> (select count(distinct h) from unnest(hashes) h) then issue := 'duplicate_pin_batch'; end if;
    insert into public.recharge_card_pin_claims(pin_hash,transaction_id) select distinct h,tx.id from unnest(hashes) h on conflict(pin_hash) do nothing;
    select count(*) into held from public.recharge_card_pin_claims c where c.transaction_id=tx.id and c.pin_hash=any(hashes);
    if held <> cardinality(hashes) then issue := 'pin_conflict'; end if;
  else held := coalesce((tx.metadata->>'pinCount')::integer,0); end if;

  if p_status='successful' and issue is null and cardinality(hashes)=expected and held=expected then
    next_status := 'successful'; delivery := 'ready';
  elsif p_status='failed' and cardinality(hashes)=0 and held=0 and issue is null then
    next_status := 'failed'; delivery := 'refunded';
  else
    delivery := coalesce(issue,case when held > 0 then 'partial_pin_batch' when p_status='successful' then 'missing_pin_batch' else 'awaiting_provider' end);
  end if;
  update public.service_transactions set
    metadata = metadata || jsonb_build_object('deliveryStatus',delivery,'pinCount',held,'lastRecoveryAt',now())
      || case when cardinality(hashes)>0 then jsonb_build_object('pins_encrypted',p_encrypted_pins,'pinHashes',to_jsonb(hashes),'receivedPinCount',cardinality(hashes)) else '{}'::jsonb end,
    provider_reference=coalesce(p_provider_reference,provider_reference),updated_at=now()
    where id=tx.id;
  select * into settled from public.customer_settle_service_purchase(tx.user_id,tx.id,next_status,left(p_summary,1000),p_provider_reference,jsonb_build_object('mode','epin','deliveryStatus',delivery,'pinCount',held,'actorId',p_actor_id));
  -- Honour the cashback committed at checkout even if the feature flag changed
  -- while this order was awaiting provider recovery. The ledger key is unique.
  if settled.status='successful' and tx.cashback_amount>0 and not exists(select 1 from public.wallet_ledger_entries where reference='CASHBACK-' || tx.internal_reference) then
    select available_balance into next_balance from public.wallets where user_id=tx.user_id for update;
    next_balance := next_balance + tx.cashback_amount;
    update public.wallets set available_balance=next_balance,updated_at=now() where user_id=tx.user_id;
    insert into public.wallet_ledger_entries(user_id,entry_type,amount,currency,balance_after,reference,description,metadata)
      values(tx.user_id,'cashback',tx.cashback_amount,'NGN',next_balance,'CASHBACK-' || tx.internal_reference,'Cashback on recharge cards',jsonb_build_object('transaction_id',tx.id)) returning id into reward_ledger;
    insert into public.cashback_awards(user_id,transaction_id,amount,status,ledger_entry_id,credited_at)
      values(tx.user_id,tx.id,tx.cashback_amount,'credited',reward_ledger,now()) on conflict(transaction_id) do nothing;
  else select available_balance into next_balance from public.wallets where user_id=tx.user_id; end if;
  if p_actor_id is not null then
    insert into public.transaction_events(transaction_id,event_type,from_status,to_status,summary,actor_type,actor_id,metadata)
      values(tx.id,'recharge_card_resolution',tx.status,settled.status,left(p_summary,1000),'admin',p_actor_id,jsonb_build_object('deliveryStatus',delivery,'pinCount',held));
  end if;
  insert into public.admin_job_queue(job_type,idempotency_key,payload)
    values('purchase.receipt','purchase.receipt:' || tx.id || ':' || settled.status,jsonb_build_object('transactionId',tx.id,'status',settled.status)) on conflict(idempotency_key) do nothing;
  return query select settled.status,coalesce(next_balance,0),settled.refunded;
end; $$;

-- Generic status tools cannot bypass delivery verification or manufacture a
-- refund for PINs that have already been issued. Actual reversals use finance approvals.
create or replace function public.guard_recharge_card_status()
returns trigger language plpgsql set search_path = '' as $$
declare valid_count integer;
begin
  if new.metadata->>'mode'='epin' and new.status is distinct from old.status then
    if old.status in ('successful','failed','refunded','reversed','cancelled') then raise exception 'Recharge-card terminal status cannot be overwritten'; end if;
    if new.status='successful' then
      select count(*) into valid_count from public.recharge_card_pin_claims c where c.transaction_id=new.id and c.pin_hash in (select jsonb_array_elements_text(coalesce(new.metadata->'pinHashes','[]'::jsonb)));
      if new.metadata->>'deliveryStatus' is distinct from 'ready' or coalesce(new.metadata->>'pins_encrypted','') not like 'v1.%' or valid_count <> coalesce((new.metadata->>'quantity')::integer,0) or valid_count=0 then raise exception 'A complete verified PIN batch is required before success'; end if;
    elsif new.status in ('failed','refunded','reversed','cancelled') and (coalesce((new.metadata->>'pinCount')::integer,0)>0 or coalesce((old.metadata->>'pinCount')::integer,0)>0) then
      raise exception 'Issued PINs require provider revocation and an independently approved finance resolution';
    elsif new.status='failed' and new.metadata->>'deliveryStatus' is distinct from 'refunded' then
      raise exception 'Recharge-card failure requires confirmed provider non-delivery';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists recharge_card_status_guard on public.service_transactions;
create trigger recharge_card_status_guard before update on public.service_transactions for each row execute function public.guard_recharge_card_status();

create or replace function public.guard_airtime_route()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('airtime_provider_routes',0));
  if new.min_amount>new.max_amount or new.discount_percentage<0 or new.discount_percentage>=100 or new.cashback_percentage not between 0 and 100 then raise exception 'Invalid airtime routing range or reward'; end if;
  if new.primary_provider=new.fallback_provider then raise exception 'Primary and fallback providers must differ'; end if;
  if new.is_active and new.mode='epin' and (new.primary_provider<>'maskawasub' or new.fallback_provider is not null) then raise exception 'Recharge cards require a supported PIN provider; top-up adapters cannot be used'; end if;
  if new.is_active and exists(select 1 from public.airtime_provider_routes r where r.id<>new.id and r.is_active and r.network=new.network and r.mode=new.mode and r.priority=new.priority and r.min_amount<=new.max_amount and r.max_amount>=new.min_amount) then raise exception 'An active rule with the same scope and priority overlaps this amount range'; end if;
  return new;
end; $$;
drop trigger if exists airtime_route_guard on public.airtime_provider_routes;
create trigger airtime_route_guard before insert or update on public.airtime_provider_routes for each row execute function public.guard_airtime_route();

-- Operations/reporting never receives decrypted PINs, encrypted blobs or hashes.
create or replace view public.recharge_card_operations as
select t.id,t.internal_reference,t.provider_reference,t.user_id,t.provider_id,t.status,t.created_at,t.completed_at,
  t.amount,t.discount_amount,t.cashback_amount,t.provider_cost,t.gross_margin,
  t.metadata->>'network' as network,t.metadata->>'cardName' as card_name,
  coalesce((t.metadata->>'quantity')::integer,1) as quantity,
  coalesce((t.metadata->>'unitAmount')::numeric,t.amount) as denomination,
  coalesce((t.metadata->>'faceValue')::numeric,t.amount+t.discount_amount) as face_value,
  coalesce((t.metadata->>'pinCount')::integer,0) as pin_count,
  coalesce(t.metadata->>'deliveryStatus',case when t.status='successful' then 'ready' when t.status='failed' then 'refunded' else 'awaiting_provider' end) as delivery_status,
  t.metadata->>'provider_cost_source' as cost_source,t.failure_reason,t.updated_at,t.metadata->>'reconciliationIssue' as reconciliation_issue
from public.service_transactions t where t.service_type='airtime' and t.metadata->>'mode'='epin';
revoke all on public.recharge_card_operations from public,anon,authenticated;
grant select on public.recharge_card_operations to service_role;

create or replace function public.recharge_card_summary(p_since timestamptz,p_until timestamptz)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('orders',count(*),'ready',count(*) filter(where status='successful' and delivery_status='ready'),
    'pending',count(*) filter(where status in ('pending','processing','initiated')),
    'review',count(*) filter(where reconciliation_issue is not null or (status not in ('failed','refunded','reversed','cancelled') and delivery_status not in ('ready','awaiting_provider'))),
    'refunded',count(*) filter(where status in ('failed','refunded','reversed')),
    'pins',coalesce(sum(quantity) filter(where status='successful' and delivery_status='ready'),0),
    'sales',coalesce(sum(amount) filter(where status='successful' and delivery_status='ready'),0),
    'savings',coalesce(sum(discount_amount) filter(where status='successful' and delivery_status='ready'),0),
    'cashback',coalesce(sum(cashback_amount) filter(where status='successful' and delivery_status='ready'),0),
    'margin',coalesce(sum(gross_margin) filter(where status='successful' and delivery_status='ready'),0),
    'held',coalesce(sum(amount) filter(where status in ('pending','processing','initiated')),0))
  from public.recharge_card_operations where created_at>=p_since and created_at<p_until;
$$;
revoke all on function public.customer_start_recharge_card_purchase(uuid,text,text,uuid,jsonb,numeric,jsonb) from public,anon,authenticated;
revoke all on function public.complete_recharge_card_purchase(uuid,uuid,text,text,text,text,text[],text,text) from public,anon,authenticated;
revoke all on function public.recharge_card_summary(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.customer_start_recharge_card_purchase(uuid,text,text,uuid,jsonb,numeric,jsonb) to service_role;
grant execute on function public.complete_recharge_card_purchase(uuid,uuid,text,text,text,text,text[],text,text) to service_role;
grant execute on function public.recharge_card_summary(timestamptz,timestamptz) to service_role;

create or replace function public.customer_cashback_total(p_user_id uuid)
returns numeric language sql stable security definer set search_path='' as $$
  select coalesce(sum(amount),0) from public.cashback_awards where user_id=p_user_id and status='credited';
$$;
revoke all on function public.customer_cashback_total(uuid) from public,anon,authenticated;
grant execute on function public.customer_cashback_total(uuid) to service_role;

-- Backfill historical PIN ownership before accepting new generation requests.
-- The worker decrypts/validates old batches; SQL never receives a plaintext PIN.
create or replace function public.register_legacy_recharge_pins(p_transaction_id uuid,p_encrypted_pins text,p_pin_hashes text[],p_issue text default null)
returns void language plpgsql security definer set search_path='' as $$
declare tx public.service_transactions%rowtype; held integer; delivery text; hashes text[]:=coalesce(p_pin_hashes,'{}');
begin
  select * into tx from public.service_transactions where id=p_transaction_id for update;
  if not found or tx.metadata->>'mode' is distinct from 'epin' then raise exception 'Recharge-card order not found'; end if;
  if tx.metadata->>'pinClaimsVersion' is not null then return; end if;
  if cardinality(hashes)>20 or exists(select 1 from unnest(hashes) h where h is null or h !~ '^[a-f0-9]{64}$') or (cardinality(hashes)>0 and coalesce(p_encrypted_pins,'') not like 'v1.%') then raise exception 'Invalid encrypted legacy batch'; end if;
  insert into public.recharge_card_pin_claims(pin_hash,transaction_id) select distinct h,tx.id from unnest(hashes) h on conflict(pin_hash) do nothing;
  select count(*) into held from public.recharge_card_pin_claims where transaction_id=tx.id and pin_hash=any(hashes);
  delivery := case when held<>cardinality(hashes) then 'pin_conflict' when p_issue is not null then p_issue when tx.status='successful' and held=coalesce((tx.metadata->>'quantity')::integer,0) and held>0 then 'ready' when tx.status in ('failed','refunded','reversed','cancelled') then 'refunded' else 'manual_recovery' end;
  update public.service_transactions set metadata=(metadata-'pins') || jsonb_build_object('pinClaimsVersion',1,'pinCount',held,'deliveryStatus',delivery,'pinHashes',to_jsonb(hashes)) || case when p_encrypted_pins is not null then jsonb_build_object('pins_encrypted',p_encrypted_pins) else '{}'::jsonb end,updated_at=now() where id=tx.id;
  insert into public.transaction_events(transaction_id,event_type,summary,actor_type,metadata) values(tx.id,'recharge_inventory_reconciled','Historical recharge-card PIN ownership checked.','system',jsonb_build_object('deliveryStatus',delivery,'pinCount',held));
end; $$;
revoke all on function public.register_legacy_recharge_pins(uuid,text,text[],text) from public,anon,authenticated;
grant execute on function public.register_legacy_recharge_pins(uuid,text,text[],text) to service_role;
insert into public.admin_job_queue(job_type,idempotency_key,payload) values('recharge.backfill_claims','recharge.backfill_claims:initial','{}') on conflict(idempotency_key) do nothing;

create or replace function public.record_recharge_provider_cost(p_transaction_id uuid,p_cost numeric,p_statement_reference text,p_reason text,p_actor_id text)
returns void language plpgsql security definer set search_path='' as $$
declare tx public.service_transactions%rowtype;
begin
  if p_cost is null or p_cost<0 or p_cost>500000 or char_length(trim(p_statement_reference)) not between 1 and 200 or char_length(trim(p_reason)) not between 10 and 1000 then raise exception 'Invalid provider statement evidence'; end if;
  select * into tx from public.service_transactions where id=p_transaction_id for update;
  if not found or tx.metadata->>'mode' is distinct from 'epin' then raise exception 'Recharge-card order not found'; end if;
  update public.service_transactions set provider_cost=round(p_cost,2),metadata=metadata || jsonb_build_object('provider_cost_source','provider_statement','providerStatementReference',p_statement_reference,'providerCostReconciledAt',now()),updated_at=now() where id=tx.id;
  insert into public.transaction_events(transaction_id,event_type,summary,actor_type,actor_id,metadata)
    values(tx.id,'provider_cost_reconciled',left(p_reason,1000),'admin',p_actor_id,jsonb_build_object('previousCost',tx.provider_cost,'actualCost',round(p_cost,2),'statementReference',p_statement_reference));
end; $$;
revoke all on function public.record_recharge_provider_cost(uuid,numeric,text,text,text) from public,anon,authenticated;
grant execute on function public.record_recharge_provider_cost(uuid,numeric,text,text,text) to service_role;

create or replace function public.close_recharge_investigation(p_transaction_id uuid,p_evidence_reference text,p_reason text,p_actor_id text)
returns void language plpgsql security definer set search_path='' as $$
declare tx public.service_transactions%rowtype;
begin
  if char_length(trim(p_evidence_reference)) not between 1 and 200 or char_length(trim(p_reason)) not between 10 and 1000 then raise exception 'Provider closure evidence is required'; end if;
  select * into tx from public.service_transactions where id=p_transaction_id for update;
  if not found or tx.metadata->>'mode' is distinct from 'epin' or tx.metadata->>'reconciliationIssue' is null then raise exception 'Open provider conflict not found'; end if;
  update public.service_transactions set metadata=(metadata-'reconciliationIssue') || jsonb_build_object('investigationClosedAt',now(),'investigationEvidence',p_evidence_reference,'deliveryStatus',case when metadata->>'deliveryStatus'='late_delivery_conflict' then 'refunded' else metadata->>'deliveryStatus' end),updated_at=now() where id=tx.id;
  insert into public.transaction_events(transaction_id,event_type,summary,actor_type,actor_id,metadata) values(tx.id,'recharge_investigation_closed',left(p_reason,1000),'admin',p_actor_id,jsonb_build_object('evidenceReference',p_evidence_reference,'previousIssue',tx.metadata->>'reconciliationIssue'));
end; $$;
revoke all on function public.close_recharge_investigation(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.close_recharge_investigation(uuid,text,text,text) to service_role;
