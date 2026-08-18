import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { evaluateCustomerPurchasePolicy, calculateProductPrice, selectProviderRoute } from "../admin/engine";
import { enqueueAdminJob } from "../admin/jobs";
import { recordProviderApiCall } from "../admin/telemetry";
import { getVendor } from "../test-engine/vendors";
import type { NetworkId, VendorId } from "../test-engine/types";
import { isNigerianPhone, normalizePhone, ProviderRequestError } from "../test-engine/utils";
import { createAdminClient } from "../supabase/admin";

const inputSchema = z.object({ productId: z.string().uuid(), destination: z.string().trim().min(8).max(100), idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,160}$/) });
const vendorIds = new Set<VendorId>(["vtpass", "smeplug", "gladtidings", "pairgate"]);

function reference() { return `FND-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().replaceAll("-", "").slice(0, 14).toUpperCase()}`; }

export async function listPurchaseProducts(userId: string, serviceType?: string, network?: string) {
  const client = createAdminClient();
  let query = client.from("service_products").select("id,name,description,service_type,network,selling_price,cashback_amount,provider_product_code,featured,provider:provider_registry(name,slug,status)").eq("status", "active").order("selling_price", { ascending: true }).limit(200);
  if (serviceType) query = query.eq("service_type", serviceType);
  if (network) query = query.eq("network", network);
  const { data, error } = await query;
  if (error) throw new Error("Products are unavailable right now.");
  return (data ?? []).map((product) => ({ ...product, price: Number(product.selling_price), cashback: Number(product.cashback_amount), userId }));
}

