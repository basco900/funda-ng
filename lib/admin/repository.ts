import "server-only";

import { createAdminClient } from "../supabase/admin";

export type AdminWorkspaceRow = Record<string, string | number | null>;
export type AdminWorkspaceData = {
  connected: boolean;
  columns: Array<{ key: string; label: string; align?: "right" }>;
  rows: AdminWorkspaceRow[];
  metrics: Array<{ label: string; value: string; detail: string }>;
  source: string;
};

type GenericDefinition = {
  table: string;
  select: string;
  order?: string;
  statusColumn?: string;
  filter?: { column: string; values: string[] };
  columns: Array<{ key: string; label: string; source?: string; kind?: "money" | "date" | "status" | "boolean" | "json"; align?: "right" }>;
};

type Row = Record<string, unknown>;
const formatter = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFormatter = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const formatAdminMoney = (value: number) => `₦${formatter.format(value)}`;

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function valueAt(row: Row, path: string) {
  return path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Row)[key] : null, row);
}

function renderValue(value: unknown, kind?: GenericDefinition["columns"][number]["kind"]) {
  if (value === null || value === undefined || value === "") return "—";
  if (kind === "money") return formatAdminMoney(Number(value));
  if (kind === "date") return dateTimeFormatter.format(new Date(String(value)));
  if (kind === "status") return titleCase(String(value));
  if (kind === "boolean") return value ? "Enabled" : "Disabled";
  if (kind === "json") return JSON.stringify(value).slice(0, 80);
  if (Array.isArray(value)) return value.join(", ") || "—";
  return String(value);
}

