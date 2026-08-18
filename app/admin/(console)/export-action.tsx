"use client";

import { useState, useTransition } from "react";
import { queueAdminExport } from "./actions";
import styles from "../admin.module.css";

const reportForSource: Record<string, string> = { service_transactions: "transactions", profiles: "users", wallet_funding_transactions: "funding", provider_registry: "providers", reconciliation_runs: "reconciliation", admin_audit_logs: "audit" };

export default function ExportAction({ source }: { source: string }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const reportType = reportForSource[source] ?? "transactions";
  return <span><button type="button" className={styles.secondaryButton} disabled={pending} onClick={() => startTransition(async () => { const result = await queueAdminExport({ reportType, format: "csv", filters: {} }); setMessage(result.ok ? "Export queued. Refresh Reports shortly for the secure download." : result.message); })}>{pending ? "Queuing…" : "Export CSV"}</button>{message ? <small>{message}</small> : null}</span>;
}
