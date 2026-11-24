"use client";

import { useState, useTransition } from "react";
import { button } from "../../../components/admin/kit";
import { queueAdminExport } from "./actions";
import AdminIcon from "./admin-icon";

const reportForSource: Record<string, string> = { recharge_card_operations: "recharge_cards", service_transactions: "transactions", service_products: "bundles", profiles: "users", wallet_funding_transactions: "funding", provider_registry: "providers", reconciliation_runs: "reconciliation", admin_audit_logs: "audit" };

export default function ExportAction({ source }: { source: string }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const reportType = reportForSource[source] ?? "transactions";
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className={button.secondary}
        disabled={pending}
        onClick={() => startTransition(async () => {
          const result = await queueAdminExport({ reportType, format: "csv", filters: {} });
          setMessage(result.ok ? "Export queued. Refresh Reports shortly for the secure download." : result.message);
        })}
      >
        <AdminIcon name="download" />
        {pending ? "Queuing…" : "Export CSV"}
      </button>
      {message ? <small className="text-[12px] text-zinc-500">{message}</small> : null}
    </span>
  );
}
