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
import { requeryProviderTransaction } from "../../../lib/admin/providers";
import { dispatchPurchaseReceipt } from "../../../lib/services/receipts";
import { recordCouponRedemption } from "../../../lib/services/routing";
import { recordServiceBeneficiary } from "../../../lib/services/beneficiaries";
import { refreshProductHealth, verifyAllDataBundlesHealth } from "../../../lib/services/plan-health";
import { getVendor } from "../../../lib/test-engine/vendors";
import type { NetworkId, VendorId } from "../../../lib/test-engine/types";
import { matchingAirtimeRule, parseRechargePinBatch, redactRechargeEvidence, rechargeMargin, rechargePrice, type AirtimeRule } from "../../../lib/recharge-cards";
import { settleRechargeCardResult } from "../../../lib/services/recharge-cards";

export type AdminActionResult<T = undefined> = {
  ok: boolean;
  message: string;
  data?: T;
};

const rechargeEvidence = z.string().trim().min(10).max(1000).transform(redactRechargeEvidence);

export async function closeRechargeInvestigation(input: unknown): Promise<AdminActionResult> {
  try {
    const values = z.object({ transactionId: z.string().uuid(), evidenceReference: z.string().trim().min(1).max(200), reason: rechargeEvidence, confirmed: z.literal(true) }).parse(input);
    const session = await requireAdminPermission("reconciliation.manage");
    const actorId = await materializeAdminSession(session);
    const { error } = await createAdminClient().rpc("close_recharge_investigation", { p_transaction_id: values.transactionId, p_evidence_reference: values.evidenceReference, p_reason: values.reason, p_actor_id: actorId });
    if (error) throw new Error("This provider conflict could not be closed.");
    await recordAdminAudit(session, { action: "recharge_card.investigation_closed", entityType: "service_transaction", entityId: values.transactionId, reason: values.reason, newValue: { evidenceReference: values.evidenceReference } });
    refresh("/admin/products/airtime", `/admin/transactions/${values.transactionId}`);
    return { ok: true, message: "Provider investigation closed. No customer wallet movement was made." };
  } catch (error) { return failure(error); }
}

export async function queueRechargeInventoryCheck(): Promise<AdminActionResult> {
  try {
    const session = await requireAdminPermission("providers.manage");
    const jobId = await enqueueAdminJob("recharge.backfill_claims", {}, `recharge.backfill_claims:${randomUUID()}`);
    await recordAdminAudit(session, { action: "recharge_card.inventory_check", entityType: "admin_job", entityId: jobId });
    return { ok: true, message: "Historical PIN inventory check queued. Check worker jobs for its result." };
  } catch (error) { return failure(error); }
}

export async function recordRechargeCardCost(input: unknown): Promise<AdminActionResult> {
  try {
    const values = z.object({ transactionId: z.string().uuid(), cost: z.coerce.number().nonnegative().max(500000), statementReference: z.string().trim().min(1).max(200), reason: rechargeEvidence }).parse(input);
    const session = await requireAdminPermission("reconciliation.manage");
    const actorId = await materializeAdminSession(session);
    const { error } = await createAdminClient().rpc("record_recharge_provider_cost", { p_transaction_id: values.transactionId, p_cost: values.cost, p_statement_reference: values.statementReference, p_reason: values.reason, p_actor_id: actorId });
    if (error) throw new Error("The provider cost could not be reconciled.");
    await recordAdminAudit(session, { action: "recharge_card.cost_reconciled", entityType: "service_transaction", entityId: values.transactionId, reason: values.reason, newValue: { cost: values.cost, statementReference: values.statementReference } });
    refresh("/admin/products/airtime", `/admin/transactions/${values.transactionId}`, "/admin/analytics/reports");
    return { ok: true, message: "Statement cost reconciled. Customer debit, discount and cashback are unchanged." };
  } catch (error) { return failure(error); }
}

export async function saveRechargeCardOffer(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({ id: z.string().uuid().optional(), network: z.enum(["mtn", "airtel", "glo", "9mobile"]), denomination: z.coerce.number().refine((value) => [100,200,500,1000].includes(value)), unitCost: z.coerce.number().positive().max(100000), maxQuantity: z.coerce.number().int().min(1).max(20), isActive: z.boolean(), verified: z.literal(true) });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("providers.manage");
    const client = createAdminClient();
    const [{ data: provider }, { data: rules, error: rulesError }, { data: cashbackFlag }] = await Promise.all([
      client.from("provider_registry").select("id").eq("slug", "maskawasub").maybeSingle(),
      client.from("airtime_provider_routes").select("*").eq("is_active", true),
      client.from("feature_flags").select("enabled").eq("key", "rewards.cashback").maybeSingle(),
    ]);
    if (!provider || rulesError) throw new Error("Register the supported recharge-card provider before adding offers.");
    if (values.isActive) for (let quantity = 1; quantity <= values.maxQuantity; quantity++) {
      const rule = matchingAirtimeRule((rules ?? []) as AirtimeRule[], values.network, "epin", values.denomination * quantity);
      if (!rule || rule.primary_provider !== "maskawasub") continue;
      const price = rechargePrice(values.denomination * quantity, Number(rule.discount_percentage), cashbackFlag?.enabled ? Number(rule.cashback_percentage) : 0);
      if (rechargeMargin(price.payable, price.cashback, values.unitCost * quantity) < 0) throw new Error(`The current discount/cashback loses money at quantity ${quantity}. Update the range rule or save this offer paused.`);
    }
    const record = { network: values.network, denomination: values.denomination, provider_id: provider.id, unit_cost: values.unitCost, max_quantity: values.maxQuantity, is_active: values.isActive, verified_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const query = values.id ? client.from("recharge_card_catalogue").update(record).eq("id", values.id) : client.from("recharge_card_catalogue").insert(record);
    const { data, error } = await query.select("id").single();
    if (error || !data) throw new Error(error?.code === "23505" ? "This denomination already exists for this network. Edit its offer." : "The recharge-card offer could not be saved.");
    await recordAdminAudit(session, { action: values.id ? "recharge_offer.updated" : "recharge_offer.created", entityType: "recharge_card_catalogue", entityId: data.id, newValue: record });
    refresh("/admin/products/airtime");
    return { ok: true, message: "Verified recharge-card offer saved." };
  } catch (error) { return failure(error); }
}

