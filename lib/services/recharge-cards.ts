import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { evaluateCustomerPurchasePolicy } from "../admin/engine";
import { recordProviderApiCall } from "../admin/telemetry";
import { matchingAirtimeRule, rechargeMargin, rechargePrice, rechargePurchaseSchema, rechargeSelectionSchema, validateRechargePins, type AirtimeRule, type RechargeQuote } from "../recharge-cards";
import { decryptPins, encryptPins, fingerprintRechargePin, pinVaultConfigured } from "../security/pin-vault";
import { createAdminClient } from "../supabase/admin";
import { getVendor } from "../test-engine/vendors";
import type { PurchaseResult } from "../test-engine/types";
import { ProviderRequestError } from "../test-engine/utils";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function quoteRechargeCards(rawInput: unknown) {
  const selection = rechargeSelectionSchema.parse(rawInput);
  if (!pinVaultConfigured()) throw new Error("Recharge cards are temporarily unavailable.");
  const client = createAdminClient();
  const { data: unreconciled, error: inventoryError } = await client.from("service_transactions").select("id").eq("metadata->>mode", "epin").is("metadata->>pinClaimsVersion", null).limit(1);
  if (inventoryError) throw new Error("Recharge-card inventory is unavailable.");
  if (unreconciled?.length) throw new Error("Recharge-card inventory is being reconciled. Try again shortly.");
  const [{ data: rules, error }, { data: cashbackFlag, error: flagError }] = await Promise.all([
    client.from("airtime_provider_routes").select("id,network,mode,min_amount,max_amount,priority,primary_provider,fallback_provider,discount_percentage,cashback_percentage,updated_at").eq("is_active", true).in("mode", ["epin", "all"]),
    client.from("feature_flags").select("enabled").eq("key", "rewards.cashback").maybeSingle(),
  ]);
  if (error || flagError) throw new Error("Recharge-card pricing is unavailable. Try again shortly.");
  const faceValue = selection.denomination * selection.quantity;
  const rule = matchingAirtimeRule((rules ?? []) as AirtimeRule[], selection.network, "epin", faceValue);
  if (!rule) throw new Error("Recharge cards are unavailable for this network and amount.");
  // A top-up adapter is never a recharge-card fallback, even if it is configured.
  if (rule.primary_provider !== "maskawasub") throw new Error("The recharge-card route needs a supported PIN provider.");
  const { data: provider, error: providerError } = await client.from("provider_registry").select("id,slug,status,environment").eq("slug", rule.primary_provider).maybeSingle();
  if (providerError || !provider || provider.environment !== "live" || !["operational", "degraded"].includes(provider.status) || !getVendor("maskawasub").isConfigured()) throw new Error("The recharge-card provider is temporarily unavailable.");
  const { data: offer, error: offerError } = await client.from("recharge_card_catalogue").select("id,unit_cost,max_quantity,updated_at").eq("network", selection.network).eq("denomination", selection.denomination).eq("provider_id", provider.id).eq("is_active", true).maybeSingle();
  if (offerError || !offer) throw new Error("This recharge-card denomination is unavailable.");
  if (selection.quantity > Number(offer.max_quantity)) throw new Error(`Choose up to ${offer.max_quantity} cards for this denomination.`);
  const cashbackPercentage = cashbackFlag?.enabled ? Number(rule.cashback_percentage) : 0;
  const price = rechargePrice(faceValue, Number(rule.discount_percentage), cashbackPercentage);
  const providerCost = Math.round(Number(offer.unit_cost) * selection.quantity * 100) / 100;
  if (rechargeMargin(price.payable, price.cashback, providerCost) < 0) throw new Error("Recharge-card pricing is under review. Choose another denomination or try later.");
  const quote: RechargeQuote = {
    ...selection, ...price, discountPercentage: Number(rule.discount_percentage), cashbackPercentage,
    ruleId: rule.id,
    quoteId: digest({ ...selection, ...price, ruleId: rule.id, providerId: provider.id, catalogueId: offer.id, catalogueVersion: offer.updated_at, discountPercentage: rule.discount_percentage, cashbackPercentage }),
  };
  return { quote, provider, providerCost, catalogueId: offer.id };
}

