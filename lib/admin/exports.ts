import "server-only";

import { createAdminClient } from "../supabase/admin";

const bucket = "admin-exports";
const reportSources: Record<string, { table: string; select: string; order: string }> = {
  recharge_cards: { table: "recharge_card_operations", select: "internal_reference,provider_reference,network,denomination,quantity,pin_count,delivery_status,reconciliation_issue,face_value,amount,discount_amount,cashback_amount,provider_cost,cost_source,gross_margin,status,created_at,completed_at", order: "created_at" },
  transactions: { table: "service_transactions", select: "internal_reference,service_type,destination,amount,provider_cost,discount_amount,cashback_amount,gross_margin,status,provider_reference,created_at,completed_at", order: "created_at" },
  users: { table: "profiles", select: "id,full_name,created_at,updated_at", order: "created_at" },
  funding: { table: "wallet_funding_transactions", select: "merchant_reference,provider,amount,currency,status,created_at", order: "created_at" },
  providers: { table: "provider_registry", select: "name,slug,status,capabilities,priority,updated_at", order: "updated_at" },
  bundles: { table: "service_products", select: "name,service_type,network,provider_product_code,provider_cost,selling_price,cashback_amount,status,validity,updated_at", order: "updated_at" },
  reconciliation: { table: "reconciliation_runs", select: "run_type,status,internal_count,provider_count,matched_count,mismatch_count,created_at,completed_at", order: "created_at" },
  audit: { table: "admin_audit_logs", select: "actor_email,action,entity_type,entity_id,reason,created_at", order: "created_at" },
};

function csvCell(value: unknown) {
  const raw = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  const safe = typeof value === "string" && /^[\s]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function toCsv(rows: Record<string, unknown>[], columns: string[] = []) {
  const keys = [...new Set([...columns, ...rows.flatMap((row) => Object.keys(row))])];
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
  let rows: Record<string, unknown>[];
  if (job.report_type === "recharge_cards") {
    const filters = (job.filters ?? {}) as { since?: string; until?: string; status?: string; network?: string };
    const until = filters.until && !Number.isNaN(Date.parse(filters.until)) ? new Date(filters.until) : new Date();
    const since = filters.since && !Number.isNaN(Date.parse(filters.since)) ? new Date(filters.since) : new Date(until.getTime() - 30 * 86400000);
    if (since >= until) throw new Error("The report period is invalid.");
    rows = [];
    for (let offset = 0; ; offset += 1000) {
      let query = client.from(source.table).select(source.select).gte("created_at", since.toISOString()).lt("created_at", until.toISOString()).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 999);
      if (filters.status) query = query.eq("status", filters.status);
      if (filters.network) query = query.eq("network", filters.network);
      const { data, error } = await query;
      if (error) throw new Error("Recharge-card report could not be queried.");
      const page = (data ?? []) as unknown as Record<string, unknown>[];
      rows.push(...page);
      if (page.length < 1000) break;
      if (rows.length >= 50000) throw new Error("This report is too large. Choose a shorter period.");
    }
  } else {
    const { data, error: queryError } = await client.from(source.table).select(source.select).order(source.order, { ascending: false }).limit(50_000);
    if (queryError) throw new Error("Export source could not be queried.");
    rows = (data ?? []) as unknown as Record<string, unknown>[];
  }
  const content = job.format === "json" ? JSON.stringify(rows) : toCsv(rows, job.report_type === "recharge_cards" ? source.select.split(",") : []);
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
