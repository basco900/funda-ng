import "server-only";

import { randomUUID } from "node:crypto";
import { getVendor } from "../test-engine/vendors";
import type { VendorId } from "../test-engine/types";
import { createAdminClient } from "../supabase/admin";
import { recordProviderApiCall } from "./telemetry";

const providerIds = new Set<VendorId>(["vtpass", "smeplug", "gladtidings", "pairgate"]);

export async function requeryProviderTransaction(transactionId: string) {
  const client = createAdminClient();
  const { data: transaction, error } = await client
    .from("service_transactions")
    .select("id,internal_reference,provider_reference,status,provider_id,provider:provider_registry(slug)")
    .eq("id", transactionId)
    .single();
  if (error || !transaction) throw new Error("Service transaction was not found.");
  if (["successful", "reversed", "refunded", "cancelled"].includes(transaction.status)) return { skipped: true, status: transaction.status };
  const providerSlug = (transaction.provider as { slug?: string } | null)?.slug;
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
    await client.rpc("admin_transition_service_transaction", {
      p_transaction_id: transaction.id,
      p_to_status: nextStatus,
      p_summary: `Provider requery: ${result.message}`.slice(0, 1000),
      p_actor_type: "system",
      p_actor_id: `worker:${providerSlug}`,
      p_metadata: { providerReference: result.providerReference ?? null, requeryReference: reference },
    });
    await recordProviderApiCall({ requestId, provider: providerSlug, transactionReference: transaction.internal_reference, method: "POST", endpoint: `${providerSlug}/requery`, response: result.raw, latencyMs: Date.now() - started, outcome: "successful" });
    return { skipped: false, status: nextStatus, provider: providerSlug };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Provider requery failed.";
    await recordProviderApiCall({ requestId, provider: providerSlug, transactionReference: transaction.internal_reference, method: "POST", endpoint: `${providerSlug}/requery`, response: { error: message }, latencyMs: Date.now() - started, outcome: "failed" });
    throw new Error(message);
  }
}