const genericWorkspaces: Record<string, GenericDefinition> = {
  "/admin/services/networks": { table: "service_networks", select: "id,name,slug,availability,service_types,purchase_limit,updated_at", order: "updated_at", statusColumn: "availability", columns: [
    { key: "name", label: "Network" }, { key: "slug", label: "Slug" }, { key: "services", label: "Services", source: "service_types" }, { key: "limit", label: "Purchase limit", source: "purchase_limit", kind: "money", align: "right" }, { key: "status", label: "Availability", source: "availability", kind: "status" }, { key: "updated", label: "Updated", source: "updated_at", kind: "date" },
  ] },
  "/admin/customers/kyc": { table: "kyc_reviews", select: "id,user_id,tier,status,provider,assigned_to,created_at", order: "created_at", statusColumn: "status", columns: [
    { key: "customer", label: "Customer", source: "user_id" }, { key: "tier", label: "Tier" }, { key: "provider", label: "Provider" }, { key: "status", label: "Status", kind: "status" }, { key: "created", label: "Submitted", source: "created_at", kind: "date" },
  ] },
  "/admin/customers/segments": { table: "user_segments", select: "id,name,slug,segment_type,enabled,created_at", order: "created_at", columns: [
    { key: "name", label: "Segment" }, { key: "slug", label: "Slug" }, { key: "type", label: "Type", source: "segment_type", kind: "status" }, { key: "status", label: "Status", source: "enabled", kind: "boolean" }, { key: "created", label: "Created", source: "created_at", kind: "date" },
  ] },
  "/admin/customers/referrals": { table: "referrals", select: "id,referrer_user_id,referred_user_id,status,reward_amount,created_at", order: "created_at", statusColumn: "status", columns: [
    { key: "referrer", label: "Referrer", source: "referrer_user_id" }, { key: "referred", label: "Referred", source: "referred_user_id" }, { key: "reward", label: "Reward", source: "reward_amount", kind: "money", align: "right" }, { key: "status", label: "Status", kind: "status" }, { key: "created", label: "Created", source: "created_at", kind: "date" },
  ] },
  "/admin/money/refunds": { table: "refund_requests", select: "id,transaction_id,amount,reason,status,created_at", order: "created_at", statusColumn: "status", columns: [
    { key: "request", label: "Request", source: "id" }, { key: "transaction", label: "Transaction", source: "transaction_id" }, { key: "amount", label: "Amount", kind: "money", align: "right" }, { key: "status", label: "Status", kind: "status" }, { key: "created", label: "Created", source: "created_at", kind: "date" },
  ] },
  "/admin/money/reconciliation": { table: "reconciliation_runs", select: "id,run_type,status,matched_count,mismatch_count,internal_value,created_at", order: "created_at", statusColumn: "status", columns: [
    { key: "run", label: "Run", source: "id" }, { key: "type", label: "Type", source: "run_type", kind: "status" }, { key: "matched", label: "Matched", source: "matched_count" }, { key: "mismatches", label: "Mismatches", source: "mismatch_count" }, { key: "value", label: "Internal value", source: "internal_value", kind: "money", align: "right" }, { key: "status", label: "Status", kind: "status" },
  ] },
  "/admin/money/ledger": { table: "wallet_ledger_entries", select: "id,user_id,entry_type,amount,balance_after,reference,created_at", order: "created_at", columns: [
    { key: "reference", label: "Reference" }, { key: "customer", label: "Customer", source: "user_id" }, { key: "type", label: "Entry", source: "entry_type", kind: "status" }, { key: "amount", label: "Amount", kind: "money", align: "right" }, { key: "balance", label: "Balance after", source: "balance_after", kind: "money", align: "right" }, { key: "created", label: "Created", source: "created_at", kind: "date" },
  ] },
  "/admin/money/revenue": { table: "daily_financial_snapshots", select: "snapshot_date,gross_transaction_value,provider_cost,net_revenue,gross_profit,transaction_count", order: "snapshot_date", columns: [
    { key: "date", label: "Date", source: "snapshot_date" }, { key: "gtv", label: "Gross value", source: "gross_transaction_value", kind: "money", align: "right" }, { key: "cost", label: "Provider cost", source: "provider_cost", kind: "money", align: "right" }, { key: "revenue", label: "Net revenue", source: "net_revenue", kind: "money", align: "right" }, { key: "profit", label: "Gross profit", source: "gross_profit", kind: "money", align: "right" }, { key: "count", label: "Transactions", source: "transaction_count" },
  ] },
  "/admin/products": { table: "service_products", select: "id,name,service_type,network,provider_cost,selling_price,status,updated_at", order: "updated_at", statusColumn: "status", columns: [
    { key: "name", label: "Product" }, { key: "service", label: "Service", source: "service_type", kind: "status" }, { key: "network", label: "Network" }, { key: "cost", label: "Cost", source: "provider_cost", kind: "money", align: "right" }, { key: "price", label: "Price", source: "selling_price", kind: "money", align: "right" }, { key: "status", label: "Status", kind: "status" },
  ] },
  "/admin/products/providers": { table: "provider_registry", select: "id,name,slug,status,capabilities,priority,updated_at", order: "priority", statusColumn: "status", columns: [
    { key: "name", label: "Provider" }, { key: "slug", label: "Slug" }, { key: "services", label: "Capabilities", source: "capabilities" }, { key: "priority", label: "Priority" }, { key: "status", label: "Status", kind: "status" }, { key: "updated", label: "Updated", source: "updated_at", kind: "date" },
  ] },
  "/admin/products/pricing": { table: "pricing_rules", select: "id,service_type,customer_segment,rule_type,value,enabled,updated_at", order: "updated_at", columns: [
    { key: "service", label: "Service", source: "service_type", kind: "status" }, { key: "segment", label: "Segment", source: "customer_segment" }, { key: "rule", label: "Rule", source: "rule_type", kind: "status" }, { key: "value", label: "Value", align: "right" }, { key: "status", label: "Status", source: "enabled", kind: "boolean" }, { key: "updated", label: "Updated", source: "updated_at", kind: "date" },
  ] },
  "/admin/products/cashback": { table: "cashback_rules", select: "id,name,scope_type,reward_type,reward_value,budget,spent,status", order: "created_at", statusColumn: "status", columns: [
    { key: "name", label: "Rule" }, { key: "scope", label: "Scope", source: "scope_type", kind: "status" }, { key: "reward", label: "Reward", source: "reward_value", align: "right" }, { key: "budget", label: "Budget", kind: "money", align: "right" }, { key: "spent", label: "Spent", kind: "money", align: "right" }, { key: "status", label: "Status", kind: "status" },
  ] },
  "/admin/products/commissions": { table: "commission_rules", select: "id,service_type,calculation_type,value,enabled,starts_at,ends_at", order: "created_at", columns: [
    { key: "service", label: "Service", source: "service_type", kind: "status" }, { key: "calculation", label: "Calculation", source: "calculation_type", kind: "status" }, { key: "value", label: "Value", align: "right" }, { key: "status", label: "Status", source: "enabled", kind: "boolean" }, { key: "starts", label: "Starts", source: "starts_at", kind: "date" }, { key: "ends", label: "Ends", source: "ends_at", kind: "date" },
  ] },
  "/admin/operations/disputes": { table: "disputes", select: "id,dispute_number,user_id,transaction_id,category,priority,status,created_at", order: "created_at", statusColumn: "status", columns: [
    { key: "dispute", label: "Dispute", source: "dispute_number" }, { key: "customer", label: "Customer", source: "user_id" }, { key: "category", label: "Category", kind: "status" }, { key: "priority", label: "Priority", kind: "status" }, { key: "status", label: "Status", kind: "status" }, { key: "created", label: "Created", source: "created_at", kind: "date" },
  ] },
  "/admin/operations/support": { table: "support_tickets", select: "id,ticket_number,user_id,category,subject,priority,status,created_at", order: "created_at", statusColumn: "status", columns: [
    { key: "ticket", label: "Ticket", source: "ticket_number" }, { key: "subject", label: "Subject" }, { key: "customer", label: "Customer", source: "user_id" }, { key: "priority", label: "Priority", kind: "status" }, { key: "status", label: "Status", kind: "status" }, { key: "created", label: "Created", source: "created_at", kind: "date" },
  ] },
  "/admin/operations/incidents": { table: "provider_incidents", select: "id,title,service_type,severity,status,affected_transaction_count,affected_value,started_at", order: "started_at", statusColumn: "status", columns: [
    { key: "title", label: "Incident" }, { key: "service", label: "Service", source: "service_type", kind: "status" }, { key: "severity", label: "Severity", kind: "status" }, { key: "affected", label: "Affected", source: "affected_transaction_count" }, { key: "value", label: "Value", source: "affected_value", kind: "money", align: "right" }, { key: "status", label: "Status", kind: "status" },
  ] },
  "/admin/operations/manual": { table: "admin_approval_requests", select: "id,action_type,entity_type,risk_level,status,requested_by,expires_at,created_at", order: "created_at", statusColumn: "status", columns: [
    { key: "action", label: "Action", source: "action_type", kind: "status" }, { key: "entity", label: "Entity", source: "entity_type", kind: "status" }, { key: "risk", label: "Risk", source: "risk_level", kind: "status" }, { key: "status", label: "Status", kind: "status" }, { key: "expires", label: "Expires", source: "expires_at", kind: "date" }, { key: "created", label: "Requested", source: "created_at", kind: "date" },
  ] },
  "/admin/growth/campaigns": { table: "campaigns", select: "id,name,campaign_type,budget,spent,status,starts_at,ends_at", order: "created_at", statusColumn: "status", columns: [
    { key: "name", label: "Campaign" }, { key: "type", label: "Type", source: "campaign_type", kind: "status" }, { key: "budget", label: "Budget", kind: "money", align: "right" }, { key: "spent", label: "Spent", kind: "money", align: "right" }, { key: "status", label: "Status", kind: "status" }, { key: "starts", label: "Starts", source: "starts_at", kind: "date" },
  ] },
  "/admin/growth/coupons": { table: "coupons", select: "id,code,name,reward_type,reward_value,budget,spent,status,ends_at", order: "created_at", statusColumn: "status", columns: [
    { key: "code", label: "Code" }, { key: "name", label: "Coupon" }, { key: "reward", label: "Reward", source: "reward_type", kind: "status" }, { key: "value", label: "Value", source: "reward_value", align: "right" }, { key: "spent", label: "Spent", kind: "money", align: "right" }, { key: "status", label: "Status", kind: "status" },
  ] },
  "/admin/growth/notifications": { table: "message_campaigns", select: "id,name,channel,status,scheduled_at,created_at", order: "created_at", statusColumn: "status", columns: [
    { key: "name", label: "Campaign" }, { key: "channel", label: "Channel", kind: "status" }, { key: "status", label: "Status", kind: "status" }, { key: "scheduled", label: "Scheduled", source: "scheduled_at", kind: "date" }, { key: "created", label: "Created", source: "created_at", kind: "date" },
  ] },
  "/admin/growth/announcements": { table: "announcements", select: "id,title,placement,priority,status,starts_at,ends_at", order: "created_at", statusColumn: "status", columns: [
    { key: "title", label: "Announcement" }, { key: "placement", label: "Placement", kind: "status" }, { key: "priority", label: "Priority", kind: "status" }, { key: "status", label: "Status", kind: "status" }, { key: "starts", label: "Starts", source: "starts_at", kind: "date" }, { key: "ends", label: "Ends", source: "ends_at", kind: "date" },
  ] },
  "/admin/growth/rewards": { table: "cashback_awards", select: "id,user_id,transaction_id,amount,status,created_at,credited_at", order: "created_at", statusColumn: "status", columns: [
    { key: "customer", label: "Customer", source: "user_id" }, { key: "transaction", label: "Transaction", source: "transaction_id" }, { key: "amount", label: "Amount", kind: "money", align: "right" }, { key: "status", label: "Status", kind: "status" }, { key: "created", label: "Created", source: "created_at", kind: "date" },
  ] },
  "/admin/risk": { table: "risk_cases", select: "id,case_number,user_id,risk_score,severity,status,title,created_at", order: "created_at", statusColumn: "status", columns: [
    { key: "case", label: "Case", source: "case_number" }, { key: "title", label: "Title" }, { key: "customer", label: "Customer", source: "user_id" }, { key: "score", label: "Score", source: "risk_score" }, { key: "severity", label: "Severity", kind: "status" }, { key: "status", label: "Status", kind: "status" },
  ] },
  "/admin/risk/limits": { table: "account_limit_rules", select: "id,name,kyc_tier,service_type,per_transaction_limit,daily_value_limit,daily_count_limit,enabled", order: "kyc_tier", columns: [
    { key: "name", label: "Limit" }, { key: "tier", label: "KYC tier", source: "kyc_tier" }, { key: "service", label: "Service", source: "service_type" }, { key: "perTransaction", label: "Per transaction", source: "per_transaction_limit", kind: "money", align: "right" }, { key: "daily", label: "Daily value", source: "daily_value_limit", kind: "money", align: "right" }, { key: "status", label: "Status", source: "enabled", kind: "boolean" },
  ] },
  "/admin/risk/activity": { table: "risk_signals", select: "id,user_id,signal_type,score,source,detected_at,expires_at", order: "detected_at", columns: [
    { key: "signal", label: "Signal", source: "signal_type", kind: "status" }, { key: "customer", label: "Customer", source: "user_id" }, { key: "score", label: "Score" }, { key: "source", label: "Source" }, { key: "detected", label: "Detected", source: "detected_at", kind: "date" }, { key: "expires", label: "Expires", source: "expires_at", kind: "date" },
  ] },
  "/admin/risk/blocked": { table: "customer_account_controls", select: "user_id,account_status,wallet_status,risk_level,restriction_reason,updated_at", order: "updated_at", filter: { column: "account_status", values: ["suspended", "blocked", "closed"] }, statusColumn: "account_status", columns: [
    { key: "customer", label: "Customer", source: "user_id" }, { key: "account", label: "Account", source: "account_status", kind: "status" }, { key: "wallet", label: "Wallet", source: "wallet_status", kind: "status" }, { key: "risk", label: "Risk", source: "risk_level", kind: "status" }, { key: "reason", label: "Reason", source: "restriction_reason" }, { key: "updated", label: "Updated", source: "updated_at", kind: "date" },
  ] },
  "/admin/risk/devices": { table: "user_devices", select: "id,user_id,device_name,platform,last_ip,trusted,blocked,last_seen_at", order: "last_seen_at", columns: [
    { key: "device", label: "Device", source: "device_name" }, { key: "customer", label: "Customer", source: "user_id" }, { key: "platform", label: "Platform" }, { key: "ip", label: "Last IP", source: "last_ip" }, { key: "trusted", label: "Trusted", kind: "boolean" }, { key: "blocked", label: "Blocked", kind: "boolean" }, { key: "seen", label: "Last seen", source: "last_seen_at", kind: "date" },
  ] },
  "/admin/platform/features": { table: "feature_flags", select: "key,name,enabled,rollout_percentage,updated_at", order: "updated_at", columns: [
    { key: "name", label: "Feature" }, { key: "key", label: "Key" }, { key: "rollout", label: "Rollout", source: "rollout_percentage" }, { key: "status", label: "Status", source: "enabled", kind: "boolean" }, { key: "updated", label: "Updated", source: "updated_at", kind: "date" },
  ] },
  "/admin/platform/integrations": { table: "provider_registry", select: "id,name,slug,status,capabilities,updated_at", order: "updated_at", statusColumn: "status", columns: [
    { key: "name", label: "Integration" }, { key: "slug", label: "Key" }, { key: "capabilities", label: "Capabilities" }, { key: "status", label: "Status", kind: "status" }, { key: "updated", label: "Updated", source: "updated_at", kind: "date" },
  ] },
  "/admin/platform/webhooks": { table: "webhook_delivery_logs", select: "id,provider,event_type,direction,status,http_status,attempt_count,received_at", order: "received_at", statusColumn: "status", columns: [
    { key: "provider", label: "Provider" }, { key: "event", label: "Event", source: "event_type" }, { key: "direction", label: "Direction", kind: "status" }, { key: "http", label: "HTTP", source: "http_status" }, { key: "attempts", label: "Attempts", source: "attempt_count" }, { key: "status", label: "Status", kind: "status" }, { key: "received", label: "Received", source: "received_at", kind: "date" },
  ] },
  "/admin/platform/logs": { table: "api_request_logs", select: "id,request_id,provider,transaction_reference,method,endpoint_redacted,http_status,latency_ms,outcome,created_at", order: "created_at", statusColumn: "outcome", columns: [
    { key: "request", label: "Request", source: "request_id" }, { key: "provider", label: "Provider" }, { key: "method", label: "Method" }, { key: "endpoint", label: "Endpoint", source: "endpoint_redacted" }, { key: "http", label: "HTTP", source: "http_status" }, { key: "latency", label: "Latency ms", source: "latency_ms" }, { key: "status", label: "Outcome", source: "outcome", kind: "status" },
  ] },
  "/admin/platform/health": { table: "system_health_checks", select: "id,component,status,latency_ms,message,checked_at", order: "checked_at", statusColumn: "status", columns: [
    { key: "component", label: "Component" }, { key: "status", label: "Status", kind: "status" }, { key: "latency", label: "Latency ms", source: "latency_ms" }, { key: "message", label: "Message" }, { key: "checked", label: "Checked", source: "checked_at", kind: "date" },
  ] },
  "/admin/settings/admins": { table: "admin_users", select: "id,full_name,email,status,two_factor_required,last_login_at,created_at", order: "created_at", statusColumn: "status", columns: [
    { key: "name", label: "Admin", source: "full_name" }, { key: "email", label: "Email" }, { key: "status", label: "Status", kind: "status" }, { key: "twoFactor", label: "2FA required", source: "two_factor_required", kind: "boolean" }, { key: "lastLogin", label: "Last login", source: "last_login_at", kind: "date" },
  ] },
  "/admin/settings/roles": { table: "admin_roles", select: "id,name,slug,description,is_system,updated_at", order: "name", columns: [
    { key: "name", label: "Role" }, { key: "slug", label: "Slug" }, { key: "description", label: "Description" }, { key: "system", label: "System role", source: "is_system", kind: "boolean" }, { key: "updated", label: "Updated", source: "updated_at", kind: "date" },
  ] },
  "/admin/settings/audit": { table: "admin_audit_logs", select: "id,actor_email,action,entity_type,entity_id,reason,created_at", order: "created_at", columns: [
    { key: "actor", label: "Actor", source: "actor_email" }, { key: "action", label: "Action", kind: "status" }, { key: "entity", label: "Entity", source: "entity_type", kind: "status" }, { key: "entityId", label: "Entity ID", source: "entity_id" }, { key: "reason", label: "Reason" }, { key: "created", label: "Created", source: "created_at", kind: "date" },
  ] },
  "/admin/settings/security": { table: "admin_login_events", select: "id,outcome,ip_address,created_at", order: "created_at", statusColumn: "outcome", columns: [
    { key: "event", label: "Event", source: "id" }, { key: "outcome", label: "Outcome", kind: "status" }, { key: "ip", label: "IP address", source: "ip_address" }, { key: "created", label: "Created", source: "created_at", kind: "date" },
  ] },
};

