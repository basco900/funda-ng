import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { evaluateCustomerPurchasePolicy, calculateProductPrice, selectProviderRoute, type PurchasePolicyDecision } from "../admin/engine";
import { enqueueAdminJob } from "../admin/jobs";
import { recordProviderApiCall } from "../admin/telemetry";
import { getVendor } from "../test-engine/vendors";
import type { AirtimeMode, NetworkId, PurchaseResult, RechargePinItem, VendorId } from "../test-engine/types";
import { isNigerianPhone, normalizePhone, ProviderRequestError } from "../test-engine/utils";
import { createAdminClient } from "../supabase/admin";
import { encryptPins, pinVaultConfigured } from "../security/pin-vault";
import { dispatchPurchaseReceipt } from "./receipts";
import {
  resolveAirtimeRoute,
  resolveElectricityConfig,
  resolveCableTvConfig,
  getCableTvPackage,
  resolveEducationConfig,
  getEducationPackage,
  validateCoupon,
  recordCouponRedemption,
} from "./routing";
import { recordServiceBeneficiary } from "./beneficiaries";
import { purchaseRechargeCards } from "./recharge-cards";
import { classifyVendorError, deriveCustomerHealth, refreshProductHealth } from "./plan-health";

const catalogInputSchema = z.object({
  productId: z.string().uuid(),
  destination: z.string().trim().min(8).max(100),
  couponCode: z.string().trim().max(30).optional(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,160}$/),
});

const airtimeInputSchema = z.object({
  serviceType: z.literal("airtime"),
  mode: z.enum(["vtu", "epin"]).default("vtu"),
  network: z.enum(["mtn", "airtel", "glo", "9mobile"]),
  amount: z.number().min(50).max(50000),
  quantity: z.number().int().min(1).max(20).optional(),
  cardName: z.string().trim().max(24).optional(),
  destination: z.string().trim().min(8).max(100),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,160}$/),
});

const electricityInputSchema = z.object({
  serviceType: z.literal("electricity"),
  disco: z.string().trim().toLowerCase(),
  meterNumber: z.string().trim().min(6).max(30),
  meterType: z.enum(["prepaid", "postpaid"]),
  amount: z.number().min(500).max(100000),
  customerName: z.string().trim().max(100).optional(),
  customerAddress: z.string().trim().max(255).optional(),
  phone: z.string().trim().max(20).optional(),
  couponCode: z.string().trim().max(30).optional(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,160}$/),
});

const cableTvInputSchema = z.object({
  serviceType: z.enum(["tv", "cable_tv", "cable"]).default("tv"),
  operator: z.enum(["dstv", "gotv", "startimes", "showmax"]),
  smartcardNumber: z.string().trim().min(5).max(30),
  packageCode: z.string().trim().min(1).max(50),
  subscriptionType: z.enum(["renew", "change"]).default("change"),
  customerName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(20).optional(),
  couponCode: z.string().trim().max(30).optional(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,160}$/),
});

const educationInputSchema = z.object({
  serviceType: z.literal("education"),
  examBody: z.enum(["waec", "neco", "jamb", "nabteb", "nbais"]),
  packageCode: z.string().trim().min(1).max(50),
  quantity: z.number().int().min(1).max(20).default(1),
  phone: z.string().trim().min(8).max(20),
  email: z.string().trim().email().optional().or(z.literal("")),
  profileCode: z.string().trim().max(20).optional().or(z.literal("")),
  candidateName: z.string().trim().max(120).optional(),
  couponCode: z.string().trim().max(30).optional(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,160}$/),
});

const vendorIds = new Set<VendorId>([
  "vtpass",
  "smeplug",
  "pairgate",
  "absvendor",
  "maskawasub",
]);

function isVendorActive(reg: { status: string } | undefined, slug: string): boolean {
  if (!reg) return false;
  if (reg.status === "disabled" || reg.status === "down" || reg.status === "maintenance") return false;
  if (!vendorIds.has(slug as VendorId)) return false;
  return getVendor(slug as VendorId).isConfigured();
}

// Limits are re-checked inside customer_start_service_purchase under the wallet row lock,
// so concurrent requests cannot slip past the daily totals the policy pre-check saw.
function limitParams(policy: PurchasePolicyDecision) {
  return {
    p_per_transaction_limit: policy.limits.perTransaction,
    p_daily_value_limit: policy.limits.dailyValue,
    p_daily_count_limit: policy.limits.dailyCount,
  };
}

function reference() {
  return `FND-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().replaceAll("-", "").slice(0, 14).toUpperCase()}`;
}

// Provider discount percentages (verified against live APIs and provider schedules)
const VTU_COST_MULTIPLIER: Record<VendorId, Record<NetworkId, number>> = {
  maskawasub: { mtn: 0.98, airtel: 0.97, glo: 0.97, "9mobile": 0.98 },
  smeplug: { mtn: 0.98, airtel: 0.98, glo: 0.97, "9mobile": 0.975 },
  vtpass: { mtn: 0.97, airtel: 0.97, glo: 0.96, "9mobile": 0.965 },
  pairgate: { mtn: 0.98, airtel: 0.98, glo: 0.97, "9mobile": 0.98 },
  absvendor: { mtn: 0.98, airtel: 0.98, glo: 0.97, "9mobile": 0.98 },
};

function estimateProviderCost(vendorId: VendorId, network: NetworkId, mode: AirtimeMode, amount: number, quantity = 1): number {
  if (mode === "epin") {
    const unit = Math.round(amount / quantity);
    if (vendorId === "maskawasub") {
      const discountPerPin = network === "mtn" ? 2 : unit === 200 && network === "airtel" ? 2 : 3;
      return Math.max(0, amount - discountPerPin * quantity);
    }
    return Number((amount * 0.98).toFixed(2));
  }
  const mult = VTU_COST_MULTIPLIER[vendorId]?.[network] ?? 0.98;
  return Number((amount * mult).toFixed(2));
}

function preferredAirtimeVendors(network: NetworkId, mode: AirtimeMode, unitAmount: number): VendorId[] {
  if (mode === "epin") {
    return ["maskawasub", "vtpass"];
  }
  switch (network) {
    case "glo":
      return ["maskawasub", "smeplug", "vtpass", "pairgate"];
    case "airtel":
      return ["maskawasub", "smeplug", "vtpass", "pairgate"];
    case "9mobile":
      return ["maskawasub", "smeplug", "vtpass", "pairgate"];
    case "mtn":
    default:
      return ["maskawasub", "smeplug", "vtpass", "pairgate"];
  }
}

async function cashbackEnabled() {
  const { data } = await createAdminClient().from("feature_flags").select("enabled").eq("key", "rewards.cashback").maybeSingle();
  return Boolean(data?.enabled);
}