export async function rechargePurchaseSnapshot(userId: string, transactionId: string, reused = false) {
  const client = createAdminClient();
  const [{ data: tx, error }, { data: wallet }] = await Promise.all([
    client.from("service_transactions").select("id,internal_reference,provider_reference,destination,amount,discount_amount,cashback_amount,status,metadata,created_at").eq("id", transactionId).eq("user_id", userId).maybeSingle(),
    client.from("wallets").select("available_balance").eq("user_id", userId).maybeSingle(),
  ]);
  if (error || !tx || tx.metadata?.mode !== "epin") throw new Error("Recharge-card purchase not found.");
  const meta = tx.metadata as Record<string, unknown>;
  const ready = tx.status === "successful" && (!meta.deliveryStatus || meta.deliveryStatus === "ready");
  const storedPins = ready ? decryptPins(meta.pins_encrypted) : undefined;
  const pins = storedPins ? validateRechargePins(storedPins, { network: meta.network as RechargeQuote["network"], denomination: Number(meta.unitAmount), quantity: Number(meta.quantity) }) : undefined;
  const { data: refund } = await client.from("wallet_ledger_entries").select("id").eq("user_id", userId).eq("reference", `REFUND-${tx.internal_reference}`).maybeSingle();
  return {
    transactionId: tx.id, reference: tx.internal_reference, providerReference: tx.provider_reference,
    status: tx.status, amount: Number(tx.amount), balance: Number(wallet?.available_balance ?? 0), reused,
    refunded: Boolean(refund), productName: String(meta.productName ?? "Recharge cards"), destination: tx.destination,
    serviceType: "airtime" as const, mode: "epin" as const, network: String(meta.network),
    quantity: Number(meta.quantity), unitAmount: Number(meta.unitAmount), faceValue: Number(meta.faceValue ?? Number(tx.amount) + Number(tx.discount_amount)),
    discount: Number(tx.discount_amount), cashback: ready ? Number(tx.cashback_amount) : 0, quotedCashback: Number(tx.cashback_amount),
    deliveryStatus: String(meta.deliveryStatus ?? (ready ? "ready" : "awaiting_provider")), pinCount: Number(meta.pinCount ?? 0),
    pins: pins && !pins.issue ? pins.pins : undefined, cardName: String(meta.cardName ?? "Funda"), createdAt: tx.created_at,
    message: ready ? "Your recharge cards are ready." : tx.status === "failed" ? "The provider could not fulfil this order. Your wallet was refunded." : "Your order is being checked. Do not purchase it again to recover these PINs.",
  };
}

export async function settleRechargeCardResult(transactionId: string, providerId: string, result: PurchaseResult, expected: { network: RechargeQuote["network"]; denomination: number; quantity: number }, actorId?: string, reason?: string) {
  const batch = validateRechargePins(result.pins, expected);
  const issue = result.status === "successful" || (result.pins?.length ?? 0) > 0 ? batch.issue : null;
  const { data, error } = await createAdminClient().rpc("complete_recharge_card_purchase", {
    p_transaction_id: transactionId, p_provider_id: providerId, p_status: result.status,
    p_summary: reason ?? (issue ? "Recharge-card delivery requires investigation." : result.status === "successful" ? "Verified recharge-card batch stored." : result.status === "failed" ? "Provider confirmed non-delivery." : "Awaiting provider confirmation."),
    p_provider_reference: result.providerReference ?? null,
    p_encrypted_pins: batch.pins.length ? encryptPins(batch.pins) : null,
    p_pin_hashes: batch.pins.map((pin) => fingerprintRechargePin(expected.network, pin.pin)),
    p_delivery_issue: issue, p_actor_id: actorId ?? null,
  });
  if (error || !data?.[0]) throw new Error("Your order is saved, but delivery needs reconciliation. Open its receipt to check again.");
  return data[0] as { status: string; balance: number; refunded: boolean };
}