function productDefinition(serviceType: string): GenericDefinition {
  return { ...genericWorkspaces["/admin/products"], filter: { column: "service_type", values: [serviceType] } };
}

async function loadGeneric(definition: GenericDefinition): Promise<AdminWorkspaceData> {
  const client = createAdminClient();
  let query = client.from(definition.table).select(definition.select, { count: "exact" });
  if (definition.filter) query = query.in(definition.filter.column, definition.filter.values);
  query = query.order(definition.order ?? "created_at", { ascending: definition.order === "priority" || definition.order === "name" }).limit(100);
  const { data, count, error } = await query;
  if (error) throw error;
  const raw = (data ?? []) as unknown as Row[];
  const rows = raw.map((row) => Object.fromEntries(definition.columns.map((column) => [column.key, renderValue(valueAt(row, column.source ?? column.key), column.kind)])));
  const statuses = definition.statusColumn ? new Set(raw.map((row) => valueAt(row, definition.statusColumn!)).filter(Boolean)).size : 0;
  return {
    connected: true,
    source: definition.table,
    columns: definition.columns.map(({ key, label, align }) => ({ key, label, align })),
    rows,
    metrics: [
      { label: "All records", value: String(count ?? rows.length), detail: `Stored in ${definition.table}` },
      { label: "Visible records", value: String(rows.length), detail: "Latest matching records" },
      { label: definition.statusColumn ? "Distinct states" : "Data source", value: definition.statusColumn ? String(statuses) : "Live", detail: "Server-side, access controlled" },
    ],
  };
}

