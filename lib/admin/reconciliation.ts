import "server-only";

import { z } from "zod";
import { createAdminClient } from "../supabase/admin";

const externalRecordSchema = z.object({ reference: z.string().trim().min(1).max(200), amount: z.coerce.number().nonnegative(), status: z.string().trim().min(1).max(80) });

export async function executeReconciliationRun(runId: string, externalInput: unknown) {
  const externalRecords = z.array(externalRecordSchema).max(50_000).parse(externalInput);
  const client = createAdminClient();
  const { data: run, error: runError } = await client.from("reconciliation_runs").select("*").eq("id", runId).single();
  if (runError || !run) throw new Error("Reconciliation run not found.");
  if (!["queued", "failed"].includes(run.status)) throw new Error("This reconciliation run cannot be started again.");

  const { error: startError } = await client.from("reconciliation_runs").update({ status: "running", started_at: new Date().toISOString() }).eq("id", runId);
  if (startError) throw new Error("Reconciliation could not start.");

  try {
    let internalQuery = client.from("service_transactions").select("internal_reference,provider_reference,amount,status").gte("created_at", run.period_start).lt("created_at", run.period_end).limit(50_000);
    if (run.provider_id) internalQuery = internalQuery.eq("provider_id", run.provider_id);
    const { data: internalRecords, error } = await internalQuery;
    if (error) throw error;

    const externalByReference = new Map<string, Array<(typeof externalRecords)[number]>>();
    for (const record of externalRecords) externalByReference.set(record.reference, [...(externalByReference.get(record.reference) ?? []), record]);
    const items: Array<Record<string, unknown>> = [];
    let matched = 0;
    const usedExternal = new Set<string>();

    for (const internal of internalRecords ?? []) {
      const reference = internal.provider_reference || internal.internal_reference;
      const candidates = externalByReference.get(reference) ?? [];
      const external = candidates[0];
      if (!external) {
        items.push({ run_id: runId, internal_reference: internal.internal_reference, internal_amount: internal.amount, internal_status: internal.status, match_status: "missing_external" });
        continue;
      }
      if (candidates.length > 1) {
        items.push({ run_id: runId, internal_reference: internal.internal_reference, external_reference: external.reference, internal_amount: internal.amount, external_amount: external.amount, internal_status: internal.status, external_status: external.status, match_status: "duplicate" });
        usedExternal.add(reference);
        continue;
      }
      usedExternal.add(reference);
      const amountMatches = Number(internal.amount) === Number(external.amount);
      const statusMatches = String(internal.status).toLowerCase() === external.status.toLowerCase();
      const matchStatus = !amountMatches ? "amount_mismatch" : !statusMatches ? "status_mismatch" : "matched";
      if (matchStatus === "matched") matched += 1;
      items.push({ run_id: runId, internal_reference: internal.internal_reference, external_reference: external.reference, internal_amount: internal.amount, external_amount: external.amount, internal_status: internal.status, external_status: external.status, match_status: matchStatus, resolution_status: matchStatus === "matched" ? "resolved" : "unresolved", resolved_at: matchStatus === "matched" ? new Date().toISOString() : null });
    }
    for (const external of externalRecords) if (!usedExternal.has(external.reference)) items.push({ run_id: runId, external_reference: external.reference, external_amount: external.amount, external_status: external.status, match_status: "missing_internal" });

    await client.from("reconciliation_items").delete().eq("run_id", runId);
    for (let index = 0; index < items.length; index += 1000) {
      const { error: insertError } = await client.from("reconciliation_items").insert(items.slice(index, index + 1000));
      if (insertError) throw insertError;
    }
    const internalValue = (internalRecords ?? []).reduce((sum, record) => sum + Number(record.amount), 0);
    const providerValue = externalRecords.reduce((sum, record) => sum + record.amount, 0);
    const { error: completeError } = await client.from("reconciliation_runs").update({ status: "completed", internal_count: internalRecords?.length ?? 0, provider_count: externalRecords.length, matched_count: matched, mismatch_count: items.length - matched, internal_value: internalValue, provider_value: providerValue, completed_at: new Date().toISOString() }).eq("id", runId);
    if (completeError) throw completeError;
    return { runId, internalCount: internalRecords?.length ?? 0, providerCount: externalRecords.length, matched, mismatches: items.length - matched, internalValue, providerValue };
  } catch (error) {
    await client.from("reconciliation_runs").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", runId);
    throw error;
  }
}

export async function generateDailyFinancialSnapshot(dateInput: string | Date) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.valueOf())) throw new Error("Snapshot date is invalid.");
  const start = new Date(date); start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86_400_000);
  const snapshotDate = start.toISOString().slice(0, 10);
  const client = createAdminClient();
  const { data: existing } = await client.from("daily_financial_snapshots").select("*").eq("snapshot_date", snapshotDate).maybeSingle();
  if (existing) return existing;
  const [{ data: transactions, error }, { data: refunds }] = await Promise.all([
    client.from("service_transactions").select("amount,provider_cost,platform_fee,discount_amount,cashback_amount,status").in("status", ["successful", "refunded"]).gte("created_at", start.toISOString()).lt("created_at", end.toISOString()).limit(50_000),
    client.from("refund_requests").select("amount").eq("status", "refunded").gte("resolved_at", start.toISOString()).lt("resolved_at", end.toISOString()).limit(50_000),
  ]);
  if (error) throw error;
  const rows = transactions ?? [];
  const gross = rows.reduce((sum, row) => sum + Number(row.amount), 0);
  const providerCost = rows.reduce((sum, row) => sum + Number(row.provider_cost), 0);
  const fees = rows.reduce((sum, row) => sum + Number(row.platform_fee), 0);
  const discounts = rows.reduce((sum, row) => sum + Number(row.discount_amount), 0);
  const cashback = rows.reduce((sum, row) => sum + Number(row.cashback_amount), 0);
  const refundValue = (refunds ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const record = { snapshot_date: snapshotDate, gross_transaction_value: gross, provider_cost: providerCost, fees, discount_expense: discounts, cashback_expense: cashback, refund_value: refundValue, net_revenue: gross + fees - discounts - cashback - refundValue, gross_profit: gross + fees - providerCost - discounts - cashback - refundValue, transaction_count: rows.length, successful_count: rows.filter((row) => row.status === "successful").length };
  const { data, error: insertError } = await client.from("daily_financial_snapshots").insert(record).select("*").single();
  if (insertError) throw insertError;
  return data;
}
