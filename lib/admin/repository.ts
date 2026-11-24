import "server-only";

import { createAdminClient } from "../supabase/admin";

export type AdminWorkspaceRow = { id: string; href?: string; cells: Record<string, string | number | null> };
export type AdminWorkspaceData = {
  connected: boolean;
  columns: Array<{ key: string; label: string; align?: "right" }>;
  /** One page of rows that match the current filters. */
  rows: AdminWorkspaceRow[];
  /** Rows matching the current filters, across every page. */
  total: number;
  /** Rows in this list before any filter. */
  all: number;
  filters: AdminWorkspaceFilters;
  /** Extra figures for the overview band. */
  metrics: Array<{ label: string; value: string }>;
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

/* ─── Filtered, paged lists ───────────────────────────────────────────────────
   Every list filters on the server, across the whole table: status, one facet,
   text search and a date window, all read from the URL. */

export const ADMIN_PAGE_SIZE = 25;
const RANGES = ["1", "7", "30", "90"] as const;

export type AdminListQuery = { status: string; facet: string; q: string; range: string; page: number };

export function parseAdminListQuery(params: Record<string, string | string[] | undefined>): AdminListQuery {
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");
  return {
    status: one("status").slice(0, 40),
    facet: one("facet").slice(0, 60),
    q: one("q").replaceAll(/[,%()*\\:"]/g, " ").trim().slice(0, 80),
    range: (RANGES as readonly string[]).includes(one("range")) ? one("range") : "",
    page: Math.max(1, Math.min(400, Math.floor(Number(one("page"))) || 1)),
  };
}

/** Start of the window: "1" means since midnight in Lagos (UTC+1, no DST). */
export function rangeStart(range: string) {
  if (!range) return null;
  if (range === "1") {
    const lagos = new Date(Date.now() + 3_600_000);
    lagos.setUTCHours(0, 0, 0, 0);
    return new Date(lagos.getTime() - 3_600_000).toISOString();
  }
  return new Date(Date.now() - Number(range) * 86_400_000).toISOString();
}

export type AdminFilterOption = { value: string; label: string; count?: number };
export type AdminWorkspaceFilters = {
  status?: { label: string; total: number; options: AdminFilterOption[] };
  facet?: { label: string; options: AdminFilterOption[] };
  search?: string;
  range: boolean;
};

/** The PostgREST calls a list needs. supabase-js builders satisfy it; typing them
 *  through this narrow shape keeps the compiler out of the builder's deep generics. */
type Query = PromiseLike<{ data: unknown; count: number | null; error: { message: string } | null }> & {
  eq(column: string, value: unknown): Query;
  in(column: string, values: readonly unknown[]): Query;
  gte(column: string, value: unknown): Query;
  or(filters: string): Query;
  ilike(column: string, pattern: string): Query;
  not(column: string, operator: string, value: string): Query;
  order(column: string, options: { ascending: boolean }): Query;
  limit(count: number): Query;
  range(from: number, to: number): Query;
};

function table(name: string, select: string, options?: { count: "exact"; head?: boolean }): Query {
  return createAdminClient().from(name).select(select, options) as unknown as Query;
}

type ListSpec = {
  table: string;
  select: string;
  order: string;
  ascending?: boolean;
  /** Rows this list is limited to before any filter (queues, product types). */
  fixed?: { column: string; values: readonly string[] };
  status?: { column: string; label: string; boolean?: boolean; known?: readonly string[] };
  facet?: { column: string; label: string };
  search?: readonly string[];
  searchLabel?: string;
  dateColumn?: string;
};

const SEARCHABLE = new Set(["name", "title", "code", "slug", "subject", "email", "full_name", "actor_email", "internal_reference", "destination", "provider_reference", "merchant_reference", "dispute_number", "ticket_number", "case_number", "event_type", "component", "key", "device_name", "description", "reason", "message", "endpoint_redacted", "transaction_reference"]);
const FACETABLE = ["service_type", "provider", "network", "channel", "category", "campaign_type", "segment_type", "scope_type", "entity_type", "run_type", "entry_type", "platform", "reward_type", "rule_type", "calculation_type", "placement", "signal_type", "action_type", "direction", "method", "severity", "priority", "risk_level", "report_type", "format", "tier", "kyc_tier"];

function applyFilters(query: Query, spec: ListSpec, input: AdminListQuery, skip?: "status" | "facet"): Query {
  let next = spec.fixed ? query.in(spec.fixed.column, spec.fixed.values) : query;
  if (skip !== "facet" && spec.facet && input.facet) next = next.eq(spec.facet.column, input.facet);
  if (spec.search?.length && input.q) next = next.or(spec.search.map((column) => `${column}.ilike.%${input.q}%`).join(","));
  const since = spec.dateColumn ? rangeStart(input.range) : null;
  if (since && spec.dateColumn) next = next.gte(spec.dateColumn, since);
  if (skip !== "status" && spec.status && input.status) next = next.eq(spec.status.column, spec.status.boolean ? input.status === "enabled" : input.status);
  return next;
}

async function statusOptions(spec: ListSpec, input: AdminListQuery): Promise<AdminWorkspaceFilters["status"]> {
  if (!spec.status) return undefined;
  const { column, label } = spec.status;
  const head = () => applyFilters(table(spec.table, column, { count: "exact", head: true }), spec, input, "status");
  let values: string[];
  if (spec.status.boolean) {
    values = ["enabled", "disabled"];
  } else {
    const { data } = await applyFilters(table(spec.table, column), spec, input, "status").order(spec.order, { ascending: false }).limit(1000);
    const seen = new Set<string>([...(spec.status.known ?? []), ...(input.status ? [input.status] : [])]);
    for (const row of (data ?? []) as unknown as Row[]) if (row[column]) seen.add(String(row[column]));
    values = [...seen];
  }
  const [total, ...counts] = await Promise.all([
    head(),
    ...values.map((value) => head().eq(column, spec.status!.boolean ? value === "enabled" : value)),
  ]);
  const options = values
    .map((value, index) => ({ value, label: titleCase(value), count: counts[index].count ?? 0 }))
    .filter((option) => option.count > 0 || option.value === input.status)
    .sort((a, b) => b.count - a.count);
  return { label, total: total.count ?? 0, options };
}

async function facetOptions(spec: ListSpec, input: AdminListQuery): Promise<AdminWorkspaceFilters["facet"]> {
  if (!spec.facet) return undefined;
  const { data } = await applyFilters(table(spec.table, spec.facet.column), spec, input, "facet").order(spec.order, { ascending: false }).limit(1000);
  const values = new Set<string>(input.facet ? [input.facet] : []);
  for (const row of (data ?? []) as unknown as Row[]) {
    const value = row[spec.facet.column];
    if (value !== null && value !== undefined && value !== "") values.add(String(value));
  }
  if (values.size < 2 && !input.facet) return undefined;
  return { label: spec.facet.label, options: [...values].sort().map((value) => ({ value, label: titleCase(value) })) };
}

async function runList(spec: ListSpec, input: AdminListQuery) {
  const from = (input.page - 1) * ADMIN_PAGE_SIZE;
  const [list, everything, status, facet] = await Promise.all([
    applyFilters(table(spec.table, spec.select, { count: "exact" }), spec, input)
      .order(spec.order, { ascending: Boolean(spec.ascending) })
      .range(from, from + ADMIN_PAGE_SIZE - 1),
    spec.fixed
      ? table(spec.table, spec.order, { count: "exact", head: true }).in(spec.fixed.column, spec.fixed.values)
      : table(spec.table, spec.order, { count: "exact", head: true }),
    statusOptions(spec, input),
    facetOptions(spec, input),
  ]);
  if (list.error) throw list.error;
  const filters: AdminWorkspaceFilters = {
    status,
    facet,
    search: spec.search?.length ? spec.searchLabel ?? "Search" : undefined,
    range: Boolean(spec.dateColumn),
  };
  return { raw: (list.data ?? []) as unknown as Row[], total: list.count ?? 0, all: everything.count ?? list.count ?? 0, filters };
}

function specFromDefinition(definition: GenericDefinition): ListSpec {
  const sourceOf = (column: GenericDefinition["columns"][number]) => column.source ?? column.key;
  const order = definition.order ?? "created_at";
  const booleanStatus = !definition.statusColumn ? definition.columns.find((column) => column.key === "status" && column.kind === "boolean") : undefined;
  const statusSource = definition.statusColumn ?? (booleanStatus ? sourceOf(booleanStatus) : undefined);
  const statusLabel = definition.columns.find((column) => sourceOf(column) === statusSource)?.label ?? "Status";
  const facetColumn = FACETABLE.map((name) => definition.columns.find((column) => sourceOf(column) === name && name !== statusSource)).find(Boolean);
  const search = definition.columns.map(sourceOf).filter((source) => SEARCHABLE.has(source));
  return {
    table: definition.table,
    select: definition.select,
    order,
    ascending: order === "priority" || order === "name" || order === "kyc_tier",
    fixed: definition.filter,
    status: statusSource ? { column: statusSource, label: statusLabel, boolean: Boolean(booleanStatus) } : undefined,
    facet: facetColumn ? { column: sourceOf(facetColumn), label: facetColumn.label } : undefined,
    search,
    searchLabel: `Search ${definition.columns.filter((column) => search.includes(sourceOf(column))).map((column) => column.label.toLowerCase()).slice(0, 2).join(", ")}`,
    dateColumn: /(_at|_date)$/.test(order) ? order : undefined,
  };
}

async function loadGeneric(definition: GenericDefinition, input: AdminListQuery): Promise<AdminWorkspaceData> {
  const spec = specFromDefinition(definition);
  const { raw, total, all, filters } = await runList(spec, input);
  return {
    connected: true,
    source: definition.table,
    columns: definition.columns.map(({ key, label, align }) => ({ key, label, align })),
    rows: raw.map((row, index) => ({
      id: String(row.id ?? row.key ?? row.user_id ?? index),
      cells: Object.fromEntries(definition.columns.map((column) => [column.key, renderValue(valueAt(row, column.source ?? column.key), column.kind)])),
    })),
    total,
    all,
    filters,
    metrics: [],
  };
}

async function loadUsers(input: AdminListQuery): Promise<AdminWorkspaceData> {
  const client = createAdminClient();
  const STATES = ["active", "review", "suspended", "blocked", "closed"] as const;
  const restricted = STATES.filter((state) => state !== "active");

  // Account state lives in customer_account_controls; customers without a row are active.
  let ids: string[] | null = null;
  let excluded: string[] = [];
  if (input.status && input.status !== "active") {
    const { data } = await client.from("customer_account_controls").select("user_id").eq("account_status", input.status).limit(1000);
    ids = (data ?? []).map((row) => String(row.user_id));
  } else if (input.status === "active") {
    const { data } = await client.from("customer_account_controls").select("user_id").in("account_status", restricted).limit(1000);
    excluded = (data ?? []).map((row) => String(row.user_id));
  }

  const since = rangeStart(input.range);
  const scoped = (query: Query) => {
    let next = query;
    if (input.q) next = next.ilike("full_name", `%${input.q}%`);
    if (since) next = next.gte("created_at", since);
    if (ids) next = next.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    if (excluded.length) next = next.not("id", "in", `(${excluded.join(",")})`);
    return next;
  };
  const from = (input.page - 1) * ADMIN_PAGE_SIZE;
  const [{ data: profiles, count, error }, everyone, stateCounts] = await Promise.all([
    scoped(table("profiles", "id,full_name,country_code,state,created_at", { count: "exact" })).order("created_at", { ascending: false }).range(from, from + ADMIN_PAGE_SIZE - 1),
    client.from("profiles").select("id", { count: "exact", head: true }),
    Promise.all(restricted.map((state) => client.from("customer_account_controls").select("user_id", { count: "exact", head: true }).eq("account_status", state))),
  ]);
  if (error) throw error;

  type Profile = { id: string; full_name: string | null; country_code: string | null; state: string | null; created_at: string };
  const profileRows = (profiles ?? []) as Profile[];
  const pageIds = profileRows.map((profile) => profile.id);
  const [{ data: wallets }, { data: controls }] = await Promise.all([
    pageIds.length ? client.from("wallets").select("user_id,available_balance").in("user_id", pageIds) : Promise.resolve({ data: [] as Array<{ user_id: string; available_balance: number }> }),
    pageIds.length ? client.from("customer_account_controls").select("user_id,account_status,risk_level").in("user_id", pageIds) : Promise.resolve({ data: [] as Array<{ user_id: string; account_status: string; risk_level: string }> }),
  ]);
  const balances = new Map((wallets ?? []).map((row) => [row.user_id, Number(row.available_balance)]));
  const states = new Map((controls ?? []).map((row) => [row.user_id, row]));
  const all = everyone.count ?? count ?? 0;
  const restrictedCounts = restricted.map((state, index) => ({ value: state, label: titleCase(state), count: stateCounts[index].count ?? 0 }));
  const activeCount = Math.max(0, all - restrictedCounts.reduce((sum, option) => sum + option.count, 0));

  return {
    connected: true,
    source: "profiles",
    columns: [
      { key: "user", label: "Customer" }, { key: "id", label: "User ID" }, { key: "location", label: "Location" }, { key: "balance", label: "Wallet", align: "right" }, { key: "risk", label: "Risk" }, { key: "status", label: "Status" }, { key: "joined", label: "Joined" },
    ],
    rows: profileRows.map((profile) => ({
      id: String(profile.id),
      href: `/admin/users/${profile.id}`,
      cells: {
        user: profile.full_name || "Unnamed customer",
        id: String(profile.id).slice(0, 8),
        location: [profile.state, profile.country_code].filter(Boolean).join(", ") || "—",
        balance: formatAdminMoney(balances.get(profile.id) ?? 0),
        risk: titleCase(String(states.get(profile.id)?.risk_level ?? "low")),
        status: titleCase(String(states.get(profile.id)?.account_status ?? "active")),
        joined: dateFormatter.format(new Date(profile.created_at)),
      },
    })),
    total: count ?? 0,
    all,
    filters: {
      status: {
        label: "Status",
        total: all,
        options: [{ value: "active", label: "Active", count: activeCount }, ...restrictedCounts].filter((option) => option.count > 0 || option.value === input.status),
      },
      search: "Search customers",
      range: true,
    },
    metrics: [],
  };
}

async function loadWallets(input: AdminListQuery): Promise<AdminWorkspaceData> {
  const client = createAdminClient();
  const spec: ListSpec = { table: "wallets", select: "user_id,available_balance,currency,updated_at", order: "updated_at", dateColumn: "updated_at" };
  const [{ raw, total, all, filters }, { data: balances }] = await Promise.all([
    runList(spec, input),
    client.from("wallets").select("available_balance").limit(10000),
  ]);
  const float = (balances ?? []).reduce((sum, row) => sum + Number(row.available_balance), 0);
  return {
    connected: true,
    source: "wallets",
    columns: [{ key: "customer", label: "Customer" }, { key: "balance", label: "Available balance", align: "right" }, { key: "currency", label: "Currency" }, { key: "updated", label: "Updated" }],
    rows: raw.map((row) => ({
      id: String(row.user_id),
      href: `/admin/users/${row.user_id}`,
      cells: { customer: String(row.user_id), balance: formatAdminMoney(Number(row.available_balance)), currency: String(row.currency ?? "NGN"), updated: dateTimeFormatter.format(new Date(String(row.updated_at))) },
    })),
    total,
    all,
    filters,
    metrics: [{ label: "In customer wallets", value: formatAdminMoney(float) }],
  };
}

const TRANSACTION_STATUSES = ["successful", "pending", "processing", "initiated", "failed", "reversed", "refunded", "cancelled"] as const;

async function loadTransactions(pathname: string, input: AdminListQuery): Promise<AdminWorkspaceData> {
  const queue = pathname.endsWith("/failed") ? ["failed"] : pathname.endsWith("/pending") ? ["initiated", "processing", "pending"] : null;
  const spec: ListSpec = {
    table: "service_transactions",
    select: "id,internal_reference,service_type,destination,amount,status,provider_reference,created_at",
    order: "created_at",
    fixed: queue ? { column: "status", values: queue } : undefined,
    status: queue?.length === 1 ? undefined : { column: "status", label: "Status", known: queue ?? TRANSACTION_STATUSES },
    facet: { column: "service_type", label: "Service" },
    search: ["internal_reference", "destination", "provider_reference"],
    searchLabel: "Search reference or destination",
    dateColumn: "created_at",
  };
  const { raw, total, all, filters } = await runList(spec, input);
  return {
    connected: true,
    source: "service_transactions",
    columns: [{ key: "reference", label: "Reference" }, { key: "service", label: "Service" }, { key: "destination", label: "Destination" }, { key: "amount", label: "Amount", align: "right" }, { key: "status", label: "Status" }, { key: "provider", label: "Provider ref" }, { key: "created", label: "Created" }],
    rows: raw.map((row) => ({
      id: String(row.id),
      href: `/admin/transactions/${row.id}`,
      cells: { reference: String(row.internal_reference), service: titleCase(String(row.service_type)), destination: String(row.destination ?? "—"), amount: formatAdminMoney(Number(row.amount)), status: titleCase(String(row.status)), provider: String(row.provider_reference || "—"), created: dateTimeFormatter.format(new Date(String(row.created_at))) },
    })),
    total,
    all,
    filters,
    metrics: [],
  };
}

async function loadFunding(input: AdminListQuery): Promise<AdminWorkspaceData> {
  const spec: ListSpec = {
    table: "wallet_funding_transactions",
    select: "id,merchant_reference,amount,provider,status,created_at",
    order: "created_at",
    status: { column: "status", label: "Status", known: ["succeeded", "pending", "initializing", "review", "underpaid", "failed", "expired"] },
    facet: { column: "provider", label: "Provider" },
    search: ["merchant_reference"],
    searchLabel: "Search reference",
    dateColumn: "created_at",
  };
  const { raw, total, all, filters } = await runList(spec, input);
  return {
    connected: true,
    source: "wallet_funding_transactions",
    columns: [{ key: "reference", label: "Reference" }, { key: "provider", label: "Provider" }, { key: "amount", label: "Amount", align: "right" }, { key: "status", label: "Status" }, { key: "created", label: "Created" }],
    rows: raw.map((row) => ({
      id: String(row.id ?? row.merchant_reference),
      cells: { reference: String(row.merchant_reference), provider: titleCase(String(row.provider)), amount: formatAdminMoney(Number(row.amount)), status: titleCase(String(row.status)), created: dateTimeFormatter.format(new Date(String(row.created_at))) },
    })),
    total,
    all,
    filters,
    metrics: [],
  };
}

function emptyWorkspace(source = "not_configured"): AdminWorkspaceData {
  return { connected: false, source, columns: [], rows: [], total: 0, all: 0, filters: { range: false }, metrics: [] };
}

export async function loadAdminWorkspace(pathname: string, input: AdminListQuery = parseAdminListQuery({})): Promise<AdminWorkspaceData> {
  try {
    if (pathname === "/admin/users" || pathname === "/admin/analytics/customers") return await loadUsers(input);
    if (pathname === "/admin/customers/wallets") return await loadWallets(input);
    if (["/admin/transactions", "/admin/operations/live", "/admin/operations/failed", "/admin/operations/pending", "/admin/analytics/transactions"].includes(pathname)) return await loadTransactions(pathname, input);
    if (pathname === "/admin/money/funding") return await loadFunding(input);
    if (pathname.startsWith("/admin/services/")) return await loadGeneric(productDefinition(pathname.split("/").at(-1)!), input);
    if (pathname === "/admin/analytics/services") return await loadGeneric(genericWorkspaces["/admin/products"], input);
    if (pathname === "/admin/analytics/reports") return await loadGeneric({ table: "admin_export_jobs", select: "id,report_type,format,status,row_count,created_at,completed_at", order: "created_at", statusColumn: "status", columns: [
      { key: "report", label: "Report", source: "report_type", kind: "status" }, { key: "format", label: "Format" }, { key: "rows", label: "Rows", source: "row_count" }, { key: "status", label: "Status", kind: "status" }, { key: "created", label: "Created", source: "created_at", kind: "date" }, { key: "completed", label: "Completed", source: "completed_at", kind: "date" },
    ] }, input);
    if (pathname === "/admin/platform/config" || pathname === "/admin/settings") return await loadGeneric({ table: "app_configuration", select: "key,description,is_sensitive,updated_at", order: "updated_at", columns: [
      { key: "key", label: "Key" }, { key: "description", label: "Description" }, { key: "sensitive", label: "Sensitive", source: "is_sensitive", kind: "boolean" }, { key: "updated", label: "Updated", source: "updated_at", kind: "date" },
    ] }, input);
    const definition = genericWorkspaces[pathname];
    return definition ? await loadGeneric(definition, input) : emptyWorkspace();
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