export async function resolveRechargeCardPurchase(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({ transactionId: z.string().uuid(), action: z.enum(["recover", "confirm_failure"]), providerReference: z.string().trim().min(1).max(200), reason: rechargeEvidence, pins: z.string().max(20000).default(""), confirmed: z.literal(true) });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission(values.action === "recover" ? "transactions.retry" : "transactions.refund");
    const actorId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { data: tx, error } = await client.from("service_transactions").select("id,user_id,status,provider_id,metadata").eq("id", values.transactionId).maybeSingle();
    if (error || !tx || tx.metadata?.mode !== "epin" || !tx.provider_id) throw new Error("Recharge-card purchase not found.");
    const legacyRecovery = tx.status === "successful" && tx.metadata.pipelineVersion !== 2 && tx.metadata.deliveryStatus !== "ready" && values.action === "recover";
    if (!["initiated", "processing", "pending"].includes(tx.status) && !legacyRecovery) throw new Error("This order is already final. Review its ledger and dispute record.");
    const expected = { network: tx.metadata.network as NetworkId, denomination: Number(tx.metadata.unitAmount), quantity: Number(tx.metadata.quantity) };
    if (values.action === "confirm_failure" && (Number(tx.metadata.pinCount ?? 0) > 0 || tx.metadata.pins_encrypted || tx.metadata.pins?.length)) throw new Error("This order contains issued PINs. Obtain provider revocation evidence and use the independently approved finance workflow.");
    const pins = values.action === "recover" ? parseRechargePinBatch(values.pins, expected) : undefined;
    const result = await settleRechargeCardResult(tx.id, tx.provider_id, { status: values.action === "recover" ? "successful" : "failed", reference: tx.id, providerReference: values.providerReference, message: values.reason, pins }, expected, actorId, values.reason);
    await recordAdminAudit(session, { action: `recharge_card.${values.action}`, entityType: "service_transaction", entityId: tx.id, reason: values.reason, newValue: { providerReference: values.providerReference, pinCount: pins?.length ?? 0, status: result.status } });
    refresh("/admin/products/airtime", `/admin/transactions/${tx.id}`, "/admin/money/ledger", "/admin/analytics/reports");
    if (result.status === "pending") return { ok: false, message: "This PIN batch has an ownership conflict. The order remains held for investigation; no cashback or refund was issued." };
    if ((values.action === "recover" && result.status !== "successful") || (values.action === "confirm_failure" && !result.refunded)) return { ok: false, message: "Another outcome finalized this order first. No additional wallet movement was made; review its timeline and provider evidence." };
    return { ok: true, message: result.refunded ? "Provider non-delivery recorded. The actual wallet debit was refunded once." : "Verified PINs recovered. The receipt and cashback have been settled." };
  } catch (error) { return failure(error); }
}

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
const supportedCatalogueVendors = new Set<VendorId>(["smeplug", "vtpass", "pairgate", "absvendor", "maskawasub"]);

import {
  dataAmountMbFromName,
  parsePlanValidity,
} from "../../../lib/test-engine/plan-parser";

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
        const validity = parsePlanValidity(plan.name, plan.validity);
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

    // Mark previously synced data plans omitted from this live response as unavailable
    const activeCodes = new Set(catalogueRows.map((row) => row.provider_product_code));
    const { data: existingItems } = await client
      .from("provider_catalogue_items")
      .select("id,provider_product_code,is_available")
      .eq("provider_id", provider.id)
      .eq("service_type", "data")
      .eq("is_available", true);
    const retiredIds = (existingItems ?? [])
      .filter((item) => !activeCodes.has(item.provider_product_code))
      .map((item) => item.id);
    if (retiredIds.length) {
      await client.from("provider_catalogue_items").update({ is_available: false }).in("id", retiredIds);
    }

    const failedNetworks = settled.filter((result) => result.status === "rejected").length;
    const status = failedNetworks ? "degraded" : "operational";
    const latencyMs = Date.now() - startedAt;
    const message = failedNetworks
      ? `${catalogueRows.length} plans imported (${retiredIds.length} retired); ${failedNetworks} network catalogue${failedNetworks === 1 ? "" : "s"} failed.`
      : `${catalogueRows.length} live data plans imported successfully${retiredIds.length ? ` (${retiredIds.length} retired)` : ""}.`;
    const now = new Date().toISOString();
    const [{ error: healthError }, { error: updateError }] = await Promise.all([
      client.from("provider_health_checks").insert({ provider_id: provider.id, component: "catalogue", status, latency_ms: latencyMs, success_rate: Number((((4 - failedNetworks) / 4) * 100).toFixed(2)), message }),
      client.from("provider_registry").update({ status, last_catalogue_sync_at: now, last_health_check_at: now }).eq("id", provider.id),
    ]);
    if (healthError || updateError) throw new Error(healthError?.message || updateError?.message || "Provider health could not be recorded.");
    await verifyAllDataBundlesHealth().catch(() => {});
    await recordAdminAudit(session, { action: "provider.catalogue_synced", entityType: "provider", entityId: provider.id, oldValue: { status: provider.status }, newValue: { status, imported: catalogueRows.length, retired: retiredIds.length, failedNetworks, latencyMs } });
    refresh("/admin/products/providers", "/admin/products/data-bundles", `/admin/products/providers/${provider.id}`, "/admin/dashboard");
    return { ok: true, message, data: { imported: catalogueRows.length, status } };
  } catch (error) { return failure(error); }
}

export async function syncAllDataProviders(): Promise<AdminActionResult<{ imported: number; syncedCount: number }>> {
  try {
    await requireAdminPermission("providers.manage");
    const client = createAdminClient();
    const { data: rows } = await client
      .from("provider_registry")
      .select("id,name,slug")
      .contains("capabilities", ["data"])
      .order("priority");
    const configured = (rows ?? []).filter(
      (row) => supportedCatalogueVendors.has(row.slug as VendorId) && getVendor(row.slug as VendorId).isConfigured(),
    );
    if (!configured.length) {
      throw new Error("No configured data providers were found on the server.");
    }
    let imported = 0;
    let syncedCount = 0;
    const errors: string[] = [];
    for (const row of configured) {
      const res = await syncProviderCatalogue({ providerId: row.id });
      if (res.ok) {
        imported += res.data?.imported ?? 0;
        syncedCount += 1;
      } else {
        errors.push(`${row.name}: ${res.message}`);
      }
    }
    if (!syncedCount) {
      throw new Error(errors.join(" · ") || "Provider sync failed.");
    }
    return {
      ok: true,
      message: errors.length
        ? `Synced ${imported} plans from ${syncedCount} provider(s); ${errors.length} failed.`
        : `Synced ${imported} live plans across ${syncedCount} provider(s).`,
      data: { imported, syncedCount },
    };
  } catch (error) { return failure(error); }
}

