-- Run after migrations 004 and 005 against a staging clone. The transaction is read-only in effect.
begin;

do $$
declare
  missing_rls text[];
  client_privileges integer;
  mutable_audit boolean;
  insecure_functions text[];
begin
  select array_agg(c.relname order by c.relname) into missing_rls
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname=any(array[
      'admin_users','admin_audit_logs','admin_approval_requests','customer_account_controls',
      'service_transactions','transaction_events','wallet_adjustment_requests','refund_requests',
      'provider_registry','service_products','support_tickets','risk_cases','api_request_logs'
      ,'admin_job_queue','notification_outbox','accounting_journals','accounting_journal_lines'
    ])
    and (not c.relrowsecurity or not c.relforcerowsecurity);
  if missing_rls is not null then raise exception 'Admin tables missing forced RLS: %',missing_rls; end if;

  select count(*) into client_privileges
  from information_schema.role_table_grants
  where table_schema='public'
    and grantee in ('anon','authenticated')
    and table_name=any(array[
      'admin_users','admin_audit_logs','admin_approval_requests','customer_account_controls',
      'service_transactions','transaction_events','wallet_adjustment_requests','refund_requests',
      'provider_registry','service_products','support_tickets','risk_cases','api_request_logs'
      ,'admin_job_queue','notification_outbox','accounting_journals','accounting_journal_lines'
    ]);
  if client_privileges <> 0 then raise exception 'Client roles have % unexpected admin-table grants',client_privileges; end if;

  select not exists(
    select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='admin_audit_logs' and t.tgname='admin_audit_logs_immutable' and t.tgenabled <> 'D'
  ) into mutable_audit;
  if mutable_audit then raise exception 'Admin audit log immutability trigger is missing'; end if;

  select array_agg(p.proname order by p.proname) into insecure_functions
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname=any(array['admin_request_wallet_adjustment','admin_execute_wallet_adjustment','admin_request_refund','admin_execute_refund','admin_record_approval_decision'])
    and (not p.prosecdef or coalesce(array_to_string(p.proconfig,','),'') not like '%search_path=%');
  if insecure_functions is not null then raise exception 'Sensitive functions lack SECURITY DEFINER/search_path hardening: %',insecure_functions; end if;

  if not exists(select 1 from public.admin_permissions where permission='approvals.review') then raise exception 'Approval permission is missing'; end if;
  if not exists(select 1 from public.admin_roles where slug='super_admin') then raise exception 'Super Admin role is missing'; end if;
end;
$$;

rollback;
