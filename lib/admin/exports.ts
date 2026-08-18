import "server-only";

import { createAdminClient } from "../supabase/admin";

const bucket = "admin-exports";
const reportSources: Record<string, { table: string; select: string; order: string }> = {
  transactions: { table: "service_transactions", select: "internal_reference,service_type,destination,amount,status,provider_reference,created_at", order: "created_at" },
  users: { table: "profiles", select: "id,full_name,created_at,updated_at", order: "created_at" },
  funding: { table: "wallet_funding_transactions", select: "merchant_reference,provider,amount,currency,status,created_at", order: "created_at" },
  providers: { table: "provider_registry", select: "name,slug,status,capabilities,priority,updated_at", order: "updated_at" },
  reconciliation: { table: "reconciliation_runs", select: "run_type,status,internal_count,provider_count,matched_count,mismatch_count,created_at,completed_at", order: "created_at" },
  audit: { table: "admin_audit_logs", select: "actor_email,action,entity_type,entity_id,reason,created_at", order: "created_at" },
};

function csvCell(value: unknown) {
  const raw = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${raw.replaceAll('"', '""')}"`;
}

function toCsv(rows: Record<string, unknown>[]) {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return `${keys.map(csvCell).join(",")}\n${rows.map((row) => keys.map((key) => csvCell(row[key])).join(",")).join("\n")}`;
}

export async function createAdminExport(exportId: string) {
  const client = createAdminClient();
  const { data: job, error } = await client.from("admin_export_jobs").select("id,admin_user_id,report_type,format,filters,status").eq("id", exportId).single();
  if (error || !job) throw new Error("Export job was not found.");
  if (job.status === "completed") return { skipped: true };
  const source = reportSources[job.report_type];
  if (!source) throw new Error("This report type is not approved for exports.");
  if (job.format === "xlsx") throw new Error("XLSX export is not enabled yet; choose CSV or JSON.");
  await client.from("admin_export_jobs").update({ status: "processing", failure_reason: null }).eq("id", job.id);
  const { data, error: queryError } = await client.from(source.table).select(source.select).order(source.order, { ascending: false }).limit(50_000);
  if (queryError) throw new Error("Export source could not be queried.");
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const content = job.format === "json" ? JSON.stringify(rows) : toCsv(rows);
  const extension = job.format === "json" ? "json" : "csv";
  const path = `${job.admin_user_id}/${job.id}.${extension}`;
  const createResult = await client.storage.createBucket(bucket, { public: false, fileSizeLimit: "20MB" });
  if (createResult.error && !/already exists/i.test(createResult.error.message)) throw new Error("Export storage could not be initialized.");
  const upload = await client.storage.from(bucket).upload(path, new Blob([content], { type: job.format === "json" ? "application/json" : "text/csv;charset=utf-8" }), { upsert: true, contentType: job.format === "json" ? "application/json" : "text/csv; charset=utf-8" });
  if (upload.error) throw new Error("Export file could not be stored.");
  const { error: completeError } = await client.from("admin_export_jobs").update({ status: "completed", storage_path: path, row_count: rows.length, completed_at: new Date().toISOString(), failure_reason: null }).eq("id", job.id);
  if (completeError) throw new Error("Export finished but its record could not be updated.");
  return { rows: rows.length, path };
}

export async function getAdminExportDownload(exportId: string, adminUserId: string, isSuperAdmin: boolean) {
  const client = createAdminClient();
  const { data: job, error } = await client.from("admin_export_jobs").select("admin_user_id,storage_path,status,expires_at").eq("id", exportId).single();
  if (error || !job || !job.storage_path || job.status !== "completed") throw new Error("This export is not ready for download.");
  if (!isSuperAdmin && job.admin_user_id !== adminUserId) throw new Error("You can only download your own exports.");
  if (job.expires_at && new Date(job.expires_at) <= new Date()) throw new Error("This export has expired.");
  const { data, error: signedError } = await client.storage.from(bucket).createSignedUrl(job.storage_path, 60);
  if (signedError || !data?.signedUrl) throw new Error("A secure export link could not be created.");
  return data.signedUrl;
}