export async function toggleDataBundleStatus(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({ id: uuid, status: z.enum(["active", "disabled", "draft"]) });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("products.edit");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { data: bundle, error: fetchError } = await client
      .from("service_products")
      .select("id,status,provider_id,provider_product_code,name")
      .eq("id", values.id)
      .single();
    if (fetchError || !bundle) throw new Error("Bundle was not found.");
    if (values.status === "active" && !bundle.provider_id) {
      throw new Error("Link a supplier offer before activating this bundle.");
    }
    const { error } = await client
      .from("service_products")
      .update({ status: values.status, updated_by: adminUserId })
      .eq("id", values.id);
    if (error) throw new Error("Bundle status could not be updated.");
    await client
      .from("product_placements")
      .update({ is_active: values.status === "active" })
      .eq("product_id", values.id);
    await recordAdminAudit(session, {
      action: "data_bundle.status_changed",
      entityType: "service_product",
      entityId: values.id,
      oldValue: { status: bundle.status },
      newValue: { status: values.status },
    });
    refresh("/admin/products/data-bundles", "/admin/dashboard");
    return { ok: true, message: `${bundle.name} is now ${values.status === "disabled" ? "paused" : values.status}.` };
  } catch (error) { return failure(error); }
}

export async function saveDataBundle(input: unknown): Promise<AdminActionResult<{ id: string }>> {
  const schema = z.object({
    id: uuid.optional(),
    name: z.string().trim().min(2).max(160),
    network: z.enum(["mtn", "airtel", "glo", "9mobile"]),
    category: z.string().trim().min(2).max(40),
    dataAmountMb: z.coerce.number().positive().max(1_000_000),
    validity: z.string().trim().min(2).max(100),
    providerCatalogueItemId: uuid.nullable().optional(),
    providerId: uuid.nullable().optional(),
    providerProductCode: z.string().trim().max(100).nullable().optional(),
    providerCost: z.coerce.number().nonnegative().default(0),
    fallbackProviderId: uuid.nullable().optional(),
    fallbackCatalogueItemId: uuid.nullable().optional(),
    fallbackProductCode: z.string().trim().max(100).nullable().optional(),
    fallbackCost: z.coerce.number().nonnegative().default(0),
    sellingPrice: z.coerce.number().nonnegative(),
    cashbackAmount: z.coerce.number().nonnegative().default(0),
    placement: z.enum(["none", "home_quick", "data_top", "data_recommended"]).default("none"),
    badge: z.string().trim().max(24).nullable().optional(),
    advisoryNote: z.string().trim().max(240).nullable().optional(),
    healthOverride: z.enum(["auto", "healthy", "advisory", "outage"]).optional(),
    status: z.enum(["draft", "active", "disabled", "archived"]).default("draft"),
  }).refine((value) => !value.providerId || Boolean(value.providerProductCode), { message: "Choose a complete primary supplier offer or leave it empty.", path: ["providerCatalogueItemId"] })
    .refine((value) => !value.fallbackProviderId || Boolean(value.fallbackProductCode), { message: "Choose a complete fallback supplier offer or clear fallback.", path: ["fallbackCatalogueItemId"] })
    .refine((value) => value.providerId || value.status !== "active", { message: "Link a primary supplier offer before publishing this bundle.", path: ["status"] })
    .refine((value) => value.sellingPrice >= value.providerCost, { message: "Selling price cannot be below supplier cost.", path: ["sellingPrice"] })
    .refine((value) => value.sellingPrice >= value.cashbackAmount, { message: "Selling price must cover cashback.", path: ["cashbackAmount"] });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("products.edit");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { data: oldValue } = values.id ? await client.from("service_products").select("*").eq("id", values.id).maybeSingle() : { data: null };
    const existingMeta = ((oldValue?.metadata as Record<string, unknown> | null) ?? {}) || {};
    const prevHealth = ((existingMeta.health as Record<string, unknown> | undefined) ?? {}) || {};
    const nextHealth = {
      ...prevHealth,
      ...(values.healthOverride !== undefined ? { overrideStatus: values.healthOverride } : {}),
      ...(values.advisoryNote !== undefined ? { customNotice: values.advisoryNote?.trim() || null } : {}),
    };
    const product = {
      id: values.id,
      provider_id: values.providerId ?? null,
      service_type: "data",
      network: values.network,
      provider_product_code: values.providerProductCode ?? null,
      name: values.name,
      description: `${values.dataAmountMb}MB · ${values.category} · ${values.validity}`,
      validity: values.validity,
      provider_cost: values.providerCost,
      selling_price: values.sellingPrice,
      cashback_amount: values.cashbackAmount,
      status: values.status,
      featured: values.placement !== "none",
      metadata: {
        ...existingMeta,
        data_amount_mb: values.dataAmountMb,
        category: values.category,
        health: nextHealth,
      },
      created_by: values.id ? oldValue?.created_by : adminUserId,
      updated_by: adminUserId,
    };
    const { data, error } = await client.from("service_products").upsert(product).select("id").single();
    if (error || !data) throw new Error("The data bundle could not be saved.");
    const productId = String(data.id);

    // Pause older mappings before writing active primary (100) + fallback (200) offers
    if (values.id) {
      await client.from("product_provider_offers").update({ status: "paused" }).eq("product_id", productId);
    }
    if (values.providerId && values.providerProductCode) {
      const { error: offerError } = await client.from("product_provider_offers").upsert(
        {
          product_id: productId,
          provider_id: values.providerId,
          provider_catalogue_item_id: values.providerCatalogueItemId ?? null,
          provider_product_code: values.providerProductCode,
          provider_cost: values.providerCost,
          priority: 100,
          status: "active",
        },
        { onConflict: "product_id,provider_id,provider_product_code" },
      );
      if (offerError) throw new Error("The bundle was saved, but its primary provider mapping could not be linked.");
    }
    if (values.fallbackProviderId && values.fallbackProductCode) {
      const isSamePrimary =
        values.fallbackProviderId === values.providerId && values.fallbackProductCode === values.providerProductCode;
      if (!isSamePrimary) {
        await client.from("product_provider_offers").upsert(
          {
            product_id: productId,
            provider_id: values.fallbackProviderId,
            provider_catalogue_item_id: values.fallbackCatalogueItemId ?? null,
            provider_product_code: values.fallbackProductCode,
            provider_cost: values.fallbackCost,
            priority: 200,
            status: "active",
          },
          { onConflict: "product_id,provider_id,provider_product_code" },
        );
      }
    }

    if (values.placement === "none") await client.from("product_placements").delete().eq("product_id", productId);
    else {
      const { error: placementError } = await client.from("product_placements").upsert({ product_id: productId, surface: values.placement, badge: values.badge ?? null, is_active: values.status === "active" }, { onConflict: "product_id,surface" });
      if (placementError) throw new Error("The bundle was saved, but its placement could not be saved.");
    }
    await refreshProductHealth(productId).catch(() => {});
    await recordAdminAudit(session, { action: values.id ? "data_bundle.updated" : "data_bundle.created", entityType: "service_product", entityId: productId, oldValue, newValue: product });
    refresh("/admin/products/data-bundles", "/admin/dashboard");
    return { ok: true, message: "Data bundle saved.", data: { id: productId } };
  } catch (error) { return failure(error); }
}