async function loadUsers(): Promise<AdminWorkspaceData> {
  const client = createAdminClient();
  const [{ data: profiles, count, error }, { data: wallets }, { data: controls }] = await Promise.all([
    client.from("profiles").select("id,full_name,country_code,state,created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(100),
    client.from("wallets").select("user_id,available_balance").limit(5000),
    client.from("customer_account_controls").select("user_id,account_status,risk_level").limit(5000),
  ]);
  if (error) throw error;
  const balances = new Map((wallets ?? []).map((row) => [row.user_id, Number(row.available_balance)]));
  const states = new Map((controls ?? []).map((row) => [row.user_id, row]));
  const rows = (profiles ?? []).map((profile) => ({
    user: profile.full_name || "Unnamed customer",
    id: String(profile.id).slice(0, 8),
    location: [profile.state, profile.country_code].filter(Boolean).join(", ") || "—",
    balance: formatAdminMoney(balances.get(profile.id) ?? 0),
    risk: titleCase(String(states.get(profile.id)?.risk_level ?? "low")),
    status: titleCase(String(states.get(profile.id)?.account_status ?? "active")),
    joined: dateFormatter.format(new Date(profile.created_at)),
  }));
  return { connected: true, source: "profiles", columns: [
    { key: "user", label: "Customer" }, { key: "id", label: "User ID" }, { key: "location", label: "Location" }, { key: "balance", label: "Wallet", align: "right" }, { key: "risk", label: "Risk" }, { key: "status", label: "Status" }, { key: "joined", label: "Joined" },
  ], rows, metrics: [
    { label: "All customers", value: String(count ?? rows.length), detail: "Registered profiles" },
    { label: "Funded wallets", value: String([...balances.values()].filter((balance) => balance > 0).length), detail: "Balance above zero" },
    { label: "Restricted", value: String([...states.values()].filter((state) => state.account_status !== "active").length), detail: "Review, suspended or blocked" },
  ] };
}

async function loadWallets(): Promise<AdminWorkspaceData> {
  const client = createAdminClient();
  const { data, count, error } = await client.from("wallets").select("user_id,available_balance,currency,updated_at", { count: "exact" }).order("updated_at", { ascending: false }).limit(100);
  if (error) throw error;
  const rows = (data ?? []).map((row) => ({ customer: String(row.user_id), balance: formatAdminMoney(Number(row.available_balance)), currency: row.currency, updated: dateTimeFormatter.format(new Date(row.updated_at)) }));
  const total = (data ?? []).reduce((sum, row) => sum + Number(row.available_balance), 0);
  return { connected: true, source: "wallets", columns: [{ key: "customer", label: "Customer" }, { key: "balance", label: "Available balance", align: "right" }, { key: "currency", label: "Currency" }, { key: "updated", label: "Updated" }], rows, metrics: [
    { label: "Wallets", value: String(count ?? rows.length), detail: "Customer wallets" }, { label: "Visible float", value: formatAdminMoney(total), detail: "Latest loaded wallets" }, { label: "Currency", value: "NGN", detail: "Single-currency ledger" },
  ] };
}

async function loadTransactions(pathname: string): Promise<AdminWorkspaceData> {
  const client = createAdminClient();
  let query = client.from("service_transactions").select("id,internal_reference,service_type,destination,amount,status,provider_reference,created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(100);
  if (pathname.endsWith("/failed")) query = query.eq("status", "failed");
  if (pathname.endsWith("/pending")) query = query.in("status", ["initiated", "processing", "pending"]);
  const { data, count, error } = await query;
  if (error) throw error;
  const rows = (data ?? []).map((row) => ({ reference: row.internal_reference, service: titleCase(row.service_type), destination: row.destination, amount: formatAdminMoney(Number(row.amount)), status: titleCase(row.status), provider: row.provider_reference || "—", created: dateTimeFormatter.format(new Date(row.created_at)) }));
  const value = (data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  return { connected: true, source: "service_transactions", columns: [{ key: "reference", label: "Reference" }, { key: "service", label: "Service" }, { key: "destination", label: "Destination" }, { key: "amount", label: "Amount", align: "right" }, { key: "status", label: "Status" }, { key: "provider", label: "Provider ref" }, { key: "created", label: "Created" }], rows, metrics: [
    { label: "Transactions", value: String(count ?? rows.length), detail: "Matching this queue" }, { label: "Visible value", value: formatAdminMoney(value), detail: "Latest loaded records" }, { label: "Data source", value: "Live", detail: "Full service transaction timeline" },
  ] };
}

async function loadFunding(): Promise<AdminWorkspaceData> {
  const client = createAdminClient();
  const { data, count, error } = await client.from("wallet_funding_transactions").select("merchant_reference,amount,provider,status,created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  const rows = (data ?? []).map((row) => ({ reference: row.merchant_reference, provider: row.provider, amount: formatAdminMoney(Number(row.amount)), status: titleCase(row.status), created: dateTimeFormatter.format(new Date(row.created_at)) }));
  return { connected: true, source: "wallet_funding_transactions", columns: [{ key: "reference", label: "Reference" }, { key: "provider", label: "Provider" }, { key: "amount", label: "Amount", align: "right" }, { key: "status", label: "Status" }, { key: "created", label: "Created" }], rows, metrics: [
    { label: "Funding records", value: String(count ?? rows.length), detail: "All wallet deposits" }, { label: "Visible value", value: formatAdminMoney((data ?? []).reduce((sum, row) => sum + Number(row.amount), 0)), detail: "Latest loaded records" }, { label: "Provider", value: "Bachs", detail: "Current funding rail" },
  ] };
}

function emptyWorkspace(source = "not_configured"): AdminWorkspaceData {
  return { connected: false, source, columns: [], rows: [], metrics: [
    { label: "Module status", value: "Ready", detail: "Backend schema connected after migration" }, { label: "Visible records", value: "0", detail: "No operational data yet" }, { label: "Security", value: "Locked", detail: "Server-only access" },
  ] };
}

export async function loadAdminWorkspace(pathname: string): Promise<AdminWorkspaceData> {
  try {
    if (pathname === "/admin/users") return await loadUsers();
    if (pathname === "/admin/customers/wallets") return await loadWallets();
    if (["/admin/transactions", "/admin/operations/live", "/admin/operations/failed", "/admin/operations/pending", "/admin/analytics/transactions"].includes(pathname)) return await loadTransactions(pathname);
    if (pathname === "/admin/money/funding") return await loadFunding();
    if (pathname.startsWith("/admin/services/")) return await loadGeneric(productDefinition(pathname.split("/").at(-1) === "other" ? "other" : pathname.split("/").at(-1)!));
    if (pathname === "/admin/analytics/services") return await loadGeneric(genericWorkspaces["/admin/products"]);
    if (pathname === "/admin/analytics/customers") return await loadUsers();
    if (pathname === "/admin/analytics/reports") return await loadGeneric({ table: "admin_export_jobs", select: "id,report_type,format,status,row_count,created_at,completed_at", order: "created_at", statusColumn: "status", columns: [
      { key: "report", label: "Report", source: "report_type", kind: "status" }, { key: "format", label: "Format" }, { key: "rows", label: "Rows", source: "row_count" }, { key: "status", label: "Status", kind: "status" }, { key: "created", label: "Created", source: "created_at", kind: "date" }, { key: "completed", label: "Completed", source: "completed_at", kind: "date" },
    ] });
    if (pathname === "/admin/platform/config" || pathname === "/admin/settings") return await loadGeneric({ table: "app_configuration", select: "key,description,is_sensitive,updated_at", order: "updated_at", columns: [
      { key: "key", label: "Key" }, { key: "description", label: "Description" }, { key: "sensitive", label: "Sensitive", source: "is_sensitive", kind: "boolean" }, { key: "updated", label: "Updated", source: "updated_at", kind: "date" },
    ] });
    const definition = genericWorkspaces[pathname];
    return definition ? await loadGeneric(definition) : emptyWorkspace();
  } catch {
    return emptyWorkspace(pathname);
  }
}

export type AdminSearchResult = { id: string; type: "customer" | "transaction" | "product" | "provider"; title: string; detail: string; href: string };

export async function searchAdminRecords(query: string): Promise<AdminSearchResult[]> {
  const needle = query.trim().replaceAll(/[,%()]/g, "").slice(0, 80);
  if (needle.length < 2) return [];
  const client = createAdminClient();
  const [profiles, transactions, products, providers] = await Promise.all([
    client.from("profiles").select("id,full_name,state").ilike("full_name", `%${needle}%`).limit(5),
    client.from("service_transactions").select("id,internal_reference,service_type,status").or(`internal_reference.ilike.%${needle}%,destination.ilike.%${needle}%`).limit(5),
    client.from("service_products").select("id,name,service_type,status").ilike("name", `%${needle}%`).limit(5),
    client.from("provider_registry").select("id,name,status").ilike("name", `%${needle}%`).limit(5),
  ]);
  return [
    ...(profiles.data ?? []).map((row) => ({ id: row.id, type: "customer" as const, title: row.full_name || "Unnamed customer", detail: row.state || "Customer", href: `/admin/users?customer=${row.id}` })),
    ...(transactions.data ?? []).map((row) => ({ id: row.id, type: "transaction" as const, title: row.internal_reference, detail: `${titleCase(row.service_type)} · ${titleCase(row.status)}`, href: `/admin/transactions?transaction=${row.id}` })),
    ...(products.data ?? []).map((row) => ({ id: row.id, type: "product" as const, title: row.name, detail: `${titleCase(row.service_type)} · ${titleCase(row.status)}`, href: `/admin/products?product=${row.id}` })),
    ...(providers.data ?? []).map((row) => ({ id: row.id, type: "provider" as const, title: row.name, detail: titleCase(row.status), href: `/admin/products/providers?provider=${row.id}` })),
  ];
}

export async function loadAdminOperationsSummary() {
  const client = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [pending, failed, approvals, incidents, tickets, jobs, notifications, security] = await Promise.all([
    client.from("service_transactions").select("id", { count: "exact", head: true }).in("status", ["initiated", "processing", "pending"]),
    client.from("service_transactions").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", since),
    client.from("admin_approval_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    client.from("provider_incidents").select("id", { count: "exact", head: true }).neq("status", "resolved"),
    client.from("support_tickets").select("id", { count: "exact", head: true }).not("status", "in", "(resolved,closed)"),
    client.from("admin_job_queue").select("id", { count: "exact", head: true }).eq("status", "failed"),
    client.from("notification_outbox").select("id", { count: "exact", head: true }).eq("status", "failed"),
    client.from("admin_security_events").select("id", { count: "exact", head: true }).eq("severity", "critical").gte("created_at", since),
  ]);
  const alerts = [
    ...(Number(incidents.count ?? 0) ? [{ level: "critical", label: "Open provider incidents", count: Number(incidents.count), href: "/admin/operations/incidents" }] : []),
    ...(Number(security.count ?? 0) ? [{ level: "critical", label: "Critical security events", count: Number(security.count), href: "/admin/settings/security" }] : []),
    ...(Number(failed.count ?? 0) ? [{ level: "warning", label: "Failed transactions in 24h", count: Number(failed.count), href: "/admin/transactions/failed" }] : []),
    ...(Number(jobs.count ?? 0) ? [{ level: "warning", label: "Failed background jobs", count: Number(jobs.count), href: "/admin/platform/health" }] : []),
    ...(Number(notifications.count ?? 0) ? [{ level: "warning", label: "Failed notifications", count: Number(notifications.count), href: "/admin/growth/notifications" }] : []),
    ...(Number(approvals.count ?? 0) ? [{ level: "info", label: "Awaiting approvals", count: Number(approvals.count), href: "/admin/operations/manual" }] : []),
  ];
  return { pending: pending.count ?? 0, failed24h: failed.count ?? 0, pendingApprovals: approvals.count ?? 0, openIncidents: incidents.count ?? 0, openTickets: tickets.count ?? 0, alerts, generatedAt: new Date().toISOString() };
}
