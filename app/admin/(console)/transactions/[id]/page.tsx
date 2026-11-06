import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPermission } from "../../../../../lib/admin/auth";
import { loadTransaction360 } from "../../../../../lib/admin/details";
import { AdminPageHeader } from "../../../../../components/admin/page-pattern";
import styles from "../../../admin.module.css";
import TransactionOperations from "./transaction-operations";

const money = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPermission("transactions.view");
  const data = await loadTransaction360((await params).id);
  if (!data) notFound();
  const transaction = data.transaction;

  return (
    <div className="w-full space-y-6 pb-16 font-sans text-slate-900">
      <div className="flex items-center gap-2">
        <Link
          href="/admin/transactions"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
        >
          ← Back to Transactions
        </Link>
      </div>

      <AdminPageHeader
        title={transaction.internal_reference}
        stats={[
          { label: "Status", value: transaction.status, tone: transaction.status === "succeeded" ? "success" : "warning" },
          { label: "Amount", value: money(Number(transaction.amount)) },
          { label: "Provider Cost", value: money(Number(transaction.provider_cost)) },
          { label: "Margin", value: money(Number(transaction.gross_margin)) },
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <article className="rounded-[8px] border border-slate-200/70 bg-white p-5 shadow-xs">
          <h2 className="text-[14px] font-semibold text-slate-950 mb-3 border-b border-zinc-100 pb-2">
            Status Timeline
          </h2>
          <div className="space-y-3">
            {data.events.map((event) => (
              <div key={event.id} className="flex items-center justify-between text-[12px] border-b border-zinc-50 pb-2">
                <div>
                  <span className="font-semibold text-zinc-800 block">{event.summary}</span>
                  <small className="text-[11px] text-zinc-400">
                    {new Date(event.created_at).toLocaleString("en-NG")}
                  </small>
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">
                  {event.to_status || event.event_type}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[8px] border border-slate-200/70 bg-white p-5 shadow-xs">
          <h2 className="text-[14px] font-semibold text-slate-950 mb-3 border-b border-zinc-100 pb-2">
            Provider Attempts
          </h2>
          <div className="space-y-3">
            {data.attempts.map((attempt) => (
              <div key={attempt.id} className="flex items-center justify-between text-[12px] border-b border-zinc-50 pb-2">
                <div>
                  <span className="font-semibold text-zinc-800 block">
                    Attempt #{attempt.attempt_number}
                  </span>
                  <small className="text-[11px] text-zinc-400">
                    HTTP {attempt.http_status || "—"} · {attempt.latency_ms || "—"} ms
                  </small>
                </div>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {attempt.outcome}
                </span>
              </div>
            ))}
          </div>
        </article>

        <div className="md:col-span-2">
          <TransactionOperations transactionId={transaction.id} status={transaction.status} />
        </div>

        <article className="md:col-span-2 rounded-[8px] border border-slate-200/70 bg-white p-5 shadow-xs">
          <h2 className="text-[14px] font-semibold text-slate-950 mb-3 border-b border-zinc-100 pb-2">
            Refunds &amp; Disputes
          </h2>
          <div className="space-y-3">
            {[...data.refunds, ...data.disputes].length === 0 ? (
              <p className="text-[12px] text-zinc-400">No refunds or active disputes for this transaction.</p>
            ) : (
              [...data.refunds, ...data.disputes].map((item) => (
                <div key={item.id} className="flex items-center justify-between text-[12px] border-b border-zinc-50 pb-2">
                  <div>
                    <span className="font-semibold text-zinc-800 block">
                      {"reason" in item ? item.reason : item.dispute_number}
                    </span>
                    <small className="text-[11px] text-zinc-400">
                      {new Date(item.created_at).toLocaleString("en-NG")}
                    </small>
                  </div>
                  <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    {item.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