export async function runDataBundleHealthCheck(): Promise<AdminActionResult<{ checked: number; healthy: number; advisory: number; degraded: number; outage: number; missingFromCatalogue: number; marginWarnings: number }>> {
  try {
    const session = await requireAdminPermission("products.view");
    let syncNote = "";
    try {
      const syncRes = await syncAllDataProviders();
      if (syncRes.ok) syncNote = `${syncRes.data?.syncedCount ?? 0} provider(s) synced · `;
    } catch {
      // Proceed with catalogue & telemetry evaluation even if no live provider key is configured locally
    }
    const summary = await verifyAllDataBundlesHealth();
    await recordAdminAudit(session, {
      action: "data_bundle.health_checked",
      entityType: "service_product",
      newValue: summary,
    });
    refresh("/admin/products/data-bundles", "/admin/dashboard");
    return {
      ok: true,
      message: `${syncNote}Checked ${summary.checked} bundles: ${summary.healthy} healthy, ${summary.advisory} SIM-advisory, ${summary.degraded + summary.outage} degraded/unavailable${summary.marginWarnings ? ` · ${summary.marginWarnings} margin alerts` : ""}.`,
      data: summary,
    };
  } catch (error) { return failure(error); }
}

export async function checkSingleDataBundleHealth(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({ productId: uuid });
  try {
    const { productId } = schema.parse(input);
    const session = await requireAdminPermission("products.view");
    const client = createAdminClient();
    const { data: bundle } = await client
      .from("service_products")
      .select("id,network,provider_id,provider_product_code,provider:provider_registry(slug)")
      .eq("id", productId)
      .maybeSingle();

    let liveChecked = false;
    const provRel = bundle ? (Array.isArray(bundle.provider) ? bundle.provider[0] : bundle.provider) : null;
    const slug = provRel?.slug as VendorId | undefined;
    const network = (bundle?.network || "").toLowerCase() as NetworkId;

    if (
      bundle?.provider_id &&
      bundle.provider_product_code &&
      slug &&
      supportedCatalogueVendors.has(slug) &&
      (["mtn", "airtel", "glo", "9mobile"] as const).includes(network)
    ) {
      const vendor = getVendor(slug);
      if (vendor.isConfigured()) {
        try {
          const livePlans = await vendor.getDataPlans(network);
          if (livePlans.length > 0) {
            liveChecked = true;
            const matched = livePlans.find((p) => String(p.id) === String(bundle.provider_product_code));
            await client
              .from("provider_catalogue_items")
              .update(
                matched
                  ? { is_available: true, provider_cost: matched.amount, imported_at: new Date().toISOString() }
                  : { is_available: false },
              )
              .eq("provider_id", bundle.provider_id)
              .eq("provider_product_code", bundle.provider_product_code);
          }
        } catch {
          // Fall back cleanly to stored catalogue & telemetry
        }
      }
    }

    const snap = await refreshProductHealth(productId);
    if (!snap) throw new Error("Bundle not found.");
    await recordAdminAudit(session, {
      action: "data_bundle.single_health_checked",
      entityType: "service_product",
      entityId: productId,
      newValue: { liveChecked, status: snap.status, catalogueAvailable: snap.catalogueAvailable, successRate: snap.successRate },
    });
    refresh("/admin/products/data-bundles", "/admin/dashboard");
    const label =
      snap.status === "outage"
        ? "Unavailable"
        : snap.status === "degraded"
          ? "Degraded"
          : snap.status === "advisory"
            ? "SIM Advisory"
            : snap.status === "healthy"
              ? "Verified"
              : "Unchecked";
    return {
      ok: true,
      message: `${label}${snap.successRate !== null ? ` (${snap.successRate}% success)` : ""}${liveChecked ? " · live vendor checked" : ""}.`,
    };
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
    if (values.reportType === "recharge_cards") {
      const period = z.object({ since: z.string().datetime({ offset: true }).optional(), until: z.string().datetime({ offset: true }).optional(), status: z.enum(["initiated", "processing", "pending", "successful", "failed", "refunded", "reversed", "cancelled"]).optional(), network: z.enum(["mtn", "airtel", "glo", "9mobile"]).optional() }).parse(values.filters);
      const until = period.until ?? new Date().toISOString();
      const since = period.since ?? new Date(Date.parse(until) - 30 * 86400000).toISOString();
      if (Date.parse(since) >= Date.parse(until)) throw new Error("Choose a valid report period.");
      values.filters = { ...period, since, until };
    }
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
    refresh("/admin/transactions", `/admin/transactions/${values.transactionId}`, "/admin/platform/logs", "/admin/products/data-bundles");
    return { ok: true, message: "Provider requery safely queued.", data: { id: jobId } };
  } catch (error) { return failure(error); }
}

export async function runProviderRequeryNow(input: unknown): Promise<AdminActionResult<{ status: string }>> {
  const schema = z.object({ transactionId: uuid, reason: z.string().trim().min(3).max(500).default("Operator ran live provider status check.") });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("transactions.retry");
    const res = await requeryProviderTransaction(values.transactionId);
    await recordAdminAudit(session, {
      action: "transaction.requery.executed",
      entityType: "service_transaction",
      entityId: values.transactionId,
      newValue: res,
      reason: values.reason,
    });
    refresh("/admin/transactions", `/admin/transactions/${values.transactionId}`, "/admin/operations/live", "/admin/operations/pending", "/admin/operations/failed", "/admin/products/data-bundles", "/admin/dashboard");
    return {
      ok: true,
      message: res.skipped
        ? `Transaction is already final (${res.status}).`
        : `Provider responded: ${res.status}${res.refunded ? " (wallet refunded)" : ""}.`,
      data: { status: res.status },
    };
  } catch (error) { return failure(error); }
}

