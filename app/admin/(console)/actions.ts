"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  AdminPermissionError,
  materializeAdminSession,
  requireAdminPermission,
} from "../../../lib/admin/auth";
import { recordAdminAudit } from "../../../lib/admin/security";
import { createAdminClient } from "../../../lib/supabase/admin";
import { enqueueAdminJob } from "../../../lib/admin/jobs";
import { getVendor } from "../../../lib/test-engine/vendors";
import type { NetworkId, VendorId } from "../../../lib/test-engine/types";

export type AdminActionResult<T = undefined> = {
  ok: boolean;
  message: string;
  data?: T;
};

const uuid = z.string().uuid();
const reason = z.string().trim().min(5).max(1000);
const money = z.coerce.number().positive().max(5_000_000);

function failure<T = undefined>(error: unknown): AdminActionResult<T> {
  if (error instanceof z.ZodError) return { ok: false, message: error.issues[0]?.message || "Check the details and try again." };
  if (error instanceof AdminPermissionError) return { ok: false, message: "You do not have permission to perform that action." };
  return { ok: false, message: error instanceof Error ? error.message : "That action could not be completed." };
}

function refresh(...paths: string[]) {
  for (const path of paths) revalidatePath(path);
}

export async function addCustomerNote(input: unknown): Promise<AdminActionResult<{ id: string }>> {
  const schema = z.object({ userId: uuid, note: z.string().trim().min(2).max(4000) });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("customers.note");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { data, error } = await client.from("admin_customer_notes").insert({
      user_id: values.userId,
      admin_user_id: adminUserId,
      note: values.note,
      visibility: "internal",
    }).select("id").single();
    if (error || !data) throw new Error("The note could not be saved.");
    await recordAdminAudit(session, { action: "customer.note.created", entityType: "customer", entityId: values.userId, newValue: { noteId: data.id } });
    refresh("/admin/users");
    return { ok: true, message: "Internal note added.", data: { id: String(data.id) } };
  } catch (error) { return failure(error); }
}

export async function updateCustomerControl(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({
    userId: uuid,
    accountStatus: z.enum(["active", "review", "suspended", "blocked", "closed"]),
    walletStatus: z.enum(["active", "frozen", "debits_blocked", "credits_blocked"]),
    riskLevel: z.enum(["low", "medium", "high", "critical"]),
    restrictionReason: reason.optional(),
    restrictedUntil: z.string().datetime().nullable().optional(),
  }).superRefine((value, context) => {
    if ((value.accountStatus !== "active" || value.walletStatus !== "active") && !value.restrictionReason) {
      context.addIssue({ code: "custom", path: ["restrictionReason"], message: "Add a reason for restricting this customer." });
    }
  });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("users.suspend");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { data: oldValue } = await client.from("customer_account_controls").select("*").eq("user_id", values.userId).maybeSingle();
    const next = {
      user_id: values.userId,
      account_status: values.accountStatus,
      wallet_status: values.walletStatus,
      risk_level: values.riskLevel,
      restriction_reason: values.restrictionReason ?? null,
      restricted_until: values.restrictedUntil ?? null,
      updated_by: adminUserId,
    };
    const { error } = await client.from("customer_account_controls").upsert(next, { onConflict: "user_id" });
    if (error) throw new Error("The customer controls could not be updated.");
    await recordAdminAudit(session, { action: "customer.controls.updated", entityType: "customer", entityId: values.userId, oldValue, newValue: next, reason: values.restrictionReason });
    refresh("/admin/users", "/admin/risk/blocked");
    return { ok: true, message: "Customer controls updated." };
  } catch (error) { return failure(error); }
}

