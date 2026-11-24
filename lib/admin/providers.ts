import "server-only";

import { randomUUID } from "node:crypto";
import { getVendor } from "../test-engine/vendors";
import type { VendorId } from "../test-engine/types";
import { createAdminClient } from "../supabase/admin";
import { recordProviderApiCall } from "./telemetry";
import { dispatchPurchaseReceipt } from "../services/receipts";
import { recordCouponRedemption } from "../services/routing";
import { recordServiceBeneficiary } from "../services/beneficiaries";
import { rechargePurchaseSnapshot } from "../services/recharge-cards";
import { refreshProductHealth } from "../services/plan-health";

const providerIds = new Set<VendorId>(["vtpass", "smeplug", "pairgate", "maskawasub", "absvendor"]);

export async function requeryProviderTransaction(transactionId: string) {
  const client = createAdminClient();
  const { data: transaction, error } = await client
    .from("service_transactions")
    .select("id,user_id,product_id,internal_reference,provider_reference,service_type,destination,amount,cashback_amount,status,metadata,provider_id,provider:provider_registry(slug),product:service_products(name,network)")
    .eq("id", transactionId)
    .single();
  if (error || !transaction) throw new Error("Service transaction was not found.");
  if (["successful", "failed", "reversed", "refunded", "cancelled"].includes(transaction.status)) {
    return { skipped: true, status: transaction.status };
  }
  if (transaction.metadata?.mode === "epin") {
    // No verified PIN-recovery endpoint exists in the current adapter. Never
    // query /data/ or repeat generation to recover an uncertain card purchase.
    const { error: recoveryError } = await client.rpc("complete_recharge_card_purchase", {
      p_transaction_id: transaction.id, p_provider_id: transaction.provider_id,
      p_status: "pending", p_summary: "Provider PIN export or confirmed non-delivery is required for recovery.",
      p_provider_reference: transaction.provider_reference,
      p_delivery_issue: transaction.metadata.deliveryStatus === "awaiting_provider" ? "manual_recovery" : transaction.metadata.deliveryStatus ?? "manual_recovery",
    });
    if (recoveryError) throw new Error("Recharge-card recovery could not be recorded.");
    const snapshot = await rechargePurchaseSnapshot(transaction.user_id, transaction.id);
    return { skipped: false, status: snapshot.status, manualRecovery: true };
  }
  const providerSlug = (Array.isArray(transaction.provider) ? transaction.provider[0]?.slug : (transaction.provider as { slug?: string } | null)?.slug);
  if (!transaction.provider_id || !providerSlug || !providerIds.has(providerSlug as VendorId)) throw new Error("This transaction's provider does not support safe requery yet.");
  const vendor = getVendor(providerSlug as VendorId);
  if (!vendor.isConfigured()) throw new Error(`${providerSlug} is not configured for transaction requery.`);

  const started = Date.now();
  const requestId = randomUUID();
  const reference = transaction.provider_reference || transaction.internal_reference;
  try {
    const result = await vendor.requery(reference);
    const nextStatus = result.status === "successful" ? "successful" : result.status === "failed" ? "failed" : "pending";
    const { data: lastAttempt } = await client.from("provider_attempts").select("attempt_number").eq("transaction_id", transaction.id).order("attempt_number", { ascending: false }).limit(1).maybeSingle();
    await client.from("provider_attempts").insert({
      transaction_id: transaction.id,
      provider_id: transaction.provider_id,
      attempt_number: Number(lastAttempt?.attempt_number ?? 0) + 1,
      response_redacted: { message: result.message, providerReference: result.providerReference ?? null },
      latency_ms: Date.now() - started,
      outcome: result.status === "successful" ? "successful" : result.status === "failed" ? "failed" : "processing",
      provider_reference: result.providerReference ?? null,
    });
    // Settle through the customer RPC so a failed outcome refunds the wallet (and success pays cashback).
    const settlement = await client.rpc("customer_settle_service_purchase", {
      p_user_id: transaction.user_id,
      p_transaction_id: transaction.id,
      p_status: nextStatus,
      p_summary: `Provider requery: ${result.message}`.slice(0, 1000),
      p_provider_reference: result.providerReference ?? null,
      p_metadata: { provider: providerSlug, actor: `worker:${providerSlug}`, requeryReference: reference },
    });
    if (settlement.error) throw new Error(`Requery settlement failed: ${settlement.error.message}`);
    await recordProviderApiCall({ requestId, provider: providerSlug, transactionReference: transaction.internal_reference, method: "POST", endpoint: `${providerSlug}/requery`, response: result.raw, latencyMs: Date.now() - started, outcome: "successful" });

    const settled = (settlement.data?.[0] ?? {}) as { balance?: number; refunded?: boolean };
    const meta = (transaction.metadata ?? {}) as {
      productName?: string;
      network?: string;
      couponCode?: string | null;
      discountAmount?: number;
      listPrice?: number;
    };
    const productRel = Array.isArray(transaction.product) ? transaction.product[0] : transaction.product;
    const productName = meta.productName || productRel?.name || `${transaction.service_type.toUpperCase()} Purchase`;
    const network = meta.network || productRel?.network || undefined;

    if (nextStatus === "successful") {
      if (meta.couponCode) {
        await recordCouponRedemption(meta.couponCode);
      }
      if ((transaction.service_type === "data" || transaction.service_type === "airtime") && network) {
        void recordServiceBeneficiary({
          userId: transaction.user_id,
          serviceType: transaction.service_type,
          recipient: transaction.destination,
          networkOrDisco: network,
          label: `${network.toUpperCase()} ${transaction.service_type === "data" ? "Data" : "Airtime"}`,
        });
      }
    }

    if (nextStatus !== "pending") {
      if (transaction.product_id) {
        await refreshProductHealth(String(transaction.product_id), {
          outcome: nextStatus,
          error: nextStatus === "failed" ? result.message : null,
        }).catch(() => {});
      }
      await dispatchPurchaseReceipt({
        userId: transaction.user_id,
        transactionId: transaction.id,
        reference: transaction.internal_reference,
        providerReference: result.providerReference ?? transaction.provider_reference ?? null,
        productName,
        amount: Number(transaction.amount),
        originalAmount: meta.listPrice,
        discountAmount: meta.discountAmount,
        couponCode: meta.couponCode ?? null,
        cashback: nextStatus === "successful" ? Number(transaction.cashback_amount ?? 0) : 0,
        destination: transaction.destination,
        network,
        serviceType: transaction.service_type,
        token: result.token ?? null,
        units: result.units ?? null,
        status: nextStatus,
        message: result.message,
        balance: Number(settled.balance ?? 0),
      });
    }

    return {
      skipped: false,
      status: nextStatus,
      provider: providerSlug,
      message: result.message,
      balance: settled.balance !== undefined ? Number(settled.balance) : undefined,
      refunded: Boolean(settled.refunded),
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Provider requery failed.";
    await recordProviderApiCall({ requestId, provider: providerSlug, transactionReference: transaction.internal_reference, method: "POST", endpoint: `${providerSlug}/requery`, response: { error: message }, latencyMs: Date.now() - started, outcome: "failed" });
    throw new Error(message);
  }
}