export async function resolveTransactionConflict(input: unknown): Promise<AdminActionResult<{ status: string; balance: number }>> {
  const schema = z.object({
    transactionId: uuid,
    resolution: z.enum(["settle_success", "refund_fail"]),
    providerReference: z.string().trim().max(120).optional(),
    reason,
  });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission(values.resolution === "refund_fail" ? "transactions.refund" : "transactions.retry");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { data: tx, error: txError } = await client
      .from("service_transactions")
      .select("id,user_id,internal_reference,provider_reference,service_type,destination,amount,cashback_amount,status,metadata,product:service_products(name,network)")
      .eq("id", values.transactionId)
      .single();
    if (txError || !tx) throw new Error("Transaction not found.");

    const nextStatus = values.resolution === "settle_success" ? "successful" : "failed";
    if (values.resolution === "settle_success" && ["failed", "refunded", "reversed", "cancelled"].includes(tx.status)) {
      throw new Error("A refunded or failed transaction cannot be flipped back to successful.");
    }
    if (values.resolution === "refund_fail" && ["failed", "refunded", "reversed"].includes(tx.status)) {
      throw new Error("This transaction has already been refunded.");
    }

    const settlement = await client.rpc("customer_settle_service_purchase", {
      p_user_id: tx.user_id,
      p_transaction_id: tx.id,
      p_status: nextStatus,
      p_summary: `Admin resolution (${values.resolution === "settle_success" ? "confirmed delivery" : "failed & refunded"}): ${values.reason}`.slice(0, 1000),
      p_provider_reference: values.providerReference?.trim() || tx.provider_reference || null,
      p_metadata: { resolvedBy: adminUserId, resolution: values.resolution, reason: values.reason },
    });
    if (settlement.error) throw new Error(settlement.error.message || "Could not settle transaction.");

    const settled = (settlement.data?.[0] ?? {}) as { balance?: number; refunded?: boolean };
    const meta = (tx.metadata ?? {}) as { productName?: string; network?: string; couponCode?: string | null; discountAmount?: number; listPrice?: number };
    const productRel = Array.isArray(tx.product) ? tx.product[0] : tx.product;
    const productName = meta.productName || productRel?.name || `${tx.service_type.toUpperCase()} Purchase`;
    const network = meta.network || productRel?.network || undefined;

    if (nextStatus === "successful") {
      if (meta.couponCode) await recordCouponRedemption(meta.couponCode);
      if ((tx.service_type === "data" || tx.service_type === "airtime") && network) {
        void recordServiceBeneficiary({
          userId: tx.user_id,
          serviceType: tx.service_type,
          recipient: tx.destination,
          networkOrDisco: network,
          label: `${network.toUpperCase()} ${tx.service_type === "data" ? "Data" : "Airtime"}`,
        });
      }
    }

    await dispatchPurchaseReceipt({
      userId: tx.user_id,
      transactionId: tx.id,
      reference: tx.internal_reference,
      providerReference: values.providerReference?.trim() || tx.provider_reference || null,
      productName,
      amount: Number(tx.amount),
      originalAmount: meta.listPrice,
      discountAmount: meta.discountAmount,
      couponCode: meta.couponCode ?? null,
      cashback: nextStatus === "successful" ? Number(tx.cashback_amount ?? 0) : 0,
      destination: tx.destination,
      network,
      serviceType: tx.service_type,
      status: nextStatus,
      message: values.reason,
      balance: Number(settled.balance ?? 0),
    });

    await recordAdminAudit(session, {
      action: `transaction.conflict.${values.resolution}`,
      entityType: "service_transaction",
      entityId: tx.id,
      oldValue: { status: tx.status },
      newValue: { status: nextStatus, balance: settled.balance, refunded: settled.refunded },
      reason: values.reason,
    });
    refresh("/admin/transactions", `/admin/transactions/${tx.id}`, "/admin/operations/live", "/admin/operations/pending", "/admin/operations/failed", "/admin/products/data-bundles", "/admin/money/refunds", "/admin/dashboard");
    return {
      ok: true,
      message: nextStatus === "failed"
        ? `Resolved as failed and refunded ₦${Number(tx.amount).toLocaleString("en-NG")} to customer wallet.`
        : "Resolved as successful and settled customer rewards & receipt.",
      data: { status: nextStatus, balance: Number(settled.balance ?? 0) },
    };
  } catch (error) { return failure(error); }
}

export async function resendTransactionReceipt(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({ transactionId: uuid });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("transactions.view");
    const client = createAdminClient();
    const { data: tx, error } = await client
      .from("service_transactions")
      .select("id,user_id,internal_reference,provider_reference,service_type,destination,amount,cashback_amount,status,metadata,product:service_products(name,network)")
      .eq("id", values.transactionId)
      .single();
    if (error || !tx) throw new Error("Transaction not found.");
    const meta = (tx.metadata ?? {}) as { productName?: string; network?: string; couponCode?: string | null; discountAmount?: number; listPrice?: number; token?: string | null; units?: string | null };
    const productRel = Array.isArray(tx.product) ? tx.product[0] : tx.product;
    const mappedStatus = tx.status === "successful" ? "successful" : tx.status === "failed" || tx.status === "refunded" || tx.status === "reversed" ? "failed" : "pending";
    await dispatchPurchaseReceipt({
      userId: tx.user_id,
      transactionId: tx.id,
      reference: tx.internal_reference,
      providerReference: tx.provider_reference ?? null,
      productName: meta.productName || productRel?.name || `${tx.service_type.toUpperCase()} Purchase`,
      amount: Number(tx.amount),
      originalAmount: meta.listPrice,
      discountAmount: meta.discountAmount,
      couponCode: meta.couponCode ?? null,
      cashback: mappedStatus === "successful" ? Number(tx.cashback_amount ?? 0) : 0,
      destination: tx.destination,
      network: meta.network || productRel?.network || undefined,
      serviceType: tx.service_type,
      token: meta.token ?? null,
      units: meta.units ?? null,
      status: mappedStatus,
    });
    await recordAdminAudit(session, { action: "transaction.receipt_resent", entityType: "service_transaction", entityId: tx.id });
    return { ok: true, message: "Receipt notification & email dispatched to customer." };
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

export async function resolvePaymentReview(input: unknown): Promise<AdminActionResult<{ balance: number }>> {
  const schema = z.object({ reviewId: uuid, customer: z.string().trim().min(3).max(320), reason });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("wallet.adjust");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    let userId = uuid.safeParse(values.customer).success ? values.customer : null;
    if (!userId) {
      const { data: found } = await client.rpc("admin_find_user_id_by_email", { p_email: values.customer });
      userId = typeof found === "string" ? found : null;
    }
    if (!userId) throw new Error("No customer matches that email or ID.");
    const { data: oldValue } = await client.from("payment_review_queue").select("id,reason,amount,charge_id,status,suggested_user_id").eq("id", values.reviewId).single();
    const { data, error } = await client.rpc("admin_resolve_payment_review", {
      p_review_id: values.reviewId,
      p_user_id: userId,
      p_admin_user_id: adminUserId,
      p_note: values.reason,
    });
    if (error || !data?.[0]) throw new Error(error?.message || "The payment could not be credited.");
    const result = { balance: Number(data[0].balance) };
    await recordAdminAudit(session, { action: "payment_review.credited", entityType: "payment_review", entityId: values.reviewId, oldValue, newValue: { userId, ...result }, reason: values.reason });
    refresh("/admin/money/payment-reviews", "/admin/money/ledger", "/admin/money/funding");
    return { ok: true, message: "Payment credited to the customer's wallet.", data: result };
  } catch (error) { return failure(error); }
}