export async function purchaseService(userId: string, rawInput: unknown) {
  const input = inputSchema.parse(rawInput);
  const client = createAdminClient();
  const { data: product, error } = await client.from("service_products").select("id,name,service_type,network,provider_id,provider_product_code,status,provider_cost,selling_price,cashback_amount,provider:provider_registry(name,slug,status)").eq("id", input.productId).single();
  if (error || !product || product.status !== "active") throw new Error("That service is unavailable. Pick another option.");
  if (!["data", "airtime"].includes(product.service_type)) throw new Error("This service is not ready for live purchases yet.");
  const destination = normalizePhone(input.destination);
  if (!isNigerianPhone(destination)) throw new Error("Enter a valid Nigerian phone number.");
  const price = await calculateProductPrice(product.id);
  if (!price) throw new Error("That product is no longer available.");
  const policy = await evaluateCustomerPurchasePolicy(userId, product.service_type, price.price);
  if (!policy.allowed) throw new Error(policy.reason);
  const route = await selectProviderRoute(product.service_type, product.network, product.id);
  const fallbackProvider = product.provider as { slug?: string } | null;
  const providerId = route?.providerId ?? product.provider_id;
  const providerSlug = route?.slug ?? fallbackProvider?.slug;
  if (!providerId || !providerSlug || !vendorIds.has(providerSlug as VendorId)) throw new Error("No live provider is available for this service yet.");
  const vendor = getVendor(providerSlug as VendorId);
  if (!vendor.isConfigured()) throw new Error("This service is temporarily unavailable. Please try again shortly.");

  const start = await client.rpc("customer_start_service_purchase", { p_user_id: userId, p_idempotency_key: input.idempotencyKey, p_reference: reference(), p_service_type: product.service_type, p_product_id: product.id, p_provider_id: providerId, p_destination: destination, p_amount: price.price, p_provider_cost: price.providerCost, p_cashback_amount: price.cashback, p_metadata: { productName: product.name, route: route?.ruleId ?? null } });
  if (start.error || !start.data?.[0]) throw new Error(start.error?.message || "Your wallet could not be charged.");
  const created = start.data[0] as { transaction_id: string; internal_reference: string; status: string; balance: number; reused: boolean };
  if (created.reused) return { transactionId: created.transaction_id, reference: created.internal_reference, status: created.status, balance: Number(created.balance), reused: true };

  const started = Date.now();
  try {
    const result = await vendor.purchase({ type: product.service_type as "data" | "airtime", network: product.network as NetworkId, phone: destination, amount: price.price, planId: product.service_type === "data" ? product.provider_product_code : undefined, reference: created.internal_reference });
    const status = result.status === "successful" ? "successful" : result.status === "failed" ? "failed" : "pending";
    await client.from("provider_attempts").insert({ transaction_id: created.transaction_id, provider_id: providerId, attempt_number: 1, outcome: status === "successful" ? "successful" : status === "failed" ? "failed" : "processing", provider_reference: result.providerReference ?? null, latency_ms: Date.now() - started, response_redacted: { message: result.message } });
    const settlement = await client.rpc("customer_settle_service_purchase", { p_user_id: userId, p_transaction_id: created.transaction_id, p_status: status, p_summary: result.message, p_provider_reference: result.providerReference ?? null, p_metadata: { provider: providerSlug } });
    if (settlement.error) throw new Error("Provider response received, but the purchase record could not be settled.");
    await recordProviderApiCall({ requestId: randomUUID(), provider: providerSlug, transactionReference: created.internal_reference, method: "POST", endpoint: `${providerSlug}/purchase`, response: result.raw, latencyMs: Date.now() - started, outcome: "successful" });
    if (status === "pending") await enqueueAdminJob("provider.requery", { transactionId: created.transaction_id }, `provider.requery:${created.transaction_id}`);
    await createReceiptNotification(userId, created.transaction_id, product.name, status, price.price, result.message);
    const settled = settlement.data?.[0] as { balance?: number; refunded?: boolean } | undefined;
    return { transactionId: created.transaction_id, reference: created.internal_reference, status, balance: Number(settled?.balance ?? created.balance), refunded: Boolean(settled?.refunded), message: result.message, providerReference: result.providerReference ?? null };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Provider purchase failed.";
    const definitive = cause instanceof ProviderRequestError && cause.definitive;
    const status = definitive ? "failed" : "pending";
    await client.from("provider_attempts").insert({ transaction_id: created.transaction_id, provider_id: providerId, attempt_number: 1, outcome: definitive ? "failed" : "timeout", latency_ms: Date.now() - started, response_redacted: { error: message } });
    const settlement = await client.rpc("customer_settle_service_purchase", { p_user_id: userId, p_transaction_id: created.transaction_id, p_status: status, p_summary: message, p_provider_reference: null, p_metadata: { provider: providerSlug, error: true } });
    await recordProviderApiCall({ requestId: randomUUID(), provider: providerSlug, transactionReference: created.internal_reference, method: "POST", endpoint: `${providerSlug}/purchase`, response: { error: message }, latencyMs: Date.now() - started, outcome: "failed" });
    if (!definitive) await enqueueAdminJob("provider.requery", { transactionId: created.transaction_id }, `provider.requery:${created.transaction_id}`);
    await createReceiptNotification(userId, created.transaction_id, product.name, status, price.price, definitive ? "We could not complete that purchase, so your wallet was refunded." : "We are confirming this purchase with the provider. Please do not try again yet.");
    const settled = settlement.data?.[0] as { balance?: number; refunded?: boolean } | undefined;
    return { transactionId: created.transaction_id, reference: created.internal_reference, status, balance: Number(settled?.balance ?? created.balance), refunded: Boolean(settled?.refunded), message: definitive ? "We could not complete that purchase, so your wallet was refunded." : "Your purchase is being confirmed." };
  }
}

async function createReceiptNotification(userId: string, transactionId: string, productName: string, status: string, amount: number, detail: string) {
  const client = createAdminClient();
  const title = status === "successful" ? "Purchase complete" : status === "failed" ? "Purchase refunded" : "Purchase is processing";
  await client.from("user_notifications").insert({ user_id: userId, title, body: `${productName} · ₦${amount.toLocaleString("en-NG")} — ${detail}`.slice(0, 4000), kind: "transaction" });
  await client.from("transaction_events").insert({ transaction_id: transactionId, event_type: "customer_notified", summary: title, actor_type: "system", metadata: { channel: "in_app" } });
}
