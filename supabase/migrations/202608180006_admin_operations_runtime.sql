-- Phase 2: durable operational runtime for Funda Admin.

create table if not exists public.service_networks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  brand_color text,
  logo_url text,
  availability text not null default 'operational',
  maintenance_message text,
  service_types text[] not null default '{}',
  purchase_limit numeric(20,2),
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint service_network_availability check (availability in ('operational','degraded','maintenance','disabled')),
  constraint service_network_slug check (slug ~ '^[a-z0-9-]{2,50}$')
);

create table if not exists public.admin_security_events (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.admin_users(id) on delete set null,
  event_type text not null,
  severity text not null default 'info',
  ip_address inet, user_agent text, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_security_event_severity check (severity in ('info','warning','critical'))
);

create table if not exists public.admin_job_queue (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  priority integer not null default 100,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_at timestamptz not null default now(),
  locked_at timestamptz, locked_by text, last_error text, completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint admin_job_status check (status in ('queued','running','completed','failed','cancelled')),
  constraint admin_job_attempts check (attempts >= 0 and max_attempts between 1 and 20)
);
create index if not exists admin_jobs_claim_idx on public.admin_job_queue(status,run_at,priority,created_at);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  message_delivery_id uuid references public.message_deliveries(id) on delete cascade,
  channel text not null, template_key text, payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued', provider text, provider_reference text,
  attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
  last_error text, sent_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint notification_outbox_status check (status in ('queued','sending','sent','failed','suppressed'))
);
create index if not exists notification_outbox_delivery_idx on public.notification_outbox(status,next_attempt_at);

create table if not exists public.webhook_replay_requests (
  id uuid primary key default gen_random_uuid(),
  webhook_log_id uuid not null references public.webhook_delivery_logs(id) on delete restrict,
  requested_by uuid not null references public.admin_users(id) on delete restrict,
  approval_request_id uuid references public.admin_approval_requests(id) on delete restrict,
  reason text not null, status text not null default 'requested', job_id uuid references public.admin_job_queue(id) on delete set null,
  created_at timestamptz not null default now(), executed_at timestamptz,
  unique(webhook_log_id, status), constraint webhook_replay_status check (status in ('requested','pending_approval','queued','executed','rejected','failed'))
);

create table if not exists public.accounting_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, name text not null, account_type text not null, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint accounting_account_type check (account_type in ('asset','liability','equity','revenue','expense'))
);
create table if not exists public.accounting_journals (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique, source_type text not null, source_id text, description text not null,
  posted_by uuid references public.admin_users(id) on delete set null, posted_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.accounting_journal_lines (
  id uuid primary key default gen_random_uuid(), journal_id uuid not null references public.accounting_journals(id) on delete restrict,
  account_id uuid not null references public.accounting_accounts(id) on delete restrict,
  debit numeric(20,2) not null default 0, credit numeric(20,2) not null default 0,
  created_at timestamptz not null default now(),
  constraint accounting_line_positive check (debit >= 0 and credit >= 0 and (debit = 0) <> (credit = 0))
);

create or replace function public.admin_claim_jobs(p_worker_id text,p_limit integer default 20)
returns setof public.admin_job_queue language plpgsql security definer set search_path = '' as $$
begin
  return query
  with claimed as (
    select id from public.admin_job_queue where status='queued' and run_at <= now()
    order by priority asc, run_at asc, created_at asc for update skip locked limit greatest(1,least(p_limit,100))
  ) update public.admin_job_queue j set status='running',locked_at=now(),locked_by=p_worker_id,attempts=attempts+1,updated_at=now()
  from claimed where j.id=claimed.id returning j.*;
end; $$;

create or replace function public.admin_finish_job(p_job_id uuid,p_worker_id text,p_success boolean,p_error text default null,p_retry_at timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.admin_job_queue set
    status=case when p_success then 'completed' when attempts >= max_attempts then 'failed' else 'queued' end,
    completed_at=case when p_success then now() else null end,
    run_at=case when not p_success and attempts < max_attempts then coalesce(p_retry_at,now()+interval '5 minutes') else run_at end,
    locked_at=null,locked_by=null,last_error=case when p_success then null else left(coalesce(p_error,'job failed'),2000) end,updated_at=now()
  where id=p_job_id and locked_by=p_worker_id and status='running';
  if not found then raise exception 'Job is not owned by this worker'; end if;
end; $$;

create or replace function public.admin_post_journal(p_reference text,p_source_type text,p_source_id text,p_description text,p_posted_by uuid,p_lines jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare journal_id uuid; total_debit numeric(20,2); total_credit numeric(20,2);
begin
  select coalesce(sum((line->>'debit')::numeric),0),coalesce(sum((line->>'credit')::numeric),0) into total_debit,total_credit from jsonb_array_elements(p_lines) line;
  if total_debit <= 0 or total_debit <> total_credit then raise exception 'Journal debits and credits must balance'; end if;
  insert into public.accounting_journals(reference,source_type,source_id,description,posted_by) values(p_reference,p_source_type,p_source_id,p_description,p_posted_by) returning id into journal_id;
  insert into public.accounting_journal_lines(journal_id,account_id,debit,credit)
  select journal_id,(line->>'account_id')::uuid,coalesce((line->>'debit')::numeric,0),coalesce((line->>'credit')::numeric,0) from jsonb_array_elements(p_lines) line;
  return journal_id;
end; $$;

insert into public.accounting_accounts(code,name,account_type) values
 ('wallet_liability','Customer wallet liability','liability'),('provider_payable','Provider payable','liability'),('cash_at_bank','Cash at bank','asset'),('service_revenue','Service revenue','revenue'),('cashback_expense','Cashback expense','expense'),('refund_expense','Refund expense','expense') on conflict(code) do nothing;
insert into public.service_networks(name,slug,service_types) values ('MTN','mtn',array['data','airtime']),('Airtel','airtel',array['data','airtime']),('Glo','glo',array['data','airtime']),('9mobile','9mobile',array['data','airtime']) on conflict(slug) do nothing;

do $$ declare t text; begin foreach t in array array['service_networks','admin_security_events','admin_job_queue','notification_outbox','webhook_replay_requests','accounting_accounts','accounting_journals','accounting_journal_lines'] loop execute format('alter table public.%I enable row level security',t); execute format('alter table public.%I force row level security',t); execute format('revoke all on public.%I from anon,authenticated',t); end loop; end $$;
do $$ declare t text; begin foreach t in array array['service_networks','admin_job_queue','notification_outbox','accounting_accounts'] loop execute format('drop trigger if exists %I_updated_at on public.%I',t,t); execute format('create trigger %I_updated_at before update on public.%I for each row execute procedure public.set_updated_at()',t,t); end loop; end $$;
revoke all on function public.admin_claim_jobs(text,integer),public.admin_finish_job(uuid,text,boolean,text,timestamptz),public.admin_post_journal(text,text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.admin_claim_jobs(text,integer),public.admin_finish_job(uuid,text,boolean,text,timestamptz),public.admin_post_journal(text,text,text,text,uuid,jsonb) to service_role;
