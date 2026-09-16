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
import { dispatchPurchaseReceipt } from "./receipts";

const inputSchema = z.object({ productId: z.string().uuid(), destination: z.string().trim().min(8).max(100), idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,160}$/) });
const vendorIds = new Set<VendorId>(["vtpass", "smeplug", "gladtidings", "pairgate", "private_sim", "absvendor", "maskawasub"]);

function reference() { return `FND-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().replaceAll("-", "").slice(0, 14).toUpperCase()}`; }

const DEFAULT_FALLBACK_PRODUCTS = [
  { id: "00000000-0000-0000-0000-000000000001", name: "MTN 1GB 1 day", service_type: "data", network: "mtn", selling_price: 220, cashback_amount: 5, provider_product_code: "mtn-1gb", featured: true, validity: "1 day", metadata: { category: "daily" } },
  { id: "00000000-0000-0000-0000-000000000002", name: "MTN 1.2GB 7 days", service_type: "data", network: "mtn", selling_price: 736, cashback_amount: 10, provider_product_code: "mtn-1.2gb", featured: true, validity: "7 days", metadata: { category: "weekly" } },
  { id: "00000000-0000-0000-0000-000000000003", name: "MTN 2.5GB 1 day", service_type: "data", network: "mtn", selling_price: 779.5, cashback_amount: 15, provider_product_code: "mtn-2.5gb", featured: true, validity: "1 day", metadata: { category: "daily" } },
  { id: "00000000-0000-0000-0000-000000000004", name: "MTN 5GB 30 days", service_type: "data", network: "mtn", selling_price: 1370, cashback_amount: 25, provider_product_code: "mtn-5gb", featured: true, validity: "30 days", metadata: { category: "monthly" } },
  { id: "00000000-0000-0000-0000-000000000005", name: "MTN 40MB 1 day", service_type: "data", network: "mtn", selling_price: 57, cashback_amount: 1, provider_product_code: "mtn-40mb", featured: false, validity: "1 day", metadata: { category: "daily" } },
  { id: "00000000-0000-0000-0000-000000000006", name: "Airtel 1GB 1 day", service_type: "data", network: "airtel", selling_price: 240, cashback_amount: 5, provider_product_code: "airtel-1gb", featured: true, validity: "1 day", metadata: { category: "daily" } },
  { id: "00000000-0000-0000-0000-000000000007", name: "Airtel 2GB 2 days", service_type: "data", network: "airtel", selling_price: 590, cashback_amount: 10, provider_product_code: "airtel-2gb", featured: true, validity: "2 days", metadata: { category: "daily" } },
  { id: "00000000-0000-0000-0000-000000000008", name: "Airtel 5GB 30 days", service_type: "data", network: "airtel", selling_price: 1450, cashback_amount: 25, provider_product_code: "airtel-5gb", featured: true, validity: "30 days", metadata: { category: "monthly" } },
  { id: "00000000-0000-0000-0000-000000000009", name: "Glo 1.25GB 1 day", service_type: "data", network: "glo", selling_price: 210, cashback_amount: 5, provider_product_code: "glo-1.25gb", featured: true, validity: "1 day", metadata: { category: "daily" } },
  { id: "00000000-0000-0000-0000-000000000010", name: "Glo 5.8GB 30 days", service_type: "data", network: "glo", selling_price: 1320, cashback_amount: 25, provider_product_code: "glo-5.8gb", featured: true, validity: "30 days", metadata: { category: "monthly" } },
  { id: "00000000-0000-0000-0000-000000000011", name: "9mobile 1.5GB 30 days", service_type: "data", network: "9mobile", selling_price: 980, cashback_amount: 15, provider_product_code: "9mobile-1.5gb", featured: true, validity: "30 days", metadata: { category: "monthly" } },
];

export async function listPurchaseProducts(userId: string, serviceType?: string, network?: string) {
  try {
    const client = createAdminClient();
    let query = client
      .from("service_products")
      .select("id,name,description,service_type,network,selling_price,cashback_amount,provider_product_code,featured,validity,metadata,placement:product_placements(surface,badge,is_active),provider:provider_registry(name,slug,status)")
      .eq("status", "active")
      .order("selling_price", { ascending: true })
      .limit(300);
    if (serviceType) query = query.eq("service_type", serviceType);
    if (network) query = query.eq("network", network);
    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      let fallback = DEFAULT_FALLBACK_PRODUCTS;
      if (serviceType) fallback = fallback.filter((p) => p.service_type === serviceType);
      if (network) fallback = fallback.filter((p) => p.network === network);
      return fallback.map((product) => ({
        ...product,
        price: Number(product.selling_price),
        cashback: Number(product.cashback_amount),
        category: (product.metadata as { category?: string } | null)?.category || "daily",
        dataAmountMb: 0,
        userId,
      }));
    }
    return (data ?? []).map((product) => ({
      ...product,
      price: Number(product.selling_price),
      cashback: Number(product.cashback_amount),
      category: (product.metadata as { category?: string } | null)?.category || "daily",
      dataAmountMb: Number((product.metadata as { data_amount_mb?: number } | null)?.data_amount_mb) || 0,
      userId,
    }));
  } catch {
    let fallback = DEFAULT_FALLBACK_PRODUCTS;
    if (serviceType) fallback = fallback.filter((p) => p.service_type === serviceType);
    if (network) fallback = fallback.filter((p) => p.network === network);
    return fallback.map((product) => ({
      ...product,
      price: Number(product.selling_price),
      cashback: Number(product.cashback_amount),
      category: (product.metadata as { category?: string } | null)?.category || "daily",
      dataAmountMb: 0,
      userId,
    }));
  }
}

