import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "../supabase/admin";
import { generateDailyFinancialSnapshot } from "./reconciliation";
import { recordSystemHealth } from "./telemetry";
import { deliverNotification } from "./delivery";
import { createAdminExport } from "./exports";
import { requeryProviderTransaction } from "./providers";

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
  const threshold = new Date(Date.now() - 20 * 60_000).toISOString();
  const { data, error } = await client.from("service_transactions").select("id,internal_reference").in("status", ["initiated", "processing", "pending"]).lt("created_at", threshold).limit(500);
  if (error) throw error;
  for (const transaction of data ?? []) await enqueueAdminJob("provider.requery", { transactionId: transaction.id }, `provider.requery:${transaction.id}`);
  return { queued: data?.length ?? 0 };
}

async function runJob(job: Job) {
  if (job.job_type === "campaign.fanout") return fanOutCampaign(String(job.payload.campaignId));
  if (job.job_type === "financial.snapshot") return generateDailyFinancialSnapshot(String(job.payload.date ?? new Date().toISOString()));
  if (job.job_type === "transactions.sweep_pending") return sweepPendingTransactions();
  if (job.job_type === "health.record") return recordSystemHealth({ component: String(job.payload.component ?? "worker"), status: "operational", message: "Scheduled job worker completed." });
  if (job.job_type === "provider.requery") return requeryProviderTransaction(String(job.payload.transactionId));
  if (job.job_type === "webhook.replay") return requeryProviderTransaction(String(job.payload.transactionId));
  if (job.job_type === "notification.deliver") return deliverNotification(String(job.payload.outboxId));
  if (job.job_type === "report.export") return createAdminExport(String(job.payload.exportId));
  throw new Error(`Unknown admin job type: ${job.job_type}`);
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