export async function requestWalletAdjustment(input: unknown): Promise<AdminActionResult<{ requestId: string }>> {
  const schema = z.object({ userId: uuid, direction: z.enum(["credit", "debit"]), amount: money, reason });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("wallet.adjust");
    const adminUserId = await materializeAdminSession(session);
    const reference = `ADJ-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const client = createAdminClient();
    const { data, error } = await client.rpc("admin_request_wallet_adjustment", {
      p_requester_id: adminUserId,
      p_user_id: values.userId,
      p_direction: values.direction,
      p_amount: values.amount,
      p_reference: reference,
      p_reason: values.reason,
    });
    if (error || !data?.[0]) throw new Error(error?.message || "The adjustment request could not be created.");
    const requestId = String(data[0].adjustment_request_id);
    await recordAdminAudit(session, { action: "wallet.adjustment.requested", entityType: "wallet_adjustment", entityId: requestId, newValue: { ...values, reference }, reason: values.reason });
    refresh("/admin/customers/wallets", "/admin/operations/manual");
    return { ok: true, message: "Adjustment sent for independent approval.", data: { requestId } };
  } catch (error) { return failure(error); }
}

export async function decideApproval(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({ requestId: uuid, decision: z.enum(["approve", "reject"]), note: z.string().trim().max(1000).optional() });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("approvals.review");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { data: oldValue } = await client.from("admin_approval_requests").select("*").eq("id", values.requestId).single();
    const { error } = await client.rpc("admin_record_approval_decision", {
      p_request_id: values.requestId,
      p_admin_user_id: adminUserId,
      p_decision: values.decision,
      p_note: values.note ?? null,
    });
    if (error) throw new Error(error.message);
    await recordAdminAudit(session, { action: `approval.${values.decision}d`, entityType: "approval_request", entityId: values.requestId, oldValue, newValue: { decision: values.decision, note: values.note } });
    refresh("/admin/operations/manual");
    return { ok: true, message: values.decision === "approve" ? "Approval recorded." : "Request rejected." };
  } catch (error) { return failure(error); }
}

export async function executeWalletAdjustment(input: unknown): Promise<AdminActionResult<{ ledgerEntryId: string; balance: number }>> {
  const schema = z.object({ adjustmentId: uuid });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("wallet.adjust");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { data: oldValue } = await client.from("wallet_adjustment_requests").select("*").eq("id", values.adjustmentId).single();
    const { data, error } = await client.rpc("admin_execute_wallet_adjustment", { p_adjustment_request_id: values.adjustmentId, p_executor_id: adminUserId });
    if (error || !data?.[0]) throw new Error(error?.message || "The approved adjustment could not be executed.");
    const result = { ledgerEntryId: String(data[0].ledger_entry_id), balance: Number(data[0].balance) };
    await recordAdminAudit(session, { action: "wallet.adjustment.executed", entityType: "wallet_adjustment", entityId: values.adjustmentId, oldValue, newValue: result, reason: oldValue?.reason });
    refresh("/admin/customers/wallets", "/admin/money/ledger", "/admin/operations/manual");
    return { ok: true, message: "Wallet adjustment executed and ledgered.", data: result };
  } catch (error) { return failure(error); }
}

export async function transitionServiceTransaction(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({ transactionId: uuid, status: z.enum(["processing", "pending", "successful", "failed", "reversed", "refunded", "cancelled"]), summary: z.string().trim().min(5).max(1000) });
  try {
    const values = schema.parse(input);
    const permission = ["reversed", "refunded"].includes(values.status) ? "transactions.refund" : "transactions.retry";
    const session = await requireAdminPermission(permission);
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { data: oldValue } = await client.from("service_transactions").select("id,status,failure_code,failure_reason").eq("id", values.transactionId).single();
    const { error } = await client.rpc("admin_transition_service_transaction", {
      p_transaction_id: values.transactionId,
      p_to_status: values.status,
      p_summary: values.summary,
      p_actor_type: "admin",
      p_actor_id: adminUserId,
      p_metadata: { request_source: "funda_admin" },
    });
    if (error) throw new Error(error.message);
    await recordAdminAudit(session, { action: "transaction.status.changed", entityType: "service_transaction", entityId: values.transactionId, oldValue, newValue: { status: values.status }, reason: values.summary });
    refresh("/admin/transactions", "/admin/operations/live", "/admin/operations/failed", "/admin/operations/pending");
    return { ok: true, message: "Transaction timeline updated." };
  } catch (error) { return failure(error); }
}

export async function requestRefund(input: unknown): Promise<AdminActionResult<{ refundRequestId: string }>> {
  const schema = z.object({ transactionId: uuid, amount: money, reason });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("transactions.refund");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { data, error } = await client.rpc("admin_request_refund", {
      p_requester_id: adminUserId,
      p_transaction_id: values.transactionId,
      p_amount: values.amount,
      p_reason: values.reason,
    });
    if (error || !data?.[0]) throw new Error(error?.message || "The refund request could not be created.");
    const refundRequestId = String(data[0].refund_request_id);
    await recordAdminAudit(session, { action: "refund.requested", entityType: "refund_request", entityId: refundRequestId, newValue: values, reason: values.reason });
    refresh("/admin/money/refunds", "/admin/operations/manual");
    return { ok: true, message: "Refund sent for independent approval.", data: { refundRequestId } };
  } catch (error) { return failure(error); }
}

export async function executeRefund(input: unknown): Promise<AdminActionResult<{ ledgerEntryId: string; balance: number }>> {
  const schema = z.object({ refundRequestId: uuid });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("transactions.refund");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { data: oldValue } = await client.from("refund_requests").select("*").eq("id", values.refundRequestId).single();
    const { data, error } = await client.rpc("admin_execute_refund", { p_refund_request_id: values.refundRequestId, p_executor_id: adminUserId });
    if (error || !data?.[0]) throw new Error(error?.message || "The approved refund could not be executed.");
    const result = { ledgerEntryId: String(data[0].ledger_entry_id), balance: Number(data[0].balance) };
    await recordAdminAudit(session, { action: "refund.executed", entityType: "refund_request", entityId: values.refundRequestId, oldValue, newValue: result, reason: oldValue?.reason });
    refresh("/admin/money/refunds", "/admin/money/ledger", "/admin/transactions");
    return { ok: true, message: "Refund credited and ledgered.", data: result };
  } catch (error) { return failure(error); }
}

export async function saveProvider(input: unknown): Promise<AdminActionResult<{ id: string }>> {
  const schema = z.object({
    id: uuid.optional(), name: z.string().trim().min(2).max(100), slug: z.string().regex(/^[a-z][a-z0-9-]{1,49}$/),
    status: z.enum(["operational", "degraded", "down", "maintenance", "standby"]), priority: z.coerce.number().int().min(1).max(1000), capabilities: z.array(z.string().trim().min(2).max(50)).max(20),
    environment: z.enum(["sandbox", "live"]).default("sandbox"), apiBaseUrl: z.string().url().nullable().optional(), catalogueEndpoint: z.string().max(300).nullable().optional(), purchaseEndpoint: z.string().max(300).nullable().optional(), requeryEndpoint: z.string().max(300).nullable().optional(), balanceEndpoint: z.string().max(300).nullable().optional(), apiSecretReference: z.string().trim().max(120).nullable().optional(), webhookSecretReference: z.string().trim().max(120).nullable().optional(), documentationUrl: z.string().url().nullable().optional(), websiteUrl: z.string().url().nullable().optional(), supportEmail: z.string().email().nullable().optional(), supportPhone: z.string().trim().max(40).nullable().optional(), notes: z.string().trim().max(2000).nullable().optional(),
  });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("providers.manage");
    const client = createAdminClient();
    const { data: oldValue } = values.id ? await client.from("provider_registry").select("*").eq("id", values.id).maybeSingle() : { data: null };
    const record = { id: values.id, name: values.name, slug: values.slug, status: values.status, priority: values.priority, capabilities: values.capabilities, environment: values.environment, api_base_url: values.apiBaseUrl ?? null, catalogue_endpoint: values.catalogueEndpoint ?? null, purchase_endpoint: values.purchaseEndpoint ?? null, requery_endpoint: values.requeryEndpoint ?? null, balance_endpoint: values.balanceEndpoint ?? null, api_secret_reference: values.apiSecretReference ?? null, webhook_secret_reference: values.webhookSecretReference ?? null, documentation_url: values.documentationUrl ?? null, website_url: values.websiteUrl ?? null, support_email: values.supportEmail ?? null, support_phone: values.supportPhone ?? null, notes: values.notes ?? null };
    const { data, error } = await client.from("provider_registry").upsert(record, values.id ? { onConflict: "id" } : undefined).select("id").single();
    if (error || !data) throw new Error("The provider could not be saved.");
    await recordAdminAudit(session, { action: values.id ? "provider.updated" : "provider.created", entityType: "provider", entityId: String(data.id), oldValue, newValue: values });
    refresh("/admin/products/providers", "/admin/platform/integrations");
    return { ok: true, message: "Provider saved.", data: { id: String(data.id) } };
  } catch (error) { return failure(error); }
}

const providerNetworks: NetworkId[] = ["mtn", "airtel", "glo", "9mobile"];
const supportedCatalogueVendors = new Set<VendorId>(["smeplug", "gladtidings", "vtpass", "pairgate"]);

function dataAmountMbFromName(name: string) {
  const match = name.match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB)\b/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = match[2].toUpperCase();
  return unit === "TB" ? amount * 1_000_000 : unit === "GB" ? amount * 1_000 : amount;
}

function validityFromName(name: string) {
  const match = name.match(/\b(\d+(?:\.\d+)?)\s*(day|days|week|weeks|month|months|year|years|hour|hours)\b/i);
  if (!match) return { label: null, hours: null };
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = unit.startsWith("hour") ? 1 : unit.startsWith("day") ? 24 : unit.startsWith("week") ? 24 * 7 : unit.startsWith("month") ? 24 * 30 : 24 * 365;
  return { label: match[0], hours: Number.isFinite(value) ? Math.round(value * multiplier) : null };
}

export async function syncProviderCatalogue(input: unknown): Promise<AdminActionResult<{ imported: number; status: string }>> {
  const schema = z.object({ providerId: uuid });
  try {
    const { providerId } = schema.parse(input);
    const session = await requireAdminPermission("providers.manage");
    const client = createAdminClient();
    const { data: provider, error: providerError } = await client
      .from("provider_registry")
      .select("id,name,slug,status")
      .eq("id", providerId)
      .single();
    if (providerError || !provider) throw new Error("Provider was not found.");
    if (!supportedCatalogueVendors.has(provider.slug as VendorId)) {
      throw new Error(`${provider.name} needs an API adapter before Funda can synchronise its catalogue.`);
    }

    const vendor = getVendor(provider.slug as VendorId);
    if (!vendor.isConfigured()) throw new Error(`${provider.name} is missing its server-side API credentials.`);

    const startedAt = Date.now();
    const settled = await Promise.allSettled(providerNetworks.map((network) => vendor.getDataPlans(network)));
    const plans = settled.flatMap((result, index) => result.status === "fulfilled"
      ? result.value.map((plan) => ({ plan, network: providerNetworks[index] }))
      : []);
    if (!plans.length) {
      const failure = settled.find((result) => result.status === "rejected");
      throw failure?.status === "rejected" ? failure.reason : new Error("No data plans were returned.");
    }

    const catalogueRows = plans
      .filter(({ plan }) => Number.isFinite(plan.amount) && plan.amount > 0 && Boolean(plan.id))
      .map(({ plan, network }) => {
        const validity = validityFromName(plan.name);
        return {
          provider_id: provider.id,
          service_type: "data",
          network_slug: network,
          provider_product_code: plan.id,
          provider_name: plan.name,
          data_amount_mb: dataAmountMbFromName(plan.name),
          validity_hours: validity.hours,
          validity_label: validity.label,
          provider_cost: plan.amount,
          currency: "NGN",
          is_available: true,
          raw_payload: { source: "provider_catalogue_sync", vendor: provider.slug, network, plan },
          imported_at: new Date().toISOString(),
        };
      });
    for (let offset = 0; offset < catalogueRows.length; offset += 250) {
      const { error } = await client
        .from("provider_catalogue_items")
        .upsert(catalogueRows.slice(offset, offset + 250), { onConflict: "provider_id,provider_product_code" });
      if (error) throw new Error(`Catalogue import failed: ${error.message}`);
    }

    const failedNetworks = settled.filter((result) => result.status === "rejected").length;
    const status = failedNetworks ? "degraded" : "operational";
    const latencyMs = Date.now() - startedAt;
    const message = failedNetworks
      ? `${catalogueRows.length} plans imported; ${failedNetworks} network catalogue${failedNetworks === 1 ? "" : "s"} failed.`
      : `${catalogueRows.length} live data plans imported successfully.`;
    const now = new Date().toISOString();
    const [{ error: healthError }, { error: updateError }] = await Promise.all([
      client.from("provider_health_checks").insert({ provider_id: provider.id, component: "catalogue", status, latency_ms: latencyMs, success_rate: Number((((4 - failedNetworks) / 4) * 100).toFixed(2)), message }),
      client.from("provider_registry").update({ status, last_catalogue_sync_at: now, last_health_check_at: now }).eq("id", provider.id),
    ]);
    if (healthError || updateError) throw new Error(healthError?.message || updateError?.message || "Provider health could not be recorded.");
    await recordAdminAudit(session, { action: "provider.catalogue_synced", entityType: "provider", entityId: provider.id, oldValue: { status: provider.status }, newValue: { status, imported: catalogueRows.length, failedNetworks, latencyMs } });
    refresh("/admin/products/providers", "/admin/products/data-bundles", `/admin/products/providers/${provider.id}`);
    return { ok: true, message, data: { imported: catalogueRows.length, status } };
  } catch (error) { return failure(error); }
}

export async function saveDataBundle(input: unknown): Promise<AdminActionResult<{ id: string }>> {
  const schema = z.object({
    id: uuid.optional(), name: z.string().trim().min(2).max(160), network: z.enum(["mtn", "airtel", "glo", "9mobile"]), category: z.string().trim().min(2).max(40), dataAmountMb: z.coerce.number().positive().max(1_000_000), validity: z.string().trim().min(2).max(100), providerCatalogueItemId: uuid.nullable().optional(), providerId: uuid.nullable().optional(), providerProductCode: z.string().trim().max(100).nullable().optional(), providerCost: z.coerce.number().nonnegative().default(0), sellingPrice: z.coerce.number().nonnegative(), placement: z.enum(["none", "home_quick", "data_top", "data_recommended"]).default("none"), badge: z.string().trim().max(24).nullable().optional(), status: z.enum(["draft", "active", "disabled", "archived"]).default("draft"),
  }).refine((value) => !value.providerId || Boolean(value.providerCatalogueItemId && value.providerProductCode), { message: "Choose a complete provider offer or leave the provider mapping empty.", path: ["providerCatalogueItemId"] }).refine((value) => value.providerId || value.status !== "active", { message: "Link a provider offer before publishing this bundle.", path: ["status"] }).refine((value) => value.sellingPrice >= value.providerCost, { message: "Selling price cannot be below provider cost.", path: ["sellingPrice"] });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("products.edit");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { data: oldValue } = values.id ? await client.from("service_products").select("*").eq("id", values.id).maybeSingle() : { data: null };
    const product = { id: values.id, provider_id: values.providerId ?? null, service_type: "data", network: values.network, provider_product_code: values.providerProductCode ?? null, name: values.name, description: `${values.dataAmountMb}MB · ${values.category} · ${values.validity}`, validity: values.validity, provider_cost: values.providerCost, selling_price: values.sellingPrice, status: values.status, featured: values.placement !== "none", metadata: { data_amount_mb: values.dataAmountMb, category: values.category }, created_by: values.id ? oldValue?.created_by : adminUserId, updated_by: adminUserId };
    const { data, error } = await client.from("service_products").upsert(product).select("id").single();
    if (error || !data) throw new Error("The data bundle could not be saved.");
    const productId = String(data.id);
    if (values.providerId && values.providerCatalogueItemId && values.providerProductCode) {
      const { error: offerError } = await client.from("product_provider_offers").upsert({ product_id: productId, provider_id: values.providerId, provider_catalogue_item_id: values.providerCatalogueItemId, provider_product_code: values.providerProductCode, provider_cost: values.providerCost, priority: 100, status: "active" }, { onConflict: "product_id,provider_id,provider_product_code" });
      if (offerError) throw new Error("The bundle was saved, but its provider mapping could not be linked.");
    }
    if (values.placement === "none") await client.from("product_placements").delete().eq("product_id", productId);
    else {
      const { error: placementError } = await client.from("product_placements").upsert({ product_id: productId, surface: values.placement, badge: values.badge ?? null, is_active: values.status === "active" }, { onConflict: "product_id,surface" });
      if (placementError) throw new Error("The bundle was saved, but its placement could not be saved.");
    }
    await recordAdminAudit(session, { action: values.id ? "data_bundle.updated" : "data_bundle.created", entityType: "service_product", entityId: productId, oldValue, newValue: product });
    refresh("/admin/products/data-bundles", "/admin/dashboard");
    return { ok: true, message: "Data bundle saved.", data: { id: productId } };
  } catch (error) { return failure(error); }
}

export async function saveProduct(input: unknown): Promise<AdminActionResult<{ id: string }>> {
  const schema = z.object({ id: uuid.optional(), providerId: uuid.nullable().optional(), serviceType: z.enum(["data", "airtime", "electricity", "cable", "betting", "education", "other"]), network: z.string().trim().max(50).nullable().optional(), providerProductCode: z.string().trim().min(1).max(100), name: z.string().trim().min(2).max(160), description: z.string().trim().max(1000).nullable().optional(), providerCost: z.coerce.number().nonnegative(), sellingPrice: z.coerce.number().nonnegative(), cashbackAmount: z.coerce.number().nonnegative().default(0), status: z.enum(["draft", "active", "disabled", "archived"]), featured: z.boolean().default(false) }).refine((value) => value.sellingPrice >= value.cashbackAmount, { message: "Selling price must cover cashback.", path: ["sellingPrice"] });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("products.edit");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { data: oldValue } = values.id ? await client.from("service_products").select("*").eq("id", values.id).maybeSingle() : { data: null };
    const record = { id: values.id, provider_id: values.providerId ?? null, service_type: values.serviceType, network: values.network ?? null, provider_product_code: values.providerProductCode, name: values.name, description: values.description ?? null, provider_cost: values.providerCost, selling_price: values.sellingPrice, cashback_amount: values.cashbackAmount, status: values.status, featured: values.featured, created_by: values.id ? oldValue?.created_by : adminUserId, updated_by: adminUserId };
    const { data, error } = await client.from("service_products").upsert(record).select("id").single();
    if (error || !data) throw new Error("The product could not be saved.");
    await recordAdminAudit(session, { action: values.id ? "product.updated" : "product.created", entityType: "service_product", entityId: String(data.id), oldValue, newValue: record });
    refresh("/admin/products", `/admin/services/${values.serviceType}`);
    return { ok: true, message: "Product saved.", data: { id: String(data.id) } };
  } catch (error) { return failure(error); }
}

export async function saveFeatureFlag(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({ key: z.string().regex(/^[a-z][a-z0-9_.-]{2,80}$/), name: z.string().trim().min(2).max(100), description: z.string().trim().max(500).nullable().optional(), enabled: z.boolean(), rolloutPercentage: z.coerce.number().int().min(0).max(100), targeting: z.record(z.string(), z.unknown()).default({}) });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("platform.manage");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { data: oldValue } = await client.from("feature_flags").select("*").eq("key", values.key).maybeSingle();
    const record = { key: values.key, name: values.name, description: values.description ?? null, enabled: values.enabled, rollout_percentage: values.rolloutPercentage, targeting: values.targeting, updated_by: adminUserId };
    const { error } = await client.from("feature_flags").upsert(record, { onConflict: "key" });
    if (error) throw new Error("The feature flag could not be saved.");
    await recordAdminAudit(session, { action: "feature_flag.saved", entityType: "feature_flag", entityId: values.key, oldValue, newValue: record });
    refresh("/admin/platform/features");
    return { ok: true, message: "Feature flag saved." };
  } catch (error) { return failure(error); }
}

export async function saveConfiguration(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({ key: z.string().regex(/^[a-z][a-z0-9_.-]{2,100}$/), value: z.unknown(), description: z.string().trim().max(500).nullable().optional(), sensitive: z.boolean().default(false) });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("config.manage");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { data: oldValue } = await client.from("app_configuration").select("*").eq("key", values.key).maybeSingle();
    const record = { key: values.key, value: values.value, description: values.description ?? null, is_sensitive: values.sensitive, updated_by: adminUserId };
    const { error } = await client.from("app_configuration").upsert(record, { onConflict: "key" });
    if (error) throw new Error("The configuration could not be saved.");
    await recordAdminAudit(session, { action: "configuration.saved", entityType: "app_configuration", entityId: values.key, oldValue: oldValue && { ...oldValue, value: oldValue.is_sensitive ? "[redacted]" : oldValue.value }, newValue: { ...record, value: values.sensitive ? "[redacted]" : values.value } });
    refresh("/admin/platform/config");
    return { ok: true, message: "Configuration saved." };
  } catch (error) { return failure(error); }
}

export async function createCoupon(input: unknown): Promise<AdminActionResult<{ id: string }>> {
  const schema = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/), name: z.string().trim().min(2).max(120), rewardType: z.enum(["fixed_discount", "percentage_discount", "cashback", "fee_waiver"]), rewardValue: z.coerce.number().nonnegative(), minimumPurchase: z.coerce.number().nonnegative().default(0), perUserLimit: z.coerce.number().int().min(1).max(100), startsAt: z.string().datetime(), endsAt: z.string().datetime(), budget: z.coerce.number().nonnegative().nullable().optional() }).refine((value) => new Date(value.startsAt) < new Date(value.endsAt), { message: "End date must be after the start date.", path: ["endsAt"] });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("growth.manage");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { data, error } = await client.from("coupons").insert({ code: values.code, name: values.name, reward_type: values.rewardType, reward_value: values.rewardValue, minimum_purchase: values.minimumPurchase, per_user_limit: values.perUserLimit, starts_at: values.startsAt, ends_at: values.endsAt, budget: values.budget ?? null, created_by: adminUserId }).select("id").single();
    if (error || !data) throw new Error("The coupon could not be created.");
    await recordAdminAudit(session, { action: "coupon.created", entityType: "coupon", entityId: String(data.id), newValue: values });
    refresh("/admin/growth/coupons");
    return { ok: true, message: "Coupon created as a draft.", data: { id: String(data.id) } };
  } catch (error) { return failure(error); }
}

export async function createAnnouncement(input: unknown): Promise<AdminActionResult<{ id: string }>> {
  const schema = z.object({ title: z.string().trim().min(2).max(160), body: z.string().trim().min(2).max(4000), placement: z.enum(["dashboard", "banner", "service", "maintenance", "modal"]), priority: z.enum(["low", "normal", "high", "critical"]), audience: z.record(z.string(), z.unknown()).default({ type: "all" }), dismissible: z.boolean().default(true), startsAt: z.string().datetime(), endsAt: z.string().datetime().nullable().optional() });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("notifications.manage");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { data, error } = await client.from("announcements").insert({ title: values.title, body: values.body, placement: values.placement, priority: values.priority, audience: values.audience, dismissible: values.dismissible, starts_at: values.startsAt, ends_at: values.endsAt ?? null, created_by: adminUserId }).select("id").single();
    if (error || !data) throw new Error("The announcement could not be created.");
    await recordAdminAudit(session, { action: "announcement.created", entityType: "announcement", entityId: String(data.id), newValue: values });
    refresh("/admin/growth/announcements", "/admin/growth/notifications");
    return { ok: true, message: "Announcement saved as a draft.", data: { id: String(data.id) } };
  } catch (error) { return failure(error); }
}

export async function reviewKyc(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({ reviewId: uuid, status: z.enum(["in_review", "approved", "rejected", "expired"]), tier: z.coerce.number().int().min(0).max(3), notes: z.string().trim().max(2000).optional() });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("kyc.review");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { data: oldValue, error: readError } = await client.from("kyc_reviews").select("*").eq("id", values.reviewId).single();
    if (readError || !oldValue) throw new Error("KYC review not found.");
    const next = { status: values.status, tier: values.tier, review_notes: values.notes ?? null, reviewed_by: adminUserId, reviewed_at: ["approved", "rejected", "expired"].includes(values.status) ? new Date().toISOString() : null };
    const { error } = await client.from("kyc_reviews").update(next).eq("id", values.reviewId);
    if (error) throw new Error("The KYC decision could not be saved.");
    await recordAdminAudit(session, { action: "kyc.reviewed", entityType: "kyc_review", entityId: values.reviewId, oldValue, newValue: next, reason: values.notes });
    refresh("/admin/customers/kyc", "/admin/risk/limits");
    return { ok: true, message: "KYC review updated." };
  } catch (error) { return failure(error); }
}

export async function createProviderIncident(input: unknown): Promise<AdminActionResult<{ id: string }>> {
  const schema = z.object({ providerId: uuid.nullable().optional(), serviceType: z.string().trim().max(50).nullable().optional(), network: z.string().trim().max(50).nullable().optional(), severity: z.enum(["minor", "major", "critical"]), title: z.string().trim().min(3).max(180), description: z.string().trim().max(4000).nullable().optional() });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("providers.manage");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { data, error } = await client.from("provider_incidents").insert({ provider_id: values.providerId ?? null, service_type: values.serviceType ?? null, network: values.network ?? null, severity: values.severity, title: values.title, description: values.description ?? null, opened_by: adminUserId }).select("id").single();
    if (error || !data) throw new Error("The incident could not be opened.");
    await recordAdminAudit(session, { action: "provider_incident.opened", entityType: "provider_incident", entityId: String(data.id), newValue: values });
    refresh("/admin/operations/incidents", "/admin/products/providers");
    return { ok: true, message: "Incident opened.", data: { id: String(data.id) } };
  } catch (error) { return failure(error); }
}

export async function createSupportTicket(input: unknown): Promise<AdminActionResult<{ id: string }>> {
  const schema = z.object({ userId: uuid.nullable().optional(), transactionId: uuid.nullable().optional(), category: z.string().trim().min(2).max(80), subject: z.string().trim().min(3).max(180), description: z.string().trim().min(5).max(5000), priority: z.enum(["low", "normal", "high", "critical"]) });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("support.manage");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const ticketNumber = `FND-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const { data, error } = await client.from("support_tickets").insert({ ticket_number: ticketNumber, user_id: values.userId ?? null, transaction_id: values.transactionId ?? null, category: values.category, subject: values.subject, description: values.description, priority: values.priority, assigned_to: adminUserId, status: "assigned" }).select("id").single();
    if (error || !data) throw new Error("The support ticket could not be created.");
    await recordAdminAudit(session, { action: "support_ticket.created", entityType: "support_ticket", entityId: String(data.id), newValue: { ...values, ticketNumber } });
    refresh("/admin/operations/support");
    return { ok: true, message: "Support ticket created.", data: { id: String(data.id) } };
  } catch (error) { return failure(error); }
}