export async function dismissPaymentReview(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({ reviewId: uuid, reason });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("wallet.adjust");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();
    const { error } = await client.rpc("admin_dismiss_payment_review", { p_review_id: values.reviewId, p_admin_user_id: adminUserId, p_note: values.reason });
    if (error) throw new Error(error.message);
    await recordAdminAudit(session, { action: "payment_review.dismissed", entityType: "payment_review", entityId: values.reviewId, reason: values.reason });
    refresh("/admin/money/payment-reviews");
    return { ok: true, message: "Review item dismissed. No wallet was credited." };
  } catch (error) { return failure(error); }
}

export async function saveAirtimeRoute(input: unknown): Promise<AdminActionResult<{ id: string }>> {
  const schema = z.object({
    id: uuid.optional(),
    network: z.enum(["all", "mtn", "airtel", "glo", "9mobile"]),
    mode: z.enum(["all", "vtu", "epin"]),
    minAmount: z.coerce.number().min(50).max(500000),
    maxAmount: z.coerce.number().min(50).max(500000),
    primaryProvider: z.string().trim().min(2),
    fallbackProvider: z.string().trim().nullable().optional(),
    discountPercentage: z.coerce.number().min(0).max(99.99).default(0),
    cashbackPercentage: z.coerce.number().min(0).max(100).default(0),
    priority: z.coerce.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
  });
  try {
    const values = schema.parse(input);
    if (values.minAmount > values.maxAmount) throw new Error("Minimum amount cannot exceed maximum amount.");
    if (values.primaryProvider === values.fallbackProvider) throw new Error("Primary and fallback providers must differ.");
    if (values.isActive && values.mode === "epin" && (values.primaryProvider !== "maskawasub" || values.fallbackProvider)) throw new Error("Recharge cards require Maskawasub with no top-up fallback.");
    const session = await requireAdminPermission("providers.manage");
    const client = createAdminClient();

    const record = {
      ...(values.id ? { id: values.id } : {}),
      network: values.network,
      mode: values.mode,
      min_amount: values.minAmount,
      max_amount: values.maxAmount,
      primary_provider: values.primaryProvider,
      fallback_provider: values.fallbackProvider || null,
      discount_percentage: values.discountPercentage,
      cashback_percentage: values.cashbackPercentage,
      priority: values.priority,
      is_active: values.isActive,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from("airtime_provider_routes")
      .upsert(record)
      .select("id")
      .single();

    if (error || !data) throw new Error(error?.message || "Could not save airtime route.");

    await recordAdminAudit(session, {
      action: values.id ? "airtime_route.updated" : "airtime_route.created",
      entityType: "airtime_route",
      entityId: String(data.id),
      newValue: record,
    });

    refresh("/admin/products/airtime");
    return { ok: true, message: "Airtime route rule saved.", data: { id: String(data.id) } };
  } catch (error) { return failure(error); }
}

export async function deleteAirtimeRoute(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({ id: uuid });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("providers.manage");
    const client = createAdminClient();

    const { error } = await client
      .from("airtime_provider_routes")
      .delete()
      .eq("id", values.id);

    if (error) throw new Error(error.message);

    await recordAdminAudit(session, {
      action: "airtime_route.deleted",
      entityType: "airtime_route",
      entityId: values.id,
    });

    refresh("/admin/products/airtime");
    return { ok: true, message: "Airtime route rule removed." };
  } catch (error) { return failure(error); }
}

export async function saveElectricityDiscoConfig(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({
    discoCode: z.string().trim().toLowerCase(),
    primaryProvider: z.string().trim().min(2),
    fallbackProvider: z.string().trim().nullable().optional(),
    supportsPrepaid: z.boolean(),
    supportsPostpaid: z.boolean(),
    convenienceFee: z.coerce.number().min(0),
    cashbackPercentage: z.coerce.number().min(0).max(100),
    minPurchaseAmount: z.coerce.number().min(100),
    maxPurchaseAmount: z.coerce.number().min(1000),
    isActive: z.boolean(),
    maintenanceNotice: z.string().trim().nullable().optional(),
  });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("providers.manage");
    const client = createAdminClient();

    const update = {
      primary_provider: values.primaryProvider,
      fallback_provider: values.fallbackProvider || null,
      supports_prepaid: values.supportsPrepaid,
      supports_postpaid: values.supportsPostpaid,
      convenience_fee: values.convenienceFee,
      cashback_percentage: values.cashbackPercentage,
      min_purchase_amount: values.minPurchaseAmount,
      max_purchase_amount: values.maxPurchaseAmount,
      is_active: values.isActive,
      maintenance_notice: values.maintenanceNotice || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await client
      .from("electricity_disco_configs")
      .update(update)
      .eq("disco_code", values.discoCode);

    if (error) throw new Error(error.message);

    await recordAdminAudit(session, {
      action: "electricity_disco.updated",
      entityType: "electricity_disco",
      entityId: values.discoCode,
      newValue: update,
    });

    refresh("/admin/products/electricity");
    return { ok: true, message: `Configuration updated for ${values.discoCode.toUpperCase()}.` };
  } catch (error) { return failure(error); }
}

export async function bulkUpdateElectricityDiscos(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({
    primaryProvider: z.string().trim().min(2).optional(),
    fallbackProvider: z.string().trim().nullable().optional(),
    convenienceFee: z.coerce.number().min(0).optional(),
    cashbackPercentage: z.coerce.number().min(0).max(100).optional(),
    isActive: z.boolean().optional(),
  });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("providers.manage");
    const client = createAdminClient();

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (values.primaryProvider !== undefined) update.primary_provider = values.primaryProvider;
    if (values.fallbackProvider !== undefined) update.fallback_provider = values.fallbackProvider || null;
    if (values.convenienceFee !== undefined) update.convenience_fee = values.convenienceFee;
    if (values.cashbackPercentage !== undefined) update.cashback_percentage = values.cashbackPercentage;
    if (values.isActive !== undefined) update.is_active = values.isActive;

    const { error } = await client
      .from("electricity_disco_configs")
      .update(update)
      .neq("disco_code", "");

    if (error) throw new Error(error.message);

    await recordAdminAudit(session, {
      action: "electricity_discos.bulk_updated",
      entityType: "electricity_disco",
      entityId: "all",
      newValue: update,
    });

    refresh("/admin/products/electricity");
    return { ok: true, message: "Applied configuration changes to all Electricity Discos." };
  } catch (error) { return failure(error); }
}

