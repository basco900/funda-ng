import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "../supabase/admin";
import { generateDailyFinancialSnapshot } from "./reconciliation";
import { recordSystemHealth } from "./telemetry";
import { deliverNotification } from "./delivery";
import { createAdminExport } from "./exports";
import { requeryProviderTransaction } from "./providers";
import { rechargePurchaseSnapshot } from "../services/recharge-cards";
import { dispatchPurchaseReceipt } from "../services/receipts";
import { decryptPins, encryptPins, fingerprintRechargePin, pinVaultConfigured } from "../security/pin-vault";
import { rechargeSelectionSchema, validateRechargePins } from "../recharge-cards";
import type { RechargePinItem } from "../test-engine/types";
import { reconcilePendingCheckouts, sweepPendingConnectedAccounts } from "../payments/bachs";
import { refreshBrand, refreshDueBrands } from "../coupons/refresh";

type Job = { id: string; job_type: string; payload: Record<string, unknown> };

export async function enqueueAdminJob(jobType: string, payload: Record<string, unknown>, idempotencyKey?: string, runAt?: string) {
  const client = createAdminClient();
  const key = idempotencyKey ?? createHash("sha256").update(`${jobType}:${JSON.stringify(payload)}`).digest("hex");
  const { data, error } = await client.from("admin_job_queue").upsert({ job_type: jobType, payload, idempotency_key: key, run_at: runAt ?? new Date().toISOString() }, { onConflict: "idempotency_key", ignoreDuplicates: true }).select("id").maybeSingle();
  if (error) throw new Error("Administrative job could not be queued.");
  return data?.id ?? null;
}

async function fanOutCampaign(campaignId: string) {
  const client = createAdminClient();
  const { data: campaign, error } = await client.from("message_campaigns").select("id,channel,audience,status,throttle_per_minute").eq("id", campaignId).single();
  if (error || !campaign) throw new Error("Message campaign not found.");
  if (!["scheduled", "sending"].includes(campaign.status)) return { deliveries: 0 };
  const audience = campaign.audience as { type?: string; userIds?: string[]; segmentId?: string };
  let userIds: string[] = [];
  if (audience.type === "specific" && Array.isArray(audience.userIds)) userIds = audience.userIds.slice(0, 50_000);
  else if (audience.type === "segment" && audience.segmentId) {
    const { data } = await client.from("user_segment_memberships").select("user_id").eq("segment_id", audience.segmentId).limit(50_000);
    userIds = (data ?? []).map((row) => row.user_id);
  } else {
    const { data } = await client.from("profiles").select("id").limit(50_000);
    userIds = (data ?? []).map((row) => row.id);
  }
  const deliveries = userIds.map((userId) => ({ campaign_id: campaign.id, user_id: userId, channel: campaign.channel, status: "queued" }));
  for (let index = 0; index < deliveries.length; index += 1000) {
    const { data: inserted, error: insertError } = await client.from("message_deliveries").insert(deliveries.slice(index, index + 1000)).select("id,channel");
    if (insertError) throw insertError;
    const outbox = (inserted ?? []).map((row) => ({ message_delivery_id: row.id, channel: row.channel, payload: { campaignId: campaign.id } }));
    if (outbox.length) {
      const { data: created, error: outboxError } = await client.from("notification_outbox").insert(outbox).select("id");
      if (outboxError) throw outboxError;
      for (const item of created ?? []) await enqueueAdminJob("notification.deliver", { outboxId: item.id }, `notification.deliver:${item.id}`);
    }
  }
  await client.from("message_campaigns").update({ status: "sending" }).eq("id", campaign.id);
  return { deliveries: deliveries.length };
}

async function sweepPendingTransactions() {
  const client = createAdminClient();
  const threshold = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data, error } = await client.from("service_transactions").select("id,internal_reference").in("status", ["initiated", "processing", "pending"]).lt("created_at", threshold).limit(500);
  if (error) throw error;
  for (const transaction of data ?? []) await enqueueAdminJob("provider.requery", { transactionId: transaction.id }, `provider.requery:${transaction.id}`);
  return { queued: data?.length ?? 0 };
}