export async function createRiskCase(input: unknown): Promise<AdminActionResult<{ id: string }>> {
  const schema = z.object({ userId: uuid.nullable().optional(), transactionId: uuid.nullable().optional(), riskScore: z.coerce.number().int().min(0).max(100), severity: z.enum(["low", "medium", "high", "critical"]), title: z.string().trim().min(3).max(180), summary: z.string().trim().max(4000).nullable().optional() });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("risk.manage");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const caseNumber = `RISK-${Date.now()}-${randomUUID().slice(0, 5).toUpperCase()}`;
    const { data, error } = await client.from("risk_cases").insert({ case_number: caseNumber, user_id: values.userId ?? null, transaction_id: values.transactionId ?? null, risk_score: values.riskScore, severity: values.severity, title: values.title, summary: values.summary ?? null, assigned_to: adminUserId }).select("id").single();
    if (error || !data) throw new Error("The risk case could not be created.");
    await recordAdminAudit(session, { action: "risk_case.created", entityType: "risk_case", entityId: String(data.id), newValue: { ...values, caseNumber } });
    refresh("/admin/risk", "/admin/risk/activity");
    return { ok: true, message: "Risk case opened.", data: { id: String(data.id) } };
  } catch (error) { return failure(error); }
}

export async function startReconciliation(input: unknown): Promise<AdminActionResult<{ id: string }>> {
  const schema = z.object({ providerId: uuid.nullable().optional(), runType: z.enum(["provider", "gateway", "wallet", "daily"]), periodStart: z.string().datetime(), periodEnd: z.string().datetime() }).refine((value) => new Date(value.periodStart) < new Date(value.periodEnd), { message: "The reconciliation period is invalid.", path: ["periodEnd"] });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("reconciliation.manage");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { data, error } = await client.from("reconciliation_runs").insert({ provider_id: values.providerId ?? null, run_type: values.runType, period_start: values.periodStart, period_end: values.periodEnd, started_by: adminUserId }).select("id").single();
    if (error || !data) throw new Error("The reconciliation run could not be queued.");
    await recordAdminAudit(session, { action: "reconciliation.queued", entityType: "reconciliation_run", entityId: String(data.id), newValue: values });
    refresh("/admin/money/reconciliation");
    return { ok: true, message: "Reconciliation queued.", data: { id: String(data.id) } };
  } catch (error) { return failure(error); }
}