export async function saveDiscountCoupon(input: unknown): Promise<AdminActionResult<{ id: string }>> {
  const schema = z.object({
    id: uuid.optional(),
    code: z.string().trim().toUpperCase().min(3).max(30),
    discountType: z.enum(["percentage", "fixed"]),
    discountValue: z.coerce.number().positive(),
    minPurchaseAmount: z.coerce.number().min(0).default(0),
    maxDiscountAmount: z.coerce.number().positive().nullable().optional(),
    serviceType: z.enum(["all", "airtime", "data", "electricity", "cable_tv"]).default("all"),
    maxUses: z.coerce.number().int().min(0).default(0),
    startsAt: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
    isActive: z.boolean().default(true),
  });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("campaigns.manage");
    const client = createAdminClient();

    const record = {
      ...(values.id ? { id: values.id } : {}),
      code: values.code,
      discount_type: values.discountType,
      discount_value: values.discountValue,
      min_purchase_amount: values.minPurchaseAmount,
      max_discount_amount: values.maxDiscountAmount || null,
      service_type: values.serviceType,
      max_uses: values.maxUses,
      starts_at: values.startsAt || null,
      expires_at: values.expiresAt || null,
      is_active: values.isActive,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from("discount_coupons")
      .upsert(record, { onConflict: "code" })
      .select("id")
      .single();

    if (error || !data) throw new Error(error?.message || "Could not save coupon.");

    await recordAdminAudit(session, {
      action: values.id ? "discount_coupon.updated" : "discount_coupon.created",
      entityType: "discount_coupon",
      entityId: String(data.id),
      newValue: record,
    });

    refresh("/admin/growth/coupons");
    return { ok: true, message: `Coupon code ${values.code} saved successfully.`, data: { id: String(data.id) } };
  } catch (error) { return failure(error); }
}

export async function deleteDiscountCoupon(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({ id: uuid });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("campaigns.manage");
    const client = createAdminClient();

    const { error } = await client
      .from("discount_coupons")
      .delete()
      .eq("id", values.id);

    if (error) throw new Error(error.message);

    await recordAdminAudit(session, {
      action: "discount_coupon.deleted",
      entityType: "discount_coupon",
      entityId: values.id,
    });

    refresh("/admin/growth/coupons");
    return { ok: true, message: "Coupon deleted." };
  } catch (error) { return failure(error); }
}

export async function adminRefundTransaction(input: unknown): Promise<AdminActionResult<{ balance: number }>> {
  const schema = z.object({
    transactionId: uuid,
    reason: z.string().trim().min(4).max(500),
  });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("transactions.refund");
    const adminUserId = await materializeAdminSession(session);
    const client = createAdminClient();

    const { data: tx, error: txError } = await client
      .from("service_transactions")
      .select("id, user_id, amount, status, service_type, internal_reference,metadata")
      .eq("id", values.transactionId)
      .single();

    if (txError || !tx) throw new Error("Transaction not found.");
    if (tx.metadata?.mode === "epin") throw new Error("Use recharge-card recovery to verify non-delivery before refunding.");

    if (tx.status === "failed") {
      throw new Error("This transaction has already been refunded.");
    }

    const settlement = await client.rpc("customer_settle_service_purchase", {
      p_user_id: tx.user_id,
      p_transaction_id: tx.id,
      p_status: "failed",
      p_summary: `Admin Chargeback / Refund: ${values.reason}`,
      p_provider_reference: null,
      p_metadata: { refundedBy: adminUserId, reason: values.reason },
    });

    if (settlement.error) {
      throw new Error(settlement.error.message || "Could not process refund.");
    }

    const settled = settlement.data?.[0] as { balance?: number; refunded?: boolean } | undefined;
    if (!settled?.refunded) throw new Error("No refund was issued. Use the approved refund workflow for a completed purchase.");

    await recordAdminAudit(session, {
      action: "transaction.admin_refunded",
      entityType: "service_transaction",
      entityId: tx.id,
      newValue: { amount: tx.amount, reason: values.reason, adminUserId },
    });

    refresh("/admin/transactions", "/admin/money/refunds", "/admin/products/airtime", "/admin/products/electricity", "/admin/products/tv");
    return { ok: true, message: `₦${Number(tx.amount).toLocaleString("en-NG")} refunded to customer wallet.`, data: { balance: Number(settled?.balance ?? 0) } };
  } catch (error) { return failure(error); }
}

export async function saveCableTvConfig(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({
    operatorCode: z.enum(["dstv", "gotv", "startimes", "showmax"]),
    operatorName: z.string().trim().min(2),
    primaryProvider: z.string().trim().min(2),
    fallbackProvider: z.string().trim().min(2).nullable().optional(),
    convenienceFee: z.coerce.number().min(0).default(0),
    cashbackPercentage: z.coerce.number().min(0).max(100).default(0),
    isActive: z.boolean().default(true),
    maintenanceNotice: z.string().trim().max(500).nullable().optional(),
  });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("products.edit");
    const client = createAdminClient();

    const record = {
      operator_code: values.operatorCode,
      operator_name: values.operatorName,
      primary_provider: values.primaryProvider,
      fallback_provider: values.fallbackProvider || null,
      convenience_fee: values.convenienceFee,
      cashback_percentage: values.cashbackPercentage,
      is_active: values.isActive,
      maintenance_notice: values.maintenanceNotice || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await client
      .from("cable_tv_configs")
      .upsert(record, { onConflict: "operator_code" });

    if (error) throw new Error(error.message);

    await recordAdminAudit(session, {
      action: "cable_tv_config.saved",
      entityType: "cable_tv_config",
      entityId: values.operatorCode,
      newValue: record,
    });

    refresh("/admin/products/tv");
    return { ok: true, message: `${values.operatorName} configuration saved.` };
  } catch (error) { return failure(error); }
}

export async function bulkUpdateCableTvConfigs(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({
    primaryProvider: z.string().trim().min(2).optional(),
    fallbackProvider: z.string().trim().min(2).nullable().optional(),
    convenienceFee: z.coerce.number().min(0).optional(),
    cashbackPercentage: z.coerce.number().min(0).max(100).optional(),
    isActive: z.boolean().optional(),
  });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("products.edit");
    const client = createAdminClient();

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (values.primaryProvider !== undefined) update.primary_provider = values.primaryProvider;
    if (values.fallbackProvider !== undefined) update.fallback_provider = values.fallbackProvider || null;
    if (values.convenienceFee !== undefined) update.convenience_fee = values.convenienceFee;
    if (values.cashbackPercentage !== undefined) update.cashback_percentage = values.cashbackPercentage;
    if (values.isActive !== undefined) update.is_active = values.isActive;

    const { error } = await client
      .from("cable_tv_configs")
      .update(update)
      .neq("operator_code", "");

    if (error) throw new Error(error.message);

    await recordAdminAudit(session, {
      action: "cable_tv_configs.bulk_updated",
      entityType: "cable_tv_config",
      entityId: "all",
      newValue: update,
    });

    refresh("/admin/products/tv");
    return { ok: true, message: "Applied configuration changes to all TV Operators." };
  } catch (error) { return failure(error); }
}