async function runJob(job: Job) {
  if (job.job_type === "recharge.backfill_claims") {
    const client = createAdminClient();
    const { data: rows, error } = await client.from("service_transactions").select("id,metadata,status").eq("metadata->>mode", "epin").is("metadata->>pinClaimsVersion", null).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(50);
    if (error) throw new Error("Historical recharge-card inventory could not be loaded.");
    for (const row of rows ?? []) {
      const meta = row.metadata as Record<string, unknown>;
      if (!pinVaultConfigured()) throw new Error("Configure the original PIN vault key before reconciling recharge cards.");
      const stored = decryptPins(meta.pins_encrypted);
      if (meta.pins_encrypted && !stored) throw new Error("A historical PIN batch could not be decrypted. Restore its original vault key before enabling purchases.");
      const pins = stored ?? (Array.isArray(meta.pins) ? meta.pins as RechargePinItem[] : []);
      const expected = rechargeSelectionSchema.parse({ network: meta.network, denomination: Number(meta.unitAmount ?? pins[0]?.amount), quantity: Number(meta.quantity ?? (pins.length || 1)) });
      const batch = validateRechargePins(pins, expected);
      const { error: saveError } = await client.rpc("register_legacy_recharge_pins", { p_transaction_id: row.id, p_encrypted_pins: batch.pins.length ? encryptPins(batch.pins) : null, p_pin_hashes: batch.pins.map((pin) => fingerprintRechargePin(expected.network, pin.pin)), p_issue: ["failed", "refunded", "reversed", "cancelled"].includes(row.status) && batch.pins.length === 0 ? null : batch.issue });
      if (saveError) throw new Error("Historical PIN ownership could not be persisted.");
    }
    if (rows?.length === 50) await enqueueAdminJob("recharge.backfill_claims", {}, `recharge.backfill_claims:${randomUUID()}`);
    return { processed: rows?.length ?? 0 };
  }
  if (job.job_type === "purchase.receipt") {
    const client = createAdminClient();
    const { data: tx, error } = await client.from("service_transactions").select("user_id,status").eq("id", String(job.payload.transactionId)).maybeSingle();
    if (error || !tx) throw new Error("Receipt order not found.");
    if (job.payload.status !== tx.status || !["successful", "pending", "failed"].includes(tx.status)) return { skipped: true };
    const purchase = await rechargePurchaseSnapshot(tx.user_id, String(job.payload.transactionId));
    await dispatchPurchaseReceipt({ userId: tx.user_id, transactionId: purchase.transactionId, reference: purchase.reference, providerReference: purchase.providerReference, productName: purchase.productName, amount: purchase.amount, originalAmount: purchase.faceValue, discountAmount: purchase.discount, cashback: purchase.cashback, destination: purchase.destination, network: purchase.network, serviceType: "airtime", mode: "epin", pinCount: purchase.pinCount, status: tx.status as "successful" | "pending" | "failed", refunded: purchase.refunded, message: purchase.message, balance: purchase.balance }, { waitForDelivery: true });
    return { delivered: true };
  }
  if (job.job_type === "campaign.fanout") return fanOutCampaign(String(job.payload.campaignId));
  if (job.job_type === "financial.snapshot") return generateDailyFinancialSnapshot(String(job.payload.date ?? new Date().toISOString()));
  if (job.job_type === "transactions.sweep_pending") return sweepPendingTransactions();
  if (job.job_type === "health.record") return recordSystemHealth({ component: String(job.payload.component ?? "worker"), status: "operational", message: "Scheduled job worker completed." });
  if (job.job_type === "provider.requery") return requeryProviderTransaction(String(job.payload.transactionId));
  if (job.job_type === "webhook.replay") return requeryProviderTransaction(String(job.payload.transactionId));
  if (job.job_type === "notification.deliver") return deliverNotification(String(job.payload.outboxId));
  if (job.job_type === "payments.reconcile_checkouts") return reconcilePendingCheckouts();
  if (job.job_type === "payments.sweep_connected_accounts") return sweepPendingConnectedAccounts();
  if (job.job_type === "coupons.refresh_due") return refreshDueBrands();
  if (job.job_type === "coupons.refresh_brand") return refreshBrand(String(job.payload.brandId), job.payload.trigger === "manual" ? "manual" : "schedule");
  if (job.job_type === "report.export") return createAdminExport(String(job.payload.exportId));
  throw new Error(`Unknown admin job type: ${job.job_type}`);
}

// Recurring money-safety jobs. Each worker run enqueues them once per time bucket, so
// whatever schedule calls /api/admin/jobs/run (Coolify scheduled task) drives them.
const recurringJobs: Array<{ jobType: string; everyMinutes: number }> = [
  { jobType: "transactions.sweep_pending", everyMinutes: 10 },
  { jobType: "payments.reconcile_checkouts", everyMinutes: 10 },
  { jobType: "payments.sweep_connected_accounts", everyMinutes: 5 },
  // Coupon finder: refreshes whichever brands are due (tiered: hot every 2 days, regular weekly, long tail every 3 weeks).
  { jobType: "coupons.refresh_due", everyMinutes: 60 },
];

export async function enqueueRecurringJobs() {
  const now = Date.now();
  for (const { jobType, everyMinutes } of recurringJobs) {
    const bucket = Math.floor(now / (everyMinutes * 60_000));
    await enqueueAdminJob(jobType, {}, `${jobType}:${bucket}`);
  }
}

export async function runAdminJobs(workerId = `funda-worker-${randomUUID().slice(0, 8)}`, limit = 20) {
  const client = createAdminClient();
  const { data, error } = await client.rpc("admin_claim_jobs", { p_worker_id: workerId, p_limit: limit });
  if (error) throw new Error("Jobs could not be claimed.");
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const job of (data ?? []) as Job[]) {
    try {
      await runJob(job);
      await client.rpc("admin_finish_job", { p_job_id: job.id, p_worker_id: workerId, p_success: true, p_error: null, p_retry_at: null });
      results.push({ id: job.id, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Job failed.";
      await client.rpc("admin_finish_job", { p_job_id: job.id, p_worker_id: workerId, p_success: false, p_error: message, p_retry_at: new Date(Date.now() + 5 * 60_000).toISOString() });
      results.push({ id: job.id, ok: false, error: message });
    }
  }
  return { workerId, claimed: results.length, results };
}