export async function queueAdminExport(input: unknown): Promise<AdminActionResult<{ id: string }>> {
  const schema = z.object({ reportType: z.string().trim().min(2).max(100), format: z.enum(["csv", "xlsx", "json"]), filters: z.record(z.string(), z.unknown()).default({}) });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("reports.export");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { data, error } = await client.from("admin_export_jobs").insert({ admin_user_id: adminUserId, report_type: values.reportType, format: values.format, filters: values.filters, expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString() }).select("id").single();
    if (error || !data) throw new Error("The export could not be queued.");
    await enqueueAdminJob("report.export", { exportId: data.id }, `report.export:${data.id}`);
    await recordAdminAudit(session, { action: "report_export.queued", entityType: "admin_export", entityId: String(data.id), newValue: values });
    refresh("/admin/analytics/reports");
    return { ok: true, message: "Export queued.", data: { id: String(data.id) } };
  } catch (error) { return failure(error); }
}

export async function saveAdminUser(input: unknown): Promise<AdminActionResult<{ id: string }>> {
  const schema = z.object({ authUserId: uuid, roleId: uuid, email: z.string().trim().toLowerCase().email(), fullName: z.string().trim().min(2).max(100), status: z.enum(["invited", "active", "suspended", "disabled"]) });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("admins.manage");
    const inviterId = await materializeAdminSession(session);
    if (values.authUserId === session.authUserId && values.status !== "active") throw new Error("You cannot disable your own admin account.");
    const client = createAdminClient();
    const { data: oldValue } = await client.from("admin_users").select("*").eq("auth_user_id", values.authUserId).maybeSingle();
    const record = { auth_user_id: values.authUserId, role_id: values.roleId, email: values.email, full_name: values.fullName, status: values.status, invited_by: oldValue?.invited_by ?? inviterId, two_factor_required: true };
    const { data, error } = await client.from("admin_users").upsert(record, { onConflict: "auth_user_id" }).select("id").single();
    if (error || !data) throw new Error("The admin user could not be saved.");
    await recordAdminAudit(session, { action: oldValue ? "admin_user.updated" : "admin_user.created", entityType: "admin_user", entityId: String(data.id), oldValue, newValue: record });
    refresh("/admin/settings/admins", "/admin/settings/roles");
    return { ok: true, message: "Admin access updated.", data: { id: String(data.id) } };
  } catch (error) { return failure(error); }
}