export async function saveCableTvPackage(input: unknown): Promise<AdminActionResult<{ id: string }>> {
  const schema = z.object({
    id: uuid.optional(),
    operatorCode: z.enum(["dstv", "gotv", "startimes", "showmax"]),
    packageCode: z.string().trim().min(1).max(50),
    name: z.string().trim().min(2).max(100),
    price: z.coerce.number().positive(),
    durationMonths: z.coerce.number().int().min(0).default(1),
    sortOrder: z.coerce.number().int().default(0),
    isActive: z.boolean().default(true),
  });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("products.edit");
    const client = createAdminClient();

    const record = {
      ...(values.id ? { id: values.id } : {}),
      operator_code: values.operatorCode,
      package_code: values.packageCode,
      name: values.name,
      price: values.price,
      duration_months: values.durationMonths,
      sort_order: values.sortOrder,
      is_active: values.isActive,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from("cable_tv_packages")
      .upsert(record, { onConflict: "operator_code,package_code" })
      .select("id")
      .single();

    if (error || !data) throw new Error(error?.message || "Could not save package.");

    await recordAdminAudit(session, {
      action: values.id ? "cable_tv_package.updated" : "cable_tv_package.created",
      entityType: "cable_tv_package",
      entityId: String(data.id),
      newValue: record,
    });

    refresh("/admin/products/tv");
    return { ok: true, message: `Package ${values.name} saved successfully.`, data: { id: String(data.id) } };
  } catch (error) { return failure(error); }
}

export async function deleteCableTvPackage(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({ id: uuid });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("products.edit");
    const client = createAdminClient();

    const { error } = await client
      .from("cable_tv_packages")
      .delete()
      .eq("id", values.id);

    if (error) throw new Error(error.message);

    await recordAdminAudit(session, {
      action: "cable_tv_package.deleted",
      entityType: "cable_tv_package",
      entityId: values.id,
    });

    refresh("/admin/products/tv");
    return { ok: true, message: "Package removed from catalogue." };
  } catch (error) { return failure(error); }
}

export async function saveEducationConfig(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({
    examBody: z.enum(["waec", "neco", "jamb", "nabteb", "nbais"]),
    primaryProvider: z.string().trim().min(2),
    fallbackProvider: z.string().trim().nullable().optional(),
    convenienceFee: z.coerce.number().min(0),
    cashbackPercentage: z.coerce.number().min(0).max(100),
    isActive: z.boolean(),
    requiresProfileCode: z.boolean().default(false),
    instructions: z.string().trim().nullable().optional(),
    portalUrl: z.string().trim().nullable().optional(),
    maintenanceNotice: z.string().trim().nullable().optional(),
  });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("providers.manage");
    const client = createAdminClient();

    const update = {
      primary_provider: values.primaryProvider,
      fallback_provider: values.fallbackProvider || null,
      convenience_fee: values.convenienceFee,
      cashback_percentage: values.cashbackPercentage,
      is_active: values.isActive,
      requires_profile_code: values.requiresProfileCode,
      instructions: values.instructions || null,
      portal_url: values.portalUrl || null,
      maintenance_notice: values.maintenanceNotice || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await client
      .from("education_configs")
      .update(update)
      .eq("exam_body", values.examBody);

    if (error) throw new Error(error.message);

    await recordAdminAudit(session, {
      action: "education_config.updated",
      entityType: "education_config",
      entityId: values.examBody,
      newValue: update,
    });

    refresh("/admin/products/education");
    return { ok: true, message: `${values.examBody.toUpperCase()} routing configuration updated.` };
  } catch (error) { return failure(error); }
}

export async function bulkUpdateEducationConfigs(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({
    primaryProvider: z.string().trim().min(2),
    fallbackProvider: z.string().trim().nullable().optional(),
    cashbackPercentage: z.coerce.number().min(0).max(100).optional(),
    convenienceFee: z.coerce.number().min(0).optional(),
    isActive: z.boolean().optional(),
  });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("providers.manage");
    const client = createAdminClient();

    const update: Record<string, unknown> = {
      primary_provider: values.primaryProvider,
      fallback_provider: values.fallbackProvider || null,
      updated_at: new Date().toISOString(),
    };

    if (typeof values.cashbackPercentage === "number") update.cashback_percentage = values.cashbackPercentage;
    if (typeof values.convenienceFee === "number") update.convenience_fee = values.convenienceFee;
    if (typeof values.isActive === "boolean") update.is_active = values.isActive;

    const { error } = await client
      .from("education_configs")
      .update(update)
      .neq("exam_body", "");

    if (error) throw new Error(error.message);

    await recordAdminAudit(session, {
      action: "education_configs.bulk_updated",
      entityType: "education_configs",
      entityId: "all",
      newValue: update,
    });

    refresh("/admin/products/education");
    return { ok: true, message: "All exam bodies updated with new API routing." };
  } catch (error) { return failure(error); }
}

export async function saveEducationPackage(input: unknown): Promise<AdminActionResult<{ id: string }>> {
  const schema = z.object({
    id: uuid.optional(),
    examBody: z.enum(["waec", "neco", "jamb", "nabteb", "nbais"]),
    packageCode: z.string().trim().min(1).max(50),
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().nullable().optional(),
    serviceType: z.enum(["result_checker", "registration", "utme", "de", "screening"]).default("result_checker"),
    price: z.coerce.number().positive(),
    costPrice: z.coerce.number().min(0).default(0),
    sortOrder: z.coerce.number().int().default(0),
    isActive: z.boolean().default(true),
  });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("products.edit");
    const client = createAdminClient();

    const record = {
      ...(values.id ? { id: values.id } : {}),
      exam_body: values.examBody,
      package_code: values.packageCode,
      name: values.name,
      description: values.description || null,
      service_type: values.serviceType,
      price: values.price,
      cost_price: values.costPrice,
      sort_order: values.sortOrder,
      is_active: values.isActive,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from("education_packages")
      .upsert(record, { onConflict: "exam_body,package_code" })
      .select("id")
      .single();

    if (error || !data) throw new Error(error?.message || "Could not save package.");

    await recordAdminAudit(session, {
      action: values.id ? "education_package.updated" : "education_package.created",
      entityType: "education_package",
      entityId: String(data.id),
      newValue: record,
    });

    refresh("/admin/products/education");
    return { ok: true, message: `Package ${values.name} saved successfully.`, data: { id: String(data.id) } };
  } catch (error) { return failure(error); }
}

export async function deleteEducationPackage(input: unknown): Promise<AdminActionResult> {
  const schema = z.object({ id: uuid });
  try {
    const values = schema.parse(input);
    const session = await requireAdminPermission("products.edit");
    const client = createAdminClient();

    const { error } = await client
      .from("education_packages")
      .delete()
      .eq("id", values.id);

    if (error) throw new Error(error.message);

    await recordAdminAudit(session, {
      action: "education_package.deleted",
      entityType: "education_package",
      entityId: values.id,
    });

    refresh("/admin/products/education");
    return { ok: true, message: "Package removed from catalogue." };
  } catch (error) { return failure(error); }
}