export async function listBundleCategories(network?: string) {
  const client = createAdminClient();
  let query = client
    .from("data_bundle_categories")
    .select("id,slug,name,network_slug,display_order,is_active")
    .eq("is_active", true)
    .order("display_order", { ascending: true });
  if (network) query = query.eq("network_slug", network);
  const { data } = await query;
  return data ?? [];
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
  let providerSlug = route?.slug ?? (Array.isArray(product.provider) ? product.provider[0]?.slug : (product.provider as { slug?: string } | null)?.slug);
  let providerId = route?.providerId ?? product.provider_id;

  if (providerId && !providerSlug) {
    const { data: pReg } = await client.from("provider_registry").select("id,slug,name").eq("id", providerId).maybeSingle();
    if (pReg?.slug) {
      providerSlug = pReg.slug;
    }
  }

  if (!providerId || !providerSlug || !vendorIds.has(providerSlug as VendorId)) {
    throw new Error("No live provider is available for this service yet. Please link a provider in Admin > Data Bundles.");
  }
  const vendor = getVendor(providerSlug as VendorId);
  if (!vendor.isConfigured()) {
    throw new Error(`${providerSlug.toUpperCase()} credentials are not configured on the server.`);
  }

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
    
    const settled = settlement.data?.[0] as { balance?: number; refunded?: boolean } | undefined;

    // Asynchronous dispatch of in-app notification, email receipt, and optional SMS
    void dispatchPurchaseReceipt({
      userId,
      transactionId: created.transaction_id,
      reference: created.internal_reference,
      providerReference: result.providerReference ?? null,
      productName: product.name,
      amount: price.price,
      cashback: price.cashback,
      destination,
      network: product.network,
      serviceType: product.service_type,
      status: status as "successful" | "failed" | "pending",
      message: result.message,
      balance: Number(settled?.balance ?? created.balance),
    });

    return {
      transactionId: created.transaction_id,
      reference: created.internal_reference,
      status,
      balance: Number(settled?.balance ?? created.balance),
      refunded: Boolean(settled?.refunded),
      message: result.message,
      providerReference: result.providerReference ?? null,
      productName: product.name,
      amount: price.price,
      cashback: price.cashback,
      destination,
      network: product.network,
      serviceType: product.service_type,
      createdAt: new Date().toISOString(),
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Provider purchase failed.";
    const definitive = cause instanceof ProviderRequestError && cause.definitive;
    const status = definitive ? "failed" : "pending";
    await client.from("provider_attempts").insert({ transaction_id: created.transaction_id, provider_id: providerId, attempt_number: 1, outcome: definitive ? "failed" : "timeout", latency_ms: Date.now() - started, response_redacted: { error: message } });
    const settlement = await client.rpc("customer_settle_service_purchase", { p_user_id: userId, p_transaction_id: created.transaction_id, p_status: status, p_summary: message, p_provider_reference: null, p_metadata: { provider: providerSlug, error: true } });
    await recordProviderApiCall({ requestId: randomUUID(), provider: providerSlug, transactionReference: created.internal_reference, method: "POST", endpoint: `${providerSlug}/purchase`, response: { error: message }, latencyMs: Date.now() - started, outcome: "failed" });
    if (!definitive) await enqueueAdminJob("provider.requery", { transactionId: created.transaction_id }, `provider.requery:${created.transaction_id}`);
    
    void dispatchPurchaseReceipt({
      userId,
      transactionId: created.transaction_id,
      reference: created.internal_reference,
      providerReference: null,
      productName: product.name,
      amount: price.price,
      cashback: 0,
      destination,
      network: product.network,
      serviceType: product.service_type,
      status: status as "successful" | "failed" | "pending",
      message,
    });

    const settled = settlement.data?.[0] as { balance?: number; refunded?: boolean } | undefined;
    return {
      transactionId: created.transaction_id,
      reference: created.internal_reference,
      status,
      balance: Number(settled?.balance ?? created.balance),
      refunded: Boolean(settled?.refunded),
      message,
      productName: product.name,
      amount: price.price,
      cashback: 0,
      destination,
      network: product.network,
      serviceType: product.service_type,
      createdAt: new Date().toISOString(),
    };
  }
}