export async function saveServiceNetwork(input: unknown): Promise<AdminActionResult<{ id: string }>> {
  const schema = z.object({ id: uuid.optional(), name: z.string().trim().min(2).max(80), slug: z.string().trim().regex(/^[a-z0-9-]{2,50}$/), availability: z.enum(["operational", "degraded", "maintenance", "disabled"]), serviceTypes: z.array(z.enum(["data", "airtime", "electricity", "cable", "betting", "education", "other"])).min(1), purchaseLimit: z.coerce.number().positive().nullable().optional(), maintenanceMessage: z.string().trim().max(500).nullable().optional() });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("providers.manage");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { data: oldValue } = values.id ? await client.from("service_networks").select("*").eq("id", values.id).maybeSingle() : { data: null };
    const record = { id: values.id, name: values.name, slug: values.slug, availability: values.availability, service_types: values.serviceTypes, purchase_limit: values.purchaseLimit ?? null, maintenance_message: values.maintenanceMessage ?? null, updated_by: adminUserId };
    const { data, error } = await client.from("service_networks").upsert(record).select("id").single();
    if (error || !data) throw new Error("Network controls could not be saved.");
    await recordAdminAudit(session, { action: values.id ? "network.updated" : "network.created", entityType: "service_network", entityId: String(data.id), oldValue, newValue: record });
    refresh("/admin/services/networks", "/admin/services/data", "/admin/services/airtime");
    return { ok: true, message: "Network controls saved.", data: { id: String(data.id) } };
  } catch (error) { return failure(error); }
}

