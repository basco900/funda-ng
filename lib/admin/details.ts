import "server-only";
import { createAdminClient } from "../supabase/admin";

export async function loadCustomer360(userId: string) {
  const client = createAdminClient();
  const [profileResult, authResult, walletResult, controlsResult, transactionsResult, ledgerResult, notesResult, devicesResult, ticketsResult, kycResult] = await Promise.all([
    client.from("profiles").select("*").eq("id", userId).maybeSingle(), client.auth.admin.getUserById(userId),
    client.from("wallets").select("*").eq("user_id", userId).maybeSingle(), client.from("customer_account_controls").select("*").eq("user_id", userId).maybeSingle(),
    client.from("service_transactions").select("id,internal_reference,service_type,amount,status,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
    client.from("wallet_ledger_entries").select("id,entry_type,amount,balance_after,reference,description,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
    client.from("admin_customer_notes").select("id,note,created_at,admin_user_id").eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
    client.from("user_devices").select("id,device_name,platform,last_ip,trusted,blocked,last_seen_at").eq("user_id", userId).order("last_seen_at", { ascending: false }).limit(20),
    client.from("support_tickets").select("id,ticket_number,subject,status,priority,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    client.from("kyc_reviews").select("tier,status,provider,reviewed_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (profileResult.error || !profileResult.data) return null;
  const transactions = transactionsResult.data ?? [];
  const totalSpend = transactions.filter((item) => item.status === "successful").reduce((sum, item) => sum + Number(item.amount), 0);
  return { profile: profileResult.data, auth: authResult.data.user ? { email: authResult.data.user.email ?? null, phone: authResult.data.user.phone ?? null, createdAt: authResult.data.user.created_at, lastSignInAt: authResult.data.user.last_sign_in_at ?? null } : null, wallet: walletResult.data, controls: controlsResult.data, kyc: kycResult.data, transactions, ledger: ledgerResult.data ?? [], notes: notesResult.data ?? [], devices: devicesResult.data ?? [], tickets: ticketsResult.data ?? [], metrics: { transactionCount: transactions.length, totalSpend, funded: (ledgerResult.data ?? []).filter((item) => item.entry_type === "credit").reduce((sum, item) => sum + Number(item.amount), 0), cashback: (ledgerResult.data ?? []).filter((item) => item.entry_type === "cashback").reduce((sum, item) => sum + Number(item.amount), 0) } };
}

export async function loadTransaction360(transactionId: string) {
  const client = createAdminClient();
  const { data: record, error } = await client
    .from("service_transactions")
    .select("*, product:service_products(name,network,provider_product_code), provider:provider_registry(name,slug,status)")
    .eq("id", transactionId)
    .maybeSingle();
  if (error || !record) return null;
  const { data: profile } = await client.from("profiles").select("full_name").eq("id", record.user_id).maybeSingle();
  const transaction = { ...record, profile };
  const [events, attempts, refunds, disputes, ledger, apiLogs, cashback] = await Promise.all([
    client.from("transaction_events").select("*").eq("transaction_id", transactionId).order("created_at", { ascending: true }),
    client
      .from("provider_attempts")
      .select("id,attempt_number,outcome,http_status,latency_ms,provider_reference,created_at,response_redacted,provider:provider_registry(name,slug)")
      .eq("transaction_id", transactionId)
      .order("attempt_number", { ascending: true }),
    client.from("refund_requests").select("id,amount,status,reason,created_at,resolved_at").eq("transaction_id", transactionId).order("created_at", { ascending: false }),
    client.from("disputes").select("id,dispute_number,status,priority,category,created_at").eq("transaction_id", transactionId).order("created_at", { ascending: false }),
    client.from("wallet_ledger_entries").select("id,entry_type,amount,balance_after,reference,description,metadata,created_at").eq("user_id", transaction.user_id).eq("metadata->>transaction_id", transactionId).order("created_at", { ascending: true }),
    client.from("api_request_logs").select("id,provider,method,endpoint:endpoint_redacted,outcome,latency_ms,response_payload:response_redacted,created_at").eq("transaction_reference", transaction.internal_reference).order("created_at", { ascending: false }).limit(20),
    client.from("cashback_awards").select("id,amount,status,credited_at,created_at").eq("transaction_id", transactionId).maybeSingle(),
  ]);
  return {
    transaction,
    events: events.data ?? [],
    attempts: attempts.data ?? [],
    refunds: refunds.data ?? [],
    disputes: disputes.data ?? [],
    apiLogs: apiLogs.data ?? [],
    cashbackAward: cashback.data ?? null,
    ledger: (ledger.data ?? []).filter(
      (item) =>
        item.reference === transaction.internal_reference ||
        item.reference === `DEBIT-${transaction.internal_reference}` ||
        item.reference === `REFUND-${transaction.internal_reference}` ||
        item.reference === `CASHBACK-${transaction.internal_reference}` ||
        item.metadata?.transaction_id === transactionId,
    ),
  };
}