export async function purchaseRechargeCards(userId: string, rawInput: unknown) {
  const input = rechargePurchaseSchema.parse(rawInput);
  const client = createAdminClient();
  const requestFingerprint = digest({ network: input.network, denomination: input.denomination, quantity: input.quantity, cardName: input.cardName });
  const { data: previous, error: replayError } = await client.from("service_transactions").select("id,user_id,metadata").eq("idempotency_key", input.idempotencyKey).maybeSingle();
  if (replayError) throw new Error("Your previous purchase could not be checked. Retry with the same request.");
  if (previous) {
    if (previous.user_id !== userId || previous.metadata?.requestFingerprint !== requestFingerprint) throw new Error("This request key belongs to a different purchase.");
    return rechargePurchaseSnapshot(userId, previous.id, true);
  }
  const { quote, provider, providerCost, catalogueId } = await quoteRechargeCards(input);
  if (input.quoteId !== quote.quoteId) throw new Error("Recharge-card pricing changed. Refresh your quote before paying.");
  const policy = await evaluateCustomerPurchasePolicy(userId, "airtime", quote.payable);
  if (!policy.allowed) throw new Error(policy.reason);
  const productName = `${input.network.toUpperCase()} ₦${input.denomination.toLocaleString("en-NG")} recharge card${input.quantity > 1 ? ` × ${input.quantity}` : ""}`;
  const { data, error } = await client.rpc("customer_start_recharge_card_purchase", {
    p_user_id: userId, p_idempotency_key: input.idempotencyKey,
    p_reference: `FND-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().replaceAll("-", "").slice(0, 14).toUpperCase()}`,
    p_provider_id: provider.id, p_provider_cost: providerCost,
    p_snapshot: { ...quote, productName, cardName: input.cardName, requestFingerprint, provider: provider.slug, catalogueId }, p_limits: policy.limits,
  });
  if (error || !data?.[0]) throw new Error(error?.message ?? "Your wallet could not be charged.");
  const started = data[0] as { transaction_id: string; internal_reference: string; reused: boolean };
  if (started.reused) return rechargePurchaseSnapshot(userId, started.transaction_id, true);

  const began = Date.now();
  let result: PurchaseResult;
  try {
    const { error: dispatchError } = await client.from("provider_attempts").update({ outcome: "sent", request_redacted: { stage: "dispatched", network: input.network, denomination: input.denomination, quantity: input.quantity, faceValue: quote.faceValue } }).eq("transaction_id", started.transaction_id).eq("attempt_number", 1);
    if (dispatchError) throw new ProviderRequestError("The order was not dispatched.", true);
    result = await getVendor("maskawasub").purchase({ type: "airtime", mode: "epin", network: input.network, amount: quote.faceValue, quantity: quote.quantity, cardName: input.cardName, phone: "", reference: started.internal_reference });
  } catch (error) {
    const definitive = error instanceof ProviderRequestError && error.definitive;
    result = { status: definitive ? "failed" : "pending", reference: started.internal_reference, message: definitive ? "Provider rejected the order." : "Provider confirmation is outstanding." };
  }
  // Logging failures must never be interpreted as provider rejection or trigger a second purchase.
  await Promise.allSettled([
    client.from("provider_attempts").update({ outcome: result.status === "pending" ? "processing" : result.status, provider_reference: result.providerReference ?? null, latency_ms: Date.now() - began, response_redacted: { mode: "epin", status: result.status, receivedCount: result.pins?.length ?? 0 } }).eq("transaction_id", started.transaction_id).eq("attempt_number", 1),
    recordProviderApiCall({ requestId: randomUUID(), provider: provider.slug, transactionReference: started.internal_reference, method: "POST", endpoint: "maskawasub/rechargepin", response: { status: result.status, receivedCount: result.pins?.length ?? 0 }, latencyMs: Date.now() - began, outcome: result.status === "failed" ? "failed" : result.status === "pending" ? "timeout" : "successful" }),
  ]);
  await settleRechargeCardResult(started.transaction_id, provider.id, result, input);
  return rechargePurchaseSnapshot(userId, started.transaction_id);
}