export async function scheduleAdminJob(input: unknown): Promise<AdminActionResult<{ id: string | null }>> {
  const schema = z.object({ jobType: z.enum(["campaign.fanout", "financial.snapshot", "transactions.sweep_pending", "health.record"]), payload: z.record(z.string(), z.unknown()).default({}), runAt: z.string().datetime().optional() });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("platform.manage");
    const id = await enqueueAdminJob(values.jobType, values.payload, undefined, values.runAt);
    await recordAdminAudit(session, { action: "admin_job.queued", entityType: "admin_job", entityId: id, newValue: values });
    refresh("/admin/platform/health", "/admin/analytics/reports");
    return { ok: true, message: "Administrative job queued.", data: { id } };
  } catch (error) { return failure(error); }
}

export async function queueProviderRequery(input: unknown): Promise<AdminActionResult<{ id: string | null }>> {
  const schema = z.object({ transactionId: uuid, reason });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("transactions.retry");
    const jobId = await enqueueAdminJob("provider.requery", { transactionId: values.transactionId }, `provider.requery:${values.transactionId}`);
    await recordAdminAudit(session, { action: "transaction.requery.queued", entityType: "service_transaction", entityId: values.transactionId, newValue: { jobId }, reason: values.reason });
    refresh("/admin/transactions", "/admin/platform/logs");
    return { ok: true, message: "Provider requery safely queued.", data: { id: jobId } };
  } catch (error) { return failure(error); }
}

export async function invalidateAdminSessions(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({ adminUserId: uuid, reason });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("admins.manage");
    const client = createAdminClient();
    const { data: target, error: targetError } = await client.from("admin_users").select("id,email,auth_user_id,session_invalid_before").eq("id", values.adminUserId).single();
    if (targetError || !target) throw new Error("Admin user was not found.");
    const invalidBefore = new Date().toISOString();
    const { error } = await client.from("admin_users").update({ session_invalid_before: invalidBefore }).eq("id", values.adminUserId);
    if (error) throw new Error("Admin sessions could not be invalidated.");
    await recordAdminAudit(session, { action: "admin_sessions.invalidated", entityType: "admin_user", entityId: values.adminUserId, oldValue: { sessionInvalidBefore: target.session_invalid_before }, newValue: { sessionInvalidBefore: invalidBefore, targetEmail: target.email }, reason: values.reason });
    refresh("/admin/settings/admins", "/admin/settings/security");
    return { ok: true, message: "Active sessions will be blocked; the admin must sign in again." };
  } catch (error) { return failure(error); }
}