export async function listPurchaseProducts(userId: string, serviceType?: string, network?: string) {
  const client = createAdminClient();
  let query = client
    .from("service_products")
    .select("id,name,description,service_type,network,selling_price,cashback_amount,provider_product_code,featured,validity,metadata,placement:product_placements(surface,badge,is_active),provider:provider_registry(name,slug,status)")
    .eq("status", "active")
    .order("selling_price", { ascending: true })
    .limit(300);
  if (serviceType) query = query.eq("service_type", serviceType);
  if (network) query = query.eq("network", network);
  const [{ data, error }, cashbackOn, { data: pricingRules }] = await Promise.all([
    query,
    cashbackEnabled(),
    client
      .from("pricing_rules")
      .select("id,rule_type,value,product_id,service_type,customer_segment,minimum_amount,maximum_amount,starts_at,ends_at,priority")
      .eq("enabled", true)
      .order("priority", { ascending: true })
      .limit(200),
  ]);
  // Never show placeholder products: they cannot be purchased and their prices are not real.
  if (error) throw new Error("Products are unavailable right now.");

  const nowMs = Date.now();
  const activeRules = (pricingRules ?? []).filter((rule) => {
    if (rule.customer_segment && rule.customer_segment !== "standard") return false;
    if (rule.starts_at && new Date(rule.starts_at).getTime() > nowMs) return false;
    if (rule.ends_at && new Date(rule.ends_at).getTime() <= nowMs) return false;
    return true;
  });

  return (data ?? []).map((product) => {
    const basePrice = Number(product.selling_price);
    let price = basePrice;
    for (const rule of activeRules) {
      if (rule.product_id && rule.product_id !== product.id) continue;
      if (!rule.product_id && rule.service_type && rule.service_type !== product.service_type) continue;
      if (!rule.product_id && !rule.service_type) continue;
      if (rule.minimum_amount !== null && price < Number(rule.minimum_amount)) continue;
      if (rule.maximum_amount !== null && price > Number(rule.maximum_amount)) continue;
      const val = Number(rule.value);
      if (rule.rule_type === "fixed_markup") price += val;
      if (rule.rule_type === "percentage_markup") price *= 1 + val / 100;
      if (rule.rule_type === "fixed_discount") price -= val;
      if (rule.rule_type === "percentage_discount") price *= 1 - val / 100;
      if (rule.rule_type === "override_price") price = val;
      break;
    }
    const finalPrice = Math.max(0, Math.round(price * 100) / 100);
    return {
      ...product,
      basePrice,
      price: finalPrice,
      cashback: cashbackOn ? Number(product.cashback_amount) : 0,
      category: (product.metadata as { category?: string } | null)?.category || "daily",
      dataAmountMb: Number((product.metadata as { data_amount_mb?: number } | null)?.data_amount_mb) || 0,
      health: deriveCustomerHealth(product),
      userId,
    };
  });
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

async function purchaseDirectAirtimeOrEpin(userId: string, rawInput: unknown) {
  if (rawInput && typeof rawInput === "object" && "mode" in rawInput && rawInput.mode === "epin") return purchaseRechargeCards(userId, rawInput);
  const input = airtimeInputSchema.parse(rawInput);
  const client = createAdminClient();
  const mode: AirtimeMode = input.mode;
  const quantity = mode === "epin" ? Math.max(1, Math.min(20, input.quantity ?? 1)) : 1;
  const unitAmount = mode === "epin" ? input.amount / quantity : input.amount;

  if (mode === "epin" && ![100, 200, 500, 1000].includes(unitAmount)) {
    throw new Error("Recharge card e-PINs are available in ₦100, ₦200, ₦500, and ₦1,000 denominations, and the total must equal the PIN value × quantity.");
  }
  if (mode === "epin" && !pinVaultConfigured()) {
    // Refuse before charging: PINs must never be stored unencrypted.
    throw new Error("Recharge PINs are temporarily unavailable.");
  }

  let destination = input.destination.trim();
  if (mode === "vtu") {
    destination = normalizePhone(destination);
    if (!isNigerianPhone(destination)) {
      throw new Error("Enter a valid Nigerian phone number.");
    }
  } else {
    // For e-PIN, normalize if a phone number was passed, otherwise use a descriptive label
    const normalized = normalizePhone(destination);
    destination = isNigerianPhone(normalized)
      ? normalized
      : `${input.network.toUpperCase()} e-PIN (${quantity}x ₦${unitAmount})`;
  }

  const totalAmount = Number(input.amount.toFixed(2));
  const policy = await evaluateCustomerPurchasePolicy(userId, "airtime", totalAmount);
  if (!policy.allowed) throw new Error(policy.reason);

  // Load registered providers so we can map vendor slugs to provider_registry UUIDs
  const { data: registryRows } = await client
    .from("provider_registry")
    .select("id,slug,name,status");
  const registryBySlug = new Map<string, { id: string; slug: string; name: string; status: string }>();
  for (const row of registryRows ?? []) {
    registryBySlug.set(row.slug, row);
  }

  const routeDecision = await resolveAirtimeRoute(input.network, mode, totalAmount);
  const preferredOrder = [
    routeDecision.primaryProvider,
    ...(routeDecision.fallbackProvider ? [routeDecision.fallbackProvider] : []),
    ...preferredAirtimeVendors(input.network, mode, unitAmount),
  ];
  const seenSlugs = new Set<string>();
  const uniqueOrder = preferredOrder.filter((slug) => {
    if (seenSlugs.has(slug)) return false;
    seenSlugs.add(slug);
    return true;
  });

  const candidateVendors = uniqueOrder.filter((slug) =>
    isVendorActive(registryBySlug.get(slug), slug)
  );

  if (candidateVendors.length === 0) {
    throw new Error("No live airtime provider is configured on the server yet.");
  }

  const primarySlug = candidateVendors[0];
  const primaryProvider = registryBySlug.get(primarySlug)!;
  const providerCost = estimateProviderCost(primarySlug, input.network, mode, totalAmount, quantity);
  const netLabel = input.network === "mtn" ? "MTN" : input.network === "glo" ? "Glo" : input.network === "airtel" ? "Airtel" : "9mobile";
  const productName =
    mode === "epin"
      ? `${netLabel} ₦${unitAmount.toLocaleString("en-NG")} Recharge PIN${quantity > 1 ? ` (×${quantity})` : ""}`
      : `${netLabel} ₦${totalAmount.toLocaleString("en-NG")} Airtime`;

  const start = await client.rpc("customer_start_service_purchase_v2", {
    p_user_id: userId,
    p_idempotency_key: input.idempotencyKey,
    p_reference: reference(),
    p_service_type: "airtime",
    p_product_id: null,
    p_provider_id: primaryProvider.id,
    p_destination: destination,
    p_amount: totalAmount,
    p_provider_cost: providerCost,
    p_cashback_amount: 0,
    p_metadata: {
      productName,
      network: input.network,
      mode,
      quantity,
      unitAmount,
      cardName: input.cardName || "Funda",
      provider_cost_source: "estimate",
    },
    ...limitParams(policy),
  });

  if (start.error || !start.data?.[0]) {
    throw new Error(start.error?.message || "Your wallet could not be charged.");
  }

  const created = start.data[0] as {
    transaction_id: string;
    internal_reference: string;
    status: string;
    balance: number;
    reused: boolean;
  };
  if (created.reused) {
    return {
      transactionId: created.transaction_id,
      reference: created.internal_reference,
      status: created.status,
      balance: Number(created.balance),
      reused: true,
    };
  }

  let activeSlug = primarySlug;
  let activeProviderId = primaryProvider.id;
  let lastError: unknown = null;
  let result: PurchaseResult | null = null;
  let attemptNumber = 0;

  for (const candidateSlug of candidateVendors) {
    const candidateReg = registryBySlug.get(candidateSlug);
    if (!candidateReg) continue;
    activeSlug = candidateSlug;
    activeProviderId = candidateReg.id;
    attemptNumber += 1;
    const vendor = getVendor(candidateSlug);
    const started = Date.now();

    try {
      const vendorResult = await vendor.purchase({
        type: "airtime",
        mode,
        network: input.network,
        phone: destination,
        amount: totalAmount,
        quantity,
        cardName: input.cardName || "Funda",
        reference: created.internal_reference,
      });

      const outcomeStatus =
        vendorResult.status === "successful"
          ? "successful"
          : vendorResult.status === "failed"
          ? "failed"
          : "processing";

      await client.from("provider_attempts").insert({
        transaction_id: created.transaction_id,
        provider_id: activeProviderId,
        attempt_number: attemptNumber,
        outcome: outcomeStatus,
        provider_reference: vendorResult.providerReference ?? null,
        latency_ms: Date.now() - started,
        response_redacted: { message: vendorResult.message, mode },
      });

      await recordProviderApiCall({
        requestId: randomUUID(),
        provider: activeSlug,
        transactionReference: created.internal_reference,
        method: "POST",
        endpoint: `${activeSlug}/${mode === "epin" ? "epin" : "airtime"}`,
        response: vendorResult.raw,
        latencyMs: Date.now() - started,
        outcome: "successful",
      });

      result = vendorResult;
      break;
    } catch (cause) {
      lastError = cause;
      const errMsg = cause instanceof Error ? cause.message : "Provider purchase failed.";
      const definitive = cause instanceof ProviderRequestError && cause.definitive;
      await client.from("provider_attempts").insert({
        transaction_id: created.transaction_id,
        provider_id: activeProviderId,
        attempt_number: attemptNumber,
        outcome: definitive ? "failed" : "timeout",
        latency_ms: Date.now() - started,
        response_redacted: { error: errMsg, mode },
      });
      await recordProviderApiCall({
        requestId: randomUUID(),
        provider: activeSlug,
        transactionReference: created.internal_reference,
        method: "POST",
        endpoint: `${activeSlug}/${mode === "epin" ? "epin" : "airtime"}`,
        response: { error: errMsg },
        latencyMs: Date.now() - started,
        outcome: "failed",
      });
      // Fail over only when this provider definitively rejected the request. A timeout or 5xx may
      // still deliver, so trying another provider could deliver twice; leave it pending for requery.
      if (!definitive) break;
    }
  }

  if (result) {
    const status =
      result.status === "successful"
        ? "successful"
        : result.status === "failed"
        ? "failed"
        : "pending";
    const pins: RechargePinItem[] | undefined = result.pins && result.pins.length > 0 ? result.pins : undefined;

    // Update transaction metadata with generated pins & final provider if needed
    await client
      .from("service_transactions")
      .update({
        provider_id: activeProviderId,
        provider_cost: estimateProviderCost(activeSlug, input.network, mode, totalAmount, quantity),
        metadata: {
          productName,
          network: input.network,
          mode,
          quantity,
          unitAmount,
          cardName: input.cardName || "Funda",
          provider: activeSlug,
          provider_cost_source: "estimate",
          ...(pins ? { pins_encrypted: encryptPins(pins), pinCount: pins.length } : {}),
        },
      })
      .eq("id", created.transaction_id);

    const settlement = await client.rpc("customer_settle_service_purchase", {
      p_user_id: userId,
      p_transaction_id: created.transaction_id,
      p_status: status,
      p_summary: result.message,
      p_provider_reference: result.providerReference ?? null,
      p_metadata: { provider: activeSlug, mode, pinCount: pins?.length ?? 0 },
    });
    if (settlement.error) {
      throw new Error("Provider response received, but the purchase record could not be settled.");
    }

    if (status === "successful") {
      void recordServiceBeneficiary({
        userId,
        serviceType: "airtime",
        recipient: destination,
        networkOrDisco: input.network,
        label: netLabel,
      });
    }

    if (status === "pending") {
      await enqueueAdminJob(
        "provider.requery",
        { transactionId: created.transaction_id },
        `provider.requery:${created.transaction_id}`,
      );
    }

    const settled = settlement.data?.[0] as { balance?: number; refunded?: boolean } | undefined;

    await dispatchPurchaseReceipt({
      userId,
      transactionId: created.transaction_id,
      reference: created.internal_reference,
      providerReference: result.providerReference ?? null,
      productName,
      amount: totalAmount,
      cashback: 0,
      destination,
      network: input.network,
      serviceType: "airtime",
      mode,
      pinCount: pins?.length ?? quantity,
      status: status as "successful" | "failed" | "pending",
      message: result.message,
      balance: Number(settled?.balance ?? created.balance),
    });

    return {
      transactionId: created.transaction_id,
      reference: created.internal_reference,
      status,
      balance: Number(settled?.balance ?? created.balance),
      reused: false,
      refunded: Boolean(settled?.refunded),
      message: result.message,
      providerReference: result.providerReference ?? null,
      productName,
      amount: totalAmount,
      cashback: 0,
      destination,
      network: input.network,
      serviceType: "airtime",
      mode,
      pins,
      createdAt: new Date().toISOString(),
    };
  }

  // All candidate providers failed
  const message = lastError instanceof Error ? lastError.message : "Provider purchase failed.";
  const definitive = lastError instanceof ProviderRequestError && lastError.definitive;
  const status = definitive ? "failed" : "pending";

  // Requery must ask the provider that may still be delivering, not the first one tried.
  await client
    .from("service_transactions")
    .update({ provider_id: activeProviderId, provider_cost: estimateProviderCost(activeSlug, input.network, mode, totalAmount, quantity) })
    .eq("id", created.transaction_id);

  const settlement = await client.rpc("customer_settle_service_purchase", {
    p_user_id: userId,
    p_transaction_id: created.transaction_id,
    p_status: status,
    p_summary: message,
    p_provider_reference: null,
    p_metadata: { provider: activeSlug, mode, error: true },
  });

  if (!definitive) {
    await enqueueAdminJob(
      "provider.requery",
      { transactionId: created.transaction_id },
      `provider.requery:${created.transaction_id}`,
    );
  }

  await dispatchPurchaseReceipt({
    userId,
    transactionId: created.transaction_id,
    reference: created.internal_reference,
    providerReference: null,
    productName,
    amount: totalAmount,
    cashback: 0,
    destination,
    network: input.network,
    serviceType: "airtime",
    mode,
    status: status as "successful" | "failed" | "pending",
    message,
  });

  const settled = settlement.data?.[0] as { balance?: number; refunded?: boolean } | undefined;
  return {
    transactionId: created.transaction_id,
    reference: created.internal_reference,
    status,
    balance: Number(settled?.balance ?? created.balance),
    reused: false,
    refunded: Boolean(settled?.refunded),
    message,
    productName,
    amount: totalAmount,
    cashback: 0,
    destination,
    network: input.network,
    serviceType: "airtime",
    mode,
    createdAt: new Date().toISOString(),
  };
}

async function purchaseDirectElectricity(userId: string, rawInput: unknown) {
  const input = electricityInputSchema.parse(rawInput);
  const client = createAdminClient();

  const config = await resolveElectricityConfig(input.disco);
  if (!config || !config.isActive) {
    throw new Error(config?.maintenanceNotice || `${input.disco.toUpperCase()} electricity service is temporarily offline for maintenance.`);
  }

  if (input.meterType === "prepaid" && !config.supportsPrepaid) {
    throw new Error(`${config.discoName} does not support prepaid meters at this time.`);
  }
  if (input.meterType === "postpaid" && !config.supportsPostpaid) {
    throw new Error(`${config.discoName} does not support postpaid meters at this time.`);
  }

  if (input.amount < config.minPurchaseAmount) {
    throw new Error(`Minimum purchase for ${config.discoName} is ₦${config.minPurchaseAmount.toLocaleString("en-NG")}.`);
  }
  if (input.amount > config.maxPurchaseAmount) {
    throw new Error(`Maximum purchase for ${config.discoName} is ₦${config.maxPurchaseAmount.toLocaleString("en-NG")}.`);
  }

  // Handle coupon if provided
  let discount = 0;
  let couponCodeValid = false;
  if (input.couponCode) {
    const couponRes = await validateCoupon(input.couponCode, "electricity", input.amount, userId);
    if (couponRes.valid) {
      discount = couponRes.discountAmount;
      couponCodeValid = true;
    }
  }

  const convenienceFee = config.convenienceFee ?? 0;
  const totalCharged = Math.max(1, Number((input.amount + convenienceFee - discount).toFixed(2)));
  const providerCost = Number((input.amount * 0.985).toFixed(2));
  const cashback = config.cashbackPercentage > 0 ? Number(((input.amount * config.cashbackPercentage) / 100).toFixed(2)) : 0;

  const policy = await evaluateCustomerPurchasePolicy(userId, "electricity", totalCharged);
  if (!policy.allowed) throw new Error(policy.reason);

  const { data: registryRows } = await client.from("provider_registry").select("id,slug,name,status");
  const registryBySlug = new Map<string, { id: string; slug: string; name: string; status: string }>();
  for (const row of registryRows ?? []) {
    registryBySlug.set(row.slug, row);
  }

  const candidateVendors: VendorId[] = [];
  if (config.primaryProvider && isVendorActive(registryBySlug.get(config.primaryProvider), config.primaryProvider)) {
    candidateVendors.push(config.primaryProvider);
  }
  if (config.fallbackProvider && !candidateVendors.includes(config.fallbackProvider) && isVendorActive(registryBySlug.get(config.fallbackProvider), config.fallbackProvider)) {
    candidateVendors.push(config.fallbackProvider);
  }

  if (candidateVendors.length === 0) {
    for (const v of ["vtpass", "maskawasub"] as VendorId[]) {
      if (isVendorActive(registryBySlug.get(v), v)) {
        candidateVendors.push(v);
        break;
      }
    }
  }

  if (candidateVendors.length === 0) {
    throw new Error("No live electricity provider is configured on the server yet.");
  }

  const primarySlug = candidateVendors[0];
  const primaryProvider = registryBySlug.get(primarySlug)!;
  const productName = `${config.discoName} (${input.meterType.toUpperCase()})`;

  const start = await client.rpc("customer_start_service_purchase_v2", {
    p_user_id: userId,
    p_idempotency_key: input.idempotencyKey,
    p_reference: reference(),
    p_service_type: "electricity",
    p_product_id: null,
    p_provider_id: primaryProvider.id,
    p_destination: input.meterNumber,
    p_amount: totalCharged,
    p_provider_cost: providerCost,
    p_cashback_amount: cashback,
    p_metadata: {
      productName,
      disco: input.disco,
      discoName: config.discoName,
      meterNumber: input.meterNumber,
      meterType: input.meterType,
      customerName: input.customerName || "Customer",
      customerAddress: input.customerAddress || "",
      phone: input.phone || "",
      tokenAmount: input.amount,
      convenienceFee,
      discount,
      couponCode: couponCodeValid ? input.couponCode : null,
      provider_cost_source: "estimate",
    },
    ...limitParams(policy),
  });

  if (start.error || !start.data?.[0]) {
    throw new Error(start.error?.message || "Your wallet could not be charged.");
  }

  const created = start.data[0] as {
    transaction_id: string;
    internal_reference: string;
    status: string;
    balance: number;
    reused: boolean;
  };

  if (created.reused) {
    return {
      transactionId: created.transaction_id,
      reference: created.internal_reference,
      status: created.status,
      balance: Number(created.balance),
      reused: true,
    };
  }

  let activeSlug = primarySlug;
  let activeProviderId = primaryProvider.id;
  let lastError: unknown = null;
  let result: PurchaseResult | null = null;
  let attemptNumber = 0;

  for (const candidateSlug of candidateVendors) {
    const candidateReg = registryBySlug.get(candidateSlug);
    if (!candidateReg) continue;
    activeSlug = candidateSlug;
    activeProviderId = candidateReg.id;
    attemptNumber += 1;
    const vendor = getVendor(candidateSlug);
    const started = Date.now();

    try {
      const vendorResult = await vendor.purchase({
        type: "electricity",
        network: "mtn",
        disco: input.disco,
        meterNumber: input.meterNumber,
        meterType: input.meterType,
        amount: input.amount,
        phone: input.phone || "08012345678",
        customerName: input.customerName,
        customerAddress: input.customerAddress,
        reference: created.internal_reference,
      });

      const outcomeStatus =
        vendorResult.status === "successful"
          ? "successful"
          : vendorResult.status === "failed"
          ? "failed"
          : "processing";

      await client.from("provider_attempts").insert({
        transaction_id: created.transaction_id,
        provider_id: activeProviderId,
        attempt_number: attemptNumber,
        outcome: outcomeStatus,
        provider_reference: vendorResult.providerReference ?? null,
        latency_ms: Date.now() - started,
        response_redacted: { message: vendorResult.message, serviceType: "electricity", disco: input.disco },
      });

      await recordProviderApiCall({
        requestId: randomUUID(),
        provider: activeSlug,
        transactionReference: created.internal_reference,
        method: "POST",
        endpoint: `${activeSlug}/electricity`,
        response: vendorResult.raw,
        latencyMs: Date.now() - started,
        outcome: "successful",
      });

      result = vendorResult;
      break;
    } catch (cause) {
      lastError = cause;
      const errMsg = cause instanceof Error ? cause.message : "Provider purchase failed.";
      const definitive = cause instanceof ProviderRequestError && cause.definitive;

      await client.from("provider_attempts").insert({
        transaction_id: created.transaction_id,
        provider_id: activeProviderId,
        attempt_number: attemptNumber,
        outcome: definitive ? "failed" : "timeout",
        latency_ms: Date.now() - started,
        response_redacted: { error: errMsg, serviceType: "electricity", disco: input.disco },
      });

      await recordProviderApiCall({
        requestId: randomUUID(),
        provider: activeSlug,
        transactionReference: created.internal_reference,
        method: "POST",
        endpoint: `${activeSlug}/electricity`,
        response: { error: errMsg },
        latencyMs: Date.now() - started,
        outcome: "failed",
      });

      if (!definitive) break;
    }
  }

  if (result) {
    const status =
      result.status === "successful"
        ? "successful"
        : result.status === "failed"
        ? "failed"
        : "pending";

    if (status === "successful") {
      void recordServiceBeneficiary({
        userId,
        serviceType: "electricity",
        recipient: input.meterNumber,
        networkOrDisco: input.disco,
        label: input.customerName || config.discoName,
        meterType: input.meterType,
      });
      if (couponCodeValid && input.couponCode) {
        void recordCouponRedemption(input.couponCode);
      }
    }

    await client
      .from("service_transactions")
      .update({
        provider_id: activeProviderId,
        provider_cost: providerCost,
        metadata: {
          productName,
          disco: input.disco,
          discoName: config.discoName,
          meterNumber: input.meterNumber,
          meterType: input.meterType,
          customerName: input.customerName || "Customer",
          customerAddress: input.customerAddress || "",
          token: result.token || null,
          units: result.units || null,
          tokenAmount: input.amount,
          convenienceFee,
          discount,
          couponCode: couponCodeValid ? input.couponCode : null,
          provider: activeSlug,
          provider_cost_source: "estimate",
        },
      })
      .eq("id", created.transaction_id);

    const settlement = await client.rpc("customer_settle_service_purchase", {
      p_user_id: userId,
      p_transaction_id: created.transaction_id,
      p_status: status,
      p_summary: result.message,
      p_provider_reference: result.providerReference ?? null,
      p_metadata: { provider: activeSlug, serviceType: "electricity", token: result.token ?? null, units: result.units ?? null },
    });

    if (settlement.error) {
      throw new Error("Provider response received, but the purchase record could not be settled.");
    }

    if (status === "pending") {
      await enqueueAdminJob(
        "provider.requery",
        { transactionId: created.transaction_id },
        `provider.requery:${created.transaction_id}`,
      );
    }

    const settled = settlement.data?.[0] as { balance?: number; refunded?: boolean } | undefined;

    await dispatchPurchaseReceipt({
      userId,
      transactionId: created.transaction_id,
      reference: created.internal_reference,
      providerReference: result.providerReference ?? null,
      productName,
      amount: totalCharged,
      cashback,
      destination: input.meterNumber,
      serviceType: "electricity",
      token: result.token ?? null,
      units: result.units ?? null,
      status: status as "successful" | "failed" | "pending",
      message: result.message,
      balance: Number(settled?.balance ?? created.balance),
    });

    return {
      transactionId: created.transaction_id,
      reference: created.internal_reference,
      status,
      balance: Number(settled?.balance ?? created.balance),
      reused: false,
      refunded: Boolean(settled?.refunded),
      message: result.message,
      providerReference: result.providerReference ?? null,
      productName,
      amount: totalCharged,
      cashback,
      destination: input.meterNumber,
      serviceType: "electricity",
      token: result.token ?? null,
      units: result.units ?? null,
      customerName: input.customerName,
      customerAddress: input.customerAddress,
      disco: input.disco,
      discoName: config.discoName,
      meterType: input.meterType,
      createdAt: new Date().toISOString(),
    };
  }

  const message = lastError instanceof Error ? lastError.message : "Electricity purchase failed.";
  const definitive = lastError instanceof ProviderRequestError && lastError.definitive;
  const status = definitive ? "failed" : "pending";

  await client
    .from("service_transactions")
    .update({ provider_id: activeProviderId, provider_cost: providerCost })
    .eq("id", created.transaction_id);

  const settlement = await client.rpc("customer_settle_service_purchase", {
    p_user_id: userId,
    p_transaction_id: created.transaction_id,
    p_status: status,
    p_summary: message,
    p_provider_reference: null,
    p_metadata: { provider: activeSlug, serviceType: "electricity", error: true },
  });

  if (!definitive) {
    await enqueueAdminJob(
      "provider.requery",
      { transactionId: created.transaction_id },
      `provider.requery:${created.transaction_id}`,
    );
  }

  await dispatchPurchaseReceipt({
    userId,
    transactionId: created.transaction_id,
    reference: created.internal_reference,
    providerReference: null,
    productName,
    amount: totalCharged,
    cashback: 0,
    destination: input.meterNumber,
    serviceType: "electricity",
    status: status as "successful" | "failed" | "pending",
    message,
  });

  const settled = settlement.data?.[0] as { balance?: number; refunded?: boolean } | undefined;
  return {
    transactionId: created.transaction_id,
    reference: created.internal_reference,
    status,
    balance: Number(settled?.balance ?? created.balance),
    reused: false,
    refunded: Boolean(settled?.refunded),
    message,
    productName,
    amount: totalCharged,
    cashback: 0,
    destination: input.meterNumber,
    serviceType: "electricity",
    disco: input.disco,
    discoName: config.discoName,
    createdAt: new Date().toISOString(),
  };
}

export async function purchaseDirectCableTv(userId: string, rawInput: unknown) {
  const input = cableTvInputSchema.parse(rawInput);
  const client = createAdminClient();

  const config = await resolveCableTvConfig(input.operator);
  if (!config || !config.isActive) {
    throw new Error(config?.maintenanceNotice || `${input.operator.toUpperCase()} service is temporarily offline for maintenance.`);
  }

  // Authoritative server-side price lookup to prevent client-side price tampering
  const pkg = await getCableTvPackage(input.operator, input.packageCode);
  if (!pkg || !pkg.isActive) {
    throw new Error(`The selected bouquet (${input.packageCode}) is currently unavailable or inactive.`);
  }

  // Handle coupon validation if provided
  let discount = 0;
  let couponCodeValid = false;
  if (input.couponCode) {
    const couponRes = await validateCoupon(input.couponCode, "cable_tv", pkg.price, userId);
    if (couponRes.valid) {
      discount = couponRes.discountAmount;
      couponCodeValid = true;
    }
  }

  const convenienceFee = config.convenienceFee ?? 0;
  const totalCharged = Math.max(1, Number((pkg.price + convenienceFee - discount).toFixed(2)));
  const providerCost = Number((pkg.price * 0.985).toFixed(2));
  const cashback = config.cashbackPercentage > 0 ? Number(((pkg.price * config.cashbackPercentage) / 100).toFixed(2)) : 0;

  const policy = await evaluateCustomerPurchasePolicy(userId, "cable", totalCharged);
  if (!policy.allowed) throw new Error(policy.reason);

  const { data: registryRows } = await client.from("provider_registry").select("id,slug,name,status");
  const registryBySlug = new Map<string, { id: string; slug: string; name: string; status: string }>();
  for (const row of registryRows ?? []) {
    registryBySlug.set(row.slug, row);
  }

  const candidateVendors: VendorId[] = [];
  if (config.primaryProvider && isVendorActive(registryBySlug.get(config.primaryProvider), config.primaryProvider)) {
    candidateVendors.push(config.primaryProvider);
  }
  if (config.fallbackProvider && !candidateVendors.includes(config.fallbackProvider) && isVendorActive(registryBySlug.get(config.fallbackProvider), config.fallbackProvider)) {
    candidateVendors.push(config.fallbackProvider);
  }

  if (candidateVendors.length === 0) {
    for (const v of ["vtpass", "maskawasub"] as VendorId[]) {
      if (isVendorActive(registryBySlug.get(v), v)) {
        candidateVendors.push(v);
        break;
      }
    }
  }

  if (candidateVendors.length === 0) {
    throw new Error("No live Cable TV provider is configured on the server yet.");
  }

  const primarySlug = candidateVendors[0];
  const primaryProvider = registryBySlug.get(primarySlug)!;
  const productName = `${config.operatorName} - ${pkg.name}`;

  const start = await client.rpc("customer_start_service_purchase_v2", {
    p_user_id: userId,
    p_idempotency_key: input.idempotencyKey,
    p_reference: reference(),
    p_service_type: "tv",
    p_product_id: null,
    p_provider_id: primaryProvider.id,
    p_destination: input.smartcardNumber,
    p_amount: totalCharged,
    p_provider_cost: providerCost,
    p_cashback_amount: cashback,
    p_metadata: {
      productName,
      operator: input.operator,
      operatorName: config.operatorName,
      smartcardNumber: input.smartcardNumber,
      packageCode: input.packageCode,
      packageName: pkg.name,
      packagePrice: pkg.price,
      subscriptionType: input.subscriptionType,
      customerName: input.customerName || "Customer",
      phone: input.phone || "",
      convenienceFee,
      discount,
      couponCode: couponCodeValid ? input.couponCode : null,
      provider_cost_source: "estimate",
    },
    ...limitParams(policy),
  });

  if (start.error || !start.data?.[0]) {
    throw new Error(start.error?.message || "Your wallet could not be charged.");
  }

  const created = start.data[0] as {
    transaction_id: string;
    internal_reference: string;
    status: string;
    balance: number;
    reused: boolean;
  };

  if (created.reused) {
    return {
      transactionId: created.transaction_id,
      reference: created.internal_reference,
      status: created.status,
      balance: Number(created.balance),
      reused: true,
    };
  }

  let activeSlug = primarySlug;
  let activeProviderId = primaryProvider.id;
  let lastError: unknown = null;
  let result: PurchaseResult | null = null;
  let attemptNumber = 0;

  for (const candidateSlug of candidateVendors) {
    const candidateReg = registryBySlug.get(candidateSlug);
    if (!candidateReg) continue;
    activeSlug = candidateSlug;
    activeProviderId = candidateReg.id;
    attemptNumber += 1;
    const vendor = getVendor(candidateSlug);
    const started = Date.now();

    try {
      const vendorResult = await vendor.purchase({
        type: "tv",
        network: "mtn",
        operator: input.operator,
        smartcardNumber: input.smartcardNumber,
        packageCode: input.packageCode,
        subscriptionType: input.subscriptionType,
        amount: pkg.price,
        phone: input.phone || "08012345678",
        customerName: input.customerName,
        reference: created.internal_reference,
      });

      const outcomeStatus =
        vendorResult.status === "successful"
          ? "successful"
          : vendorResult.status === "failed"
          ? "failed"
          : "processing";

      await client.from("provider_attempts").insert({
        transaction_id: created.transaction_id,
        provider_id: activeProviderId,
        attempt_number: attemptNumber,
        outcome: outcomeStatus,
        provider_reference: vendorResult.providerReference ?? null,
        latency_ms: Date.now() - started,
        response_redacted: { message: vendorResult.message, serviceType: "cable_tv", operator: input.operator },
      });

      await recordProviderApiCall({
        requestId: randomUUID(),
        provider: activeSlug,
        transactionReference: created.internal_reference,
        method: "POST",
        endpoint: `${activeSlug}/tv`,
        response: vendorResult.raw,
        latencyMs: Date.now() - started,
        outcome: "successful",
      });

      result = vendorResult;
      break;
    } catch (cause) {
      lastError = cause;
      const errMsg = cause instanceof Error ? cause.message : "Provider purchase failed.";
      const definitive = cause instanceof ProviderRequestError && cause.definitive;

      await client.from("provider_attempts").insert({
        transaction_id: created.transaction_id,
        provider_id: activeProviderId,
        attempt_number: attemptNumber,
        outcome: definitive ? "failed" : "timeout",
        latency_ms: Date.now() - started,
        response_redacted: { error: errMsg, serviceType: "cable_tv", operator: input.operator },
      });

      await recordProviderApiCall({
        requestId: randomUUID(),
        provider: activeSlug,
        transactionReference: created.internal_reference,
        method: "POST",
        endpoint: `${activeSlug}/tv`,
        response: { error: errMsg },
        latencyMs: Date.now() - started,
        outcome: "failed",
      });

      if (!definitive) break;
    }
  }

  if (result) {
    const status =
      result.status === "successful"
        ? "successful"
        : result.status === "failed"
        ? "failed"
        : "pending";

    if (status === "successful") {
      void recordServiceBeneficiary({
        userId,
        serviceType: "cable_tv",
        recipient: input.smartcardNumber,
        networkOrDisco: input.operator,
        label: input.customerName || config.operatorName,
      });
      if (couponCodeValid && input.couponCode) {
        void recordCouponRedemption(input.couponCode);
      }
    }

    await client
      .from("service_transactions")
      .update({
        provider_id: activeProviderId,
        provider_cost: providerCost,
        metadata: {
          productName,
          operator: input.operator,
          operatorName: config.operatorName,
          smartcardNumber: input.smartcardNumber,
          packageCode: input.packageCode,
          packageName: pkg.name,
          packagePrice: pkg.price,
          subscriptionType: input.subscriptionType,
          customerName: input.customerName || "Customer",
          convenienceFee,
          discount,
          couponCode: couponCodeValid ? input.couponCode : null,
          provider: activeSlug,
          provider_cost_source: "estimate",
        },
      })
      .eq("id", created.transaction_id);

    const settlement = await client.rpc("customer_settle_service_purchase", {
      p_user_id: userId,
      p_transaction_id: created.transaction_id,
      p_status: status,
      p_summary: result.message,
      p_provider_reference: result.providerReference ?? null,
      p_metadata: { provider: activeSlug, serviceType: "cable_tv" },
    });

    if (settlement.error) {
      throw new Error("Provider response received, but the purchase record could not be settled.");
    }

    if (status === "pending") {
      await enqueueAdminJob(
        "provider.requery",
        { transactionId: created.transaction_id },
        `provider.requery:${created.transaction_id}`,
      );
    }

    const settled = settlement.data?.[0] as { balance?: number; refunded?: boolean } | undefined;

    await dispatchPurchaseReceipt({
      userId,
      transactionId: created.transaction_id,
      reference: created.internal_reference,
      providerReference: result.providerReference ?? null,
      productName,
      amount: totalCharged,
      cashback,
      destination: input.smartcardNumber,
      serviceType: "tv",
      status: status as "successful" | "failed" | "pending",
      message: result.message,
      balance: Number(settled?.balance ?? created.balance),
    });

    return {
      transactionId: created.transaction_id,
      reference: created.internal_reference,
      status,
      balance: Number(settled?.balance ?? created.balance),
      reused: false,
      refunded: Boolean(settled?.refunded),
      message: result.message,
      providerReference: result.providerReference ?? null,
      productName,
      amount: totalCharged,
      cashback,
      destination: input.smartcardNumber,
      serviceType: "tv",
      customerName: input.customerName,
      operator: input.operator,
      operatorName: config.operatorName,
      packageName: pkg.name,
      createdAt: new Date().toISOString(),
    };
  }

  const message = lastError instanceof Error ? lastError.message : "Cable TV purchase failed.";
  const definitive = lastError instanceof ProviderRequestError && lastError.definitive;
  const status = definitive ? "failed" : "pending";

  await client
    .from("service_transactions")
    .update({ provider_id: activeProviderId, provider_cost: providerCost })
    .eq("id", created.transaction_id);

  const settlement = await client.rpc("customer_settle_service_purchase", {
    p_user_id: userId,
    p_transaction_id: created.transaction_id,
    p_status: status,
    p_summary: message,
    p_provider_reference: null,
    p_metadata: { provider: activeSlug, serviceType: "cable_tv", error: true },
  });

  if (!definitive) {
    await enqueueAdminJob(
      "provider.requery",
      { transactionId: created.transaction_id },
      `provider.requery:${created.transaction_id}`,
    );
  }

  await dispatchPurchaseReceipt({
    userId,
    transactionId: created.transaction_id,
    reference: created.internal_reference,
    providerReference: null,
    productName,
    amount: totalCharged,
    cashback: 0,
    destination: input.smartcardNumber,
    serviceType: "tv",
    status: status as "successful" | "failed" | "pending",
    message,
  });

  const settled = settlement.data?.[0] as { balance?: number; refunded?: boolean } | undefined;
  return {
    transactionId: created.transaction_id,
    reference: created.internal_reference,
    status,
    balance: Number(settled?.balance ?? created.balance),
    reused: false,
    refunded: Boolean(settled?.refunded),
    message,
    productName,
    amount: totalCharged,
    cashback: 0,
    destination: input.smartcardNumber,
    serviceType: "tv",
    operator: input.operator,
    operatorName: config.operatorName,
    packageName: pkg.name,
    createdAt: new Date().toISOString(),
  };
}

export async function purchaseDirectEducation(userId: string, rawInput: unknown) {
  const input = educationInputSchema.parse(rawInput);
  const client = createAdminClient();

  const config = await resolveEducationConfig(input.examBody);
  if (!config || !config.isActive) {
    throw new Error(config?.maintenanceNotice || `${input.examBody.toUpperCase()} service is temporarily offline for maintenance.`);
  }

  // Authoritative server-side package lookup
  const pkg = await getEducationPackage(input.examBody, input.packageCode);
  if (!pkg || !pkg.isActive) {
    throw new Error(`The selected exam package (${input.packageCode}) is currently unavailable or inactive.`);
  }

  // If exam requires profile code (e.g. JAMB), validate it
  if (config.requiresProfileCode) {
    const cleanProfile = (input.profileCode || "").trim();
    if (!cleanProfile || cleanProfile.length < 10) {
      throw new Error(`A valid 10-digit JAMB Profile Code is required for ${pkg.name}.`);
    }
  }

  const quantity = Math.max(1, Math.min(20, input.quantity || 1));
  const basePrice = pkg.price * quantity;

  // Handle coupon validation if provided
  let discount = 0;
  let couponCodeValid = false;
  if (input.couponCode) {
    const couponRes = await validateCoupon(input.couponCode, "education", basePrice, userId);
    if (couponRes.valid) {
      discount = couponRes.discountAmount;
      couponCodeValid = true;
    }
  }

  const convenienceFee = config.convenienceFee ?? 0;
  const totalCharged = Math.max(1, Number((basePrice + convenienceFee - discount).toFixed(2)));
  const unitCost = pkg.costPrice > 0 ? pkg.costPrice : pkg.price * 0.97;
  const providerCost = Number((unitCost * quantity).toFixed(2));
  const cashback = config.cashbackPercentage > 0 ? Number(((basePrice * config.cashbackPercentage) / 100).toFixed(2)) : 0;

  const policy = await evaluateCustomerPurchasePolicy(userId, "education", totalCharged);
  if (!policy.allowed) throw new Error(policy.reason);

  const { data: registryRows } = await client.from("provider_registry").select("id,slug,name,status");
  const registryBySlug = new Map<string, { id: string; slug: string; name: string; status: string }>();
  for (const row of registryRows ?? []) {
    registryBySlug.set(row.slug, row);
  }

  const candidateVendors: VendorId[] = [];
  if (config.primaryProvider && isVendorActive(registryBySlug.get(config.primaryProvider), config.primaryProvider)) {
    candidateVendors.push(config.primaryProvider);
  }
  if (config.fallbackProvider && !candidateVendors.includes(config.fallbackProvider) && isVendorActive(registryBySlug.get(config.fallbackProvider), config.fallbackProvider)) {
    candidateVendors.push(config.fallbackProvider);
  }

  if (candidateVendors.length === 0) {
    for (const v of ["vtpass", "maskawasub"] as VendorId[]) {
      if (isVendorActive(registryBySlug.get(v), v)) {
        candidateVendors.push(v);
        break;
      }
    }
  }

  if (candidateVendors.length === 0) {
    throw new Error("No live Education API provider is configured on the server yet.");
  }

  const primarySlug = candidateVendors[0];
  const primaryProvider = registryBySlug.get(primarySlug)!;
  const destination = input.profileCode || input.phone;
  const productName = `${config.shortName} - ${pkg.name}${quantity > 1 ? ` (${quantity}× PINs)` : ""}`;

  const start = await client.rpc("customer_start_service_purchase_v2", {
    p_user_id: userId,
    p_idempotency_key: input.idempotencyKey,
    p_reference: reference(),
    p_service_type: "education",
    p_product_id: null,
    p_provider_id: primaryProvider.id,
    p_destination: destination,
    p_amount: totalCharged,
    p_provider_cost: providerCost,
    p_cashback_amount: cashback,
    p_metadata: {
      examBody: input.examBody,
      examName: config.name,
      packageCode: input.packageCode,
      packageName: pkg.name,
      quantity,
      candidatePhone: input.phone,
      candidateEmail: input.email || null,
      profileCode: input.profileCode || null,
      candidateName: input.candidateName || null,
      convenienceFee,
      discount,
      primaryProvider: primarySlug,
      fallbackProvider: candidateVendors[1] ?? null,
    },
  });

  if (start.error) throw new Error(start.error.message);
  const created = (start.data as Array<{ transaction_id: string; internal_reference: string; status: string; balance: number; reused: boolean }>)[0];

  if (created.reused) {
    return {
      transactionId: created.transaction_id,
      reference: created.internal_reference,
      status: created.status,
      balance: Number(created.balance),
      reused: true,
      refunded: false,
      productName,
      amount: totalCharged,
      cashback,
      destination,
      serviceType: "education",
      examBody: input.examBody,
      packageName: pkg.name,
      createdAt: new Date().toISOString(),
    };
  }

  let result: PurchaseResult | null = null;
  let lastError: unknown = null;
  let activeProviderId = primaryProvider.id;
  let activeSlug = primarySlug;

  for (let index = 0; index < candidateVendors.length; index++) {
    const slug = candidateVendors[index];
    const prov = registryBySlug.get(slug);
    if (!prov) continue;
    activeProviderId = prov.id;
    activeSlug = slug;
    const vendor = getVendor(slug);
    const attemptNumber = index + 1;
    const started = Date.now();

    try {
      const vendorResult = await vendor.purchase({
        type: "education",
        network: "mtn",
        phone: input.phone,
        email: input.email || undefined,
        amount: totalCharged,
        quantity,
        reference: created.internal_reference,
        examBody: input.examBody,
        packageCode: input.packageCode,
        profileCode: input.profileCode || undefined,
        candidateName: input.candidateName || undefined,
      });

      const outcomeStatus = vendorResult.status === "successful" ? "successful" : vendorResult.status === "pending" ? "pending" : "failed";
      await client.from("provider_attempts").insert({
        transaction_id: created.transaction_id,
        provider_id: activeProviderId,
        attempt_number: attemptNumber,
        outcome: outcomeStatus,
        provider_reference: vendorResult.providerReference ?? null,
        latency_ms: Date.now() - started,
        response_redacted: { message: vendorResult.message, serviceType: "education", examBody: input.examBody },
      });

      await recordProviderApiCall({
        requestId: randomUUID(),
        provider: activeSlug,
        transactionReference: created.internal_reference,
        method: "POST",
        endpoint: `${activeSlug}/education`,
        response: vendorResult.raw,
        latencyMs: Date.now() - started,
        outcome: "successful",
      });

      result = vendorResult;
      break;
    } catch (cause) {
      lastError = cause;
      const errMsg = cause instanceof Error ? cause.message : "Provider purchase failed.";
      const definitive = cause instanceof ProviderRequestError && cause.definitive;

      await client.from("provider_attempts").insert({
        transaction_id: created.transaction_id,
        provider_id: activeProviderId,
        attempt_number: attemptNumber,
        outcome: definitive ? "failed" : "timeout",
        latency_ms: Date.now() - started,
        response_redacted: { error: errMsg, serviceType: "education", examBody: input.examBody },
      });

      await recordProviderApiCall({
        requestId: randomUUID(),
        provider: activeSlug,
        transactionReference: created.internal_reference,
        method: "POST",
        endpoint: `${activeSlug}/education`,
        response: { error: errMsg },
        latencyMs: Date.now() - started,
        outcome: "failed",
      });

      if (!definitive) break;
    }
  }

  if (result) {
    const status = result.status === "successful" ? "successful" : result.status === "pending" ? "pending" : "failed";
    const educationPins = result.educationPins || [];
    const mainToken = result.token || educationPins[0]?.pin || null;

    let encryptedPins: unknown = null;
    if (educationPins.length > 0 && pinVaultConfigured()) {
      try {
        encryptedPins = encryptPins(educationPins.map((p) => ({
          pin: p.pin,
          serial: p.serial,
          amount: pkg.price,
          network: input.examBody,
          dialCode: p.instructions || config.instructions || "",
        })));
      } catch (err) {
        console.warn("[Education] PIN encryption warning:", err);
      }
    }

    await client
      .from("service_transactions")
      .update({
        provider_id: activeProviderId,
        provider_cost: providerCost,
        metadata: {
          examBody: input.examBody,
          examName: config.name,
          packageCode: input.packageCode,
          packageName: pkg.name,
          quantity,
          candidatePhone: input.phone,
          candidateEmail: input.email || null,
          profileCode: input.profileCode || null,
          candidateName: input.candidateName || null,
          convenienceFee,
          discount,
          token: mainToken,
          pins: educationPins,
          encryptedPins,
          instructions: config.instructions,
          portalUrl: config.portalUrl,
          provider: activeSlug,
          providerReference: result.providerReference ?? null,
        },
      })
      .eq("id", created.transaction_id);

    const settlement = await client.rpc("customer_settle_service_purchase", {
      p_user_id: userId,
      p_transaction_id: created.transaction_id,
      p_status: status,
      p_summary: result.message,
      p_provider_reference: result.providerReference ?? null,
      p_metadata: {
        provider: activeSlug,
        serviceType: "education",
        token: mainToken,
        pinsCount: educationPins.length,
      },
    });

    if (status === "pending") {
      await enqueueAdminJob(
        "provider.requery",
        { transactionId: created.transaction_id },
        `provider.requery:${created.transaction_id}`,
      );
    }

    if (couponCodeValid && input.couponCode && status === "successful") {
      await recordCouponRedemption(input.couponCode);
    }

    // Save beneficiary
    void recordServiceBeneficiary({
      userId,
      serviceType: "education",
      recipient: input.phone,
      networkOrDisco: input.examBody,
      label: input.candidateName || `${config.shortName} Candidate`,
    });

    const settled = settlement.data?.[0] as { balance?: number; refunded?: boolean } | undefined;

    await dispatchPurchaseReceipt({
      userId,
      transactionId: created.transaction_id,
      reference: created.internal_reference,
      providerReference: result.providerReference ?? null,
      productName,
      amount: totalCharged,
      cashback,
      destination,
      serviceType: "education",
      token: mainToken,
      pinCount: educationPins.length,
      status: status as "successful" | "failed" | "pending",
      message: result.message,
      balance: Number(settled?.balance ?? created.balance),
    });

    return {
      transactionId: created.transaction_id,
      reference: created.internal_reference,
      status,
      balance: Number(settled?.balance ?? created.balance),
      reused: false,
      refunded: Boolean(settled?.refunded),
      message: result.message,
      providerReference: result.providerReference ?? null,
      productName,
      amount: totalCharged,
      cashback,
      destination,
      serviceType: "education",
      examBody: input.examBody,
      examName: config.name,
      packageName: pkg.name,
      token: mainToken,
      pins: educationPins,
      instructions: config.instructions,
      portalUrl: config.portalUrl,
      candidatePhone: input.phone,
      candidateName: input.candidateName,
      createdAt: new Date().toISOString(),
    };
  }

  const message = lastError instanceof Error ? lastError.message : "Education PIN generation failed.";
  const definitive = lastError instanceof ProviderRequestError && lastError.definitive;
  const status = definitive ? "failed" : "pending";

  await client
    .from("service_transactions")
    .update({ provider_id: activeProviderId, provider_cost: providerCost })
    .eq("id", created.transaction_id);

  const settlement = await client.rpc("customer_settle_service_purchase", {
    p_user_id: userId,
    p_transaction_id: created.transaction_id,
    p_status: status,
    p_summary: message,
    p_provider_reference: null,
    p_metadata: { provider: activeSlug, serviceType: "education", error: true },
  });

  if (!definitive) {
    await enqueueAdminJob(
      "provider.requery",
      { transactionId: created.transaction_id },
      `provider.requery:${created.transaction_id}`,
    );
  }

  await dispatchPurchaseReceipt({
    userId,
    transactionId: created.transaction_id,
    reference: created.internal_reference,
    providerReference: null,
    productName,
    amount: totalCharged,
    cashback: 0,
    destination,
    serviceType: "education",
    status: status as "successful" | "failed" | "pending",
    message,
  });

  const settled = settlement.data?.[0] as { balance?: number; refunded?: boolean } | undefined;
  return {
    transactionId: created.transaction_id,
    reference: created.internal_reference,
    status,
    balance: Number(settled?.balance ?? created.balance),
    reused: false,
    refunded: Boolean(settled?.refunded),
    message,
    productName,
    amount: totalCharged,
    cashback: 0,
    destination,
    serviceType: "education",
    examBody: input.examBody,
    examName: config.name,
    packageName: pkg.name,
    createdAt: new Date().toISOString(),
  };
}

export async function purchaseService(userId: string, rawInput: unknown) {
  if (
    rawInput &&
    typeof rawInput === "object" &&
    "serviceType" in rawInput
  ) {
    const sType = (rawInput as { serviceType?: unknown }).serviceType;
    if (sType === "airtime") {
      return purchaseDirectAirtimeOrEpin(userId, rawInput);
    }
    if (sType === "electricity") {
      return purchaseDirectElectricity(userId, rawInput);
    }
    if (sType === "tv" || sType === "cable_tv" || sType === "cable") {
      return purchaseDirectCableTv(userId, rawInput);
    }
    if (sType === "education") {
      return purchaseDirectEducation(userId, rawInput);
    }
  }

  const input = catalogInputSchema.parse(rawInput);
  const client = createAdminClient();
  const { data: product, error } = await client
    .from("service_products")
    .select("id,name,service_type,network,provider_id,provider_product_code,status,provider_cost,selling_price,cashback_amount,validity,metadata,provider:provider_registry(id,name,slug,status)")
    .eq("id", input.productId)
    .single();
  if (error || !product || product.status !== "active") throw new Error("That service is unavailable. Pick another option.");
  if (!["data", "airtime"].includes(product.service_type)) throw new Error("This service is not ready for live purchases yet.");
  const preHealth = deriveCustomerHealth(product);
  if (preHealth.status === "outage") {
    throw new Error(preHealth.notice || "This bundle is temporarily unavailable from our supplier.");
  }
  const destination = normalizePhone(input.destination);
  if (!isNigerianPhone(destination)) throw new Error("Enter a valid Nigerian phone number.");
  const price = await calculateProductPrice(product.id);
  if (!price) throw new Error("That product is no longer available.");

  let couponDiscount = 0;
  let validCouponCode: string | null = null;
  if (input.couponCode?.trim()) {
    const couponCheck = await validateCoupon(input.couponCode, product.service_type, price.price, userId);
    if (!couponCheck.valid) {
      throw new Error(couponCheck.message);
    }
    couponDiscount = couponCheck.discountAmount;
    validCouponCode = couponCheck.code ?? input.couponCode.trim().toUpperCase();
  }

  const totalCharged = Math.max(0, Number((price.price - couponDiscount).toFixed(2)));
  if (totalCharged <= 0) {
    throw new Error("Net payable amount after discount must be greater than ₦0.");
  }

  const policy = await evaluateCustomerPurchasePolicy(userId, product.service_type, totalCharged);
  if (!policy.allowed) throw new Error(policy.reason);

  // Build ordered candidate offers from product_provider_offers + dynamic routing preference + legacy product fields
  const [{ data: offerRows }, route] = await Promise.all([
    client
      .from("product_provider_offers")
      .select("id,provider_id,provider_product_code,provider_cost,priority,status,provider:provider_registry(id,name,slug,status)")
      .eq("product_id", product.id)
      .eq("status", "active")
      .order("priority", { ascending: true })
      .order("provider_cost", { ascending: true }),
    selectProviderRoute(product.service_type, product.network, product.id),
  ]);

  type CandidateOffer = {
    providerId: string;
    slug: VendorId;
    providerName: string;
    productCode: string;
    providerCost: number;
    priority: number;
  };

  const candidates: CandidateOffer[] = [];
  const seenKeys = new Set<string>();

  const pushCandidate = (
    prov: { id?: string; name?: string; slug?: string; status?: string } | null | undefined,
    code: string | null | undefined,
    cost: number,
    priority: number,
  ) => {
    if (!prov?.id || !prov.slug || !vendorIds.has(prov.slug as VendorId)) return;
    const slug = prov.slug as VendorId;
    if (!isVendorActive({ status: prov.status ?? "down" }, slug)) return;
    if (product.service_type === "data" && !code) return;
    const resolvedCode = code ?? "";
    const dedup = `${prov.id}:${resolvedCode}`;
    if (seenKeys.has(dedup)) return;
    seenKeys.add(dedup);
    candidates.push({
      providerId: prov.id,
      slug,
      providerName: prov.name || slug.toUpperCase(),
      productCode: resolvedCode,
      providerCost: Number(cost) || price.providerCost,
      priority,
    });
  };

  for (const row of offerRows ?? []) {
    const prov = Array.isArray(row.provider) ? row.provider[0] : row.provider;
    const boost = route && row.provider_id === route.providerId ? -1000 : 0;
    pushCandidate(prov, row.provider_product_code, Number(row.provider_cost), Number(row.priority ?? 100) + boost);
  }
  candidates.sort((a, b) => a.priority - b.priority);

  const legacyProv = Array.isArray(product.provider) ? product.provider[0] : product.provider;
  if (route && route.providerId && route.slug) {
    // Only inject dynamic route fallback if product has an offer/code matching that provider
    const matchingOffer = (offerRows ?? []).find((row) => row.provider_id === route.providerId);
    if (matchingOffer) {
      pushCandidate(
        { id: route.providerId, name: route.provider, slug: route.slug, status: "operational" },
        matchingOffer.provider_product_code,
        Number(matchingOffer.provider_cost),
        0,
      );
    }
  }
  if (product.provider_id && legacyProv) {
    pushCandidate(
      { id: product.provider_id, name: legacyProv.name, slug: legacyProv.slug, status: legacyProv.status },
      product.provider_product_code,
      price.providerCost,
      500,
    );
  }

  if (candidates.length === 0) {
    throw new Error("No live provider is available for this bundle yet. Please link an active supplier offer in Admin > Data Bundles.");
  }

  const primaryCandidate = candidates[0];
  const cashback = (await cashbackEnabled()) ? price.cashback : 0;
  const baseMetadata = {
    productName: product.name,
    network: product.network,
    validity: product.validity ?? null,
    category: (product.metadata as { category?: string } | null)?.category ?? null,
    route: route?.ruleId ?? null,
    basePrice: price.basePrice,
    listPrice: price.price,
    discountAmount: couponDiscount,
    couponCode: validCouponCode,
    pricingRuleId: price.appliedRuleId,
    provider: primaryCandidate.slug,
    providerProductCode: primaryCandidate.productCode,
    fallbackCount: Math.max(0, candidates.length - 1),
  };

  const start = await client.rpc("customer_start_service_purchase_v2", {
    p_user_id: userId,
    p_idempotency_key: input.idempotencyKey,
    p_reference: reference(),
    p_service_type: product.service_type,
    p_product_id: product.id,
    p_provider_id: primaryCandidate.providerId,
    p_destination: destination,
    p_amount: totalCharged,
    p_provider_cost: primaryCandidate.providerCost,
    p_cashback_amount: cashback,
    p_metadata: baseMetadata,
    ...limitParams(policy),
  });
  if (start.error || !start.data?.[0]) throw new Error(start.error?.message || "Your wallet could not be charged.");
  const created = start.data[0] as { transaction_id: string; internal_reference: string; status: string; balance: number; reused: boolean };
  if (created.reused) {
    return {
      transactionId: created.transaction_id,
      reference: created.internal_reference,
      status: created.status,
      balance: Number(created.balance),
      reused: true,
      productName: product.name,
      amount: totalCharged,
      originalAmount: price.price,
      discountAmount: couponDiscount,
      couponCode: validCouponCode,
      cashback: created.status === "successful" ? cashback : 0,
      destination,
      network: product.network,
      serviceType: product.service_type,
    };
  }

  let activeCandidate = primaryCandidate;
  let attemptNumber = 0;
  let result: PurchaseResult | null = null;
  let lastError: unknown = null;

  for (const candidate of candidates) {
    activeCandidate = candidate;
    attemptNumber += 1;
    const vendor = getVendor(candidate.slug);
    const started = Date.now();
    try {
      const vendorResult = await vendor.purchase({
        type: product.service_type as "data" | "airtime",
        network: product.network as NetworkId,
        phone: destination,
        amount: totalCharged,
        planId: product.service_type === "data" ? candidate.productCode : undefined,
        reference: created.internal_reference,
      });
      const attemptOutcome =
        vendorResult.status === "successful"
          ? "successful"
          : vendorResult.status === "failed"
          ? "failed"
          : "processing";
      await client.from("provider_attempts").insert({
        transaction_id: created.transaction_id,
        provider_id: candidate.providerId,
        attempt_number: attemptNumber,
        outcome: attemptOutcome,
        provider_reference: vendorResult.providerReference ?? null,
        latency_ms: Date.now() - started,
        response_redacted: { message: vendorResult.message, productCode: candidate.productCode },
      });
      await recordProviderApiCall({
        requestId: randomUUID(),
        provider: candidate.slug,
        transactionReference: created.internal_reference,
        method: "POST",
        endpoint: `${candidate.slug}/${product.service_type}`,
        response: vendorResult.raw,
        latencyMs: Date.now() - started,
        outcome: vendorResult.status === "failed" ? "failed" : "successful",
      });

      if (vendorResult.status === "failed" && attemptNumber < candidates.length) {
        lastError = new ProviderRequestError(vendorResult.message || "Provider rejected request.", true);
        continue;
      }

      result = vendorResult;
      break;
    } catch (cause) {
      lastError = cause;
      const errMsg = cause instanceof Error ? cause.message : "Provider purchase failed.";
      const definitive = cause instanceof ProviderRequestError && cause.definitive;
      await client.from("provider_attempts").insert({
        transaction_id: created.transaction_id,
        provider_id: candidate.providerId,
        attempt_number: attemptNumber,
        outcome: definitive ? "failed" : "timeout",
        latency_ms: Date.now() - started,
        response_redacted: { error: errMsg, productCode: candidate.productCode },
      });
      await recordProviderApiCall({
        requestId: randomUUID(),
        provider: candidate.slug,
        transactionReference: created.internal_reference,
        method: "POST",
        endpoint: `${candidate.slug}/${product.service_type}`,
        response: { error: errMsg },
        latencyMs: Date.now() - started,
        outcome: "failed",
      });
      if (!definitive) break;
    }
  }

  const finalStatus = result
    ? result.status === "successful"
      ? "successful"
      : result.status === "failed"
      ? "failed"
      : "pending"
    : lastError instanceof ProviderRequestError && lastError.definitive
    ? "failed"
    : "pending";
  const finalMessage = result?.message ?? (lastError instanceof Error ? lastError.message : "Provider purchase failed.");
  const finalProviderRef = result?.providerReference ?? null;

  await client
    .from("service_transactions")
    .update({
      provider_id: activeCandidate.providerId,
      provider_cost: activeCandidate.providerCost,
      metadata: {
        ...baseMetadata,
        provider: activeCandidate.slug,
        providerProductCode: activeCandidate.productCode,
        attemptCount: attemptNumber,
        failoverUsed: attemptNumber > 1,
        ...(result ? {} : { error: true }),
      },
    })
    .eq("id", created.transaction_id);

  const settlement = await client.rpc("customer_settle_service_purchase", {
    p_user_id: userId,
    p_transaction_id: created.transaction_id,
    p_status: finalStatus,
    p_summary: finalMessage,
    p_provider_reference: finalProviderRef,
    p_metadata: {
      provider: activeCandidate.slug,
      productCode: activeCandidate.productCode,
      attemptCount: attemptNumber,
      failoverUsed: attemptNumber > 1,
      providerMessage: finalMessage,
    },
  });
  if (settlement.error) {
    throw new Error("Provider response received, but the purchase record could not be settled.");
  }

  if (finalStatus === "pending") {
    await enqueueAdminJob("provider.requery", { transactionId: created.transaction_id }, `provider.requery:${created.transaction_id}`);
  } else {
    await refreshProductHealth(product.id, {
      outcome: finalStatus,
      error: finalStatus === "failed" ? finalMessage : null,
    }).catch(() => {});
  }

  const settled = settlement.data?.[0] as { balance?: number; refunded?: boolean } | undefined;

  if (finalStatus === "successful") {
    if (validCouponCode) {
      await recordCouponRedemption(validCouponCode);
    }
    void recordServiceBeneficiary({
      userId,
      serviceType: product.service_type as "data" | "airtime",
      recipient: destination,
      networkOrDisco: product.network,
      label: `${product.network.toUpperCase()} ${product.service_type === "data" ? "Data" : "Airtime"}`,
    });
  }

  const awardedCashback = finalStatus === "successful" ? cashback : 0;
  const userMessage =
    finalStatus === "failed"
      ? (() => {
          const classified = classifyVendorError(finalMessage, product.name);
          if (classified.kind === "subscriber_ineligible") {
            return `This plan isn't available for ${destination} (${classified.advisory}). Your wallet was refunded.`;
          }
          return finalMessage;
        })()
      : finalMessage;

  await dispatchPurchaseReceipt({
    userId,
    transactionId: created.transaction_id,
    reference: created.internal_reference,
    providerReference: finalProviderRef,
    productName: product.name,
    amount: totalCharged,
    originalAmount: price.price,
    discountAmount: couponDiscount,
    couponCode: validCouponCode,
    cashback: awardedCashback,
    destination,
    network: product.network,
    serviceType: product.service_type,
    status: finalStatus as "successful" | "failed" | "pending",
    message: userMessage,
    balance: Number(settled?.balance ?? created.balance),
  });

  return {
    transactionId: created.transaction_id,
    reference: created.internal_reference,
    status: finalStatus,
    balance: Number(settled?.balance ?? created.balance),
    reused: false,
    refunded: Boolean(settled?.refunded),
    message: userMessage,
    providerReference: finalProviderRef,
    productName: product.name,
    amount: totalCharged,
    originalAmount: price.price,
    discountAmount: couponDiscount,
    couponCode: validCouponCode,
    cashback: awardedCashback,
    destination,
    network: product.network,
    serviceType: product.service_type,
    providerSlug: activeCandidate.slug,
    attemptCount: attemptNumber,
    createdAt: new Date().toISOString(),
  };
}
