import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireAdminPermission } from "../../../../../lib/admin/auth";
import { loadTransaction360 } from "../../../../../lib/admin/details";
import { card, PageHeader, SectionTitle, StatBand, StatusBadge } from "../../../../../components/admin/kit";
import { cn } from "../../../../../lib/utils";
import AdminIcon from "../../admin-icon";
import TransactionOperations from "./transaction-operations";
import RechargeCardRecovery from "@/components/admin/recharge-card-recovery";

const money = (value: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
const dateTime = (value: string) =>
  new Date(value).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", second: "2-digit" });

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminPermission("transactions.view");
  const data = await loadTransaction360((await params).id);
  if (!data) notFound();

  const transaction = data.transaction;
  const margin = Number(transaction.gross_margin ?? 0);
  const cashback = Number(transaction.cashback_amount ?? 0);
  const metadata = (transaction.metadata ?? {}) as Record<string, unknown>;
  const product = pickOne(transaction.product as { name?: string; network?: string; provider_product_code?: string } | null);
  const provider = pickOne(transaction.provider as { name?: string; slug?: string; status?: string } | null);
  const profile = pickOne(transaction.profile as { full_name?: string | null } | null);

  const originalAmount = Number(metadata.faceValue ?? metadata.originalAmount ?? metadata.listPrice ?? transaction.amount);
  const discountAmount = Number(metadata.mode === "epin" ? transaction.discount_amount : metadata.discountAmount ?? 0);
  const couponCode = typeof metadata.couponCode === "string" ? metadata.couponCode : null;
  const failureReason = typeof transaction.failure_reason === "string" ? transaction.failure_reason : null;

  const claims = [
    ...data.refunds.map((item) => ({ ...item, title: item.reason || "Refund", kind: "Refund" })),
    ...data.disputes.map((item) => ({ ...item, title: item.dispute_number, kind: "Dispute" })),
  ];

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/admin/transactions" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline">
          <AdminIcon name="arrowLeft" className="size-3.5" />
          Transactions
        </Link>
        {transaction.service_type === "data" ? (
          <Link href="/admin/products/data-bundles" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-zinc-500 hover:text-primary">
            Data Bundles
            <AdminIcon name="arrowUpRight" className="size-3.5" />
          </Link>
        ) : null}
      </div>

      <PageHeader
        title={<span className="font-mono tracking-[-0.03em]">{transaction.internal_reference}</span>}
        actions={<StatusBadge value={transaction.status} />}
      />

      <StatBand
        stats={[
          { label: "Charged", value: money(Number(transaction.amount)), icon: "wallet", tone: "primary" },
          { label: "Provider cost", value: money(Number(transaction.provider_cost ?? 0)), icon: "provider", tone: "neutral" },
          { label: "Cashback", value: money(cashback), icon: "gift", tone: cashback > 0 ? "amber" : "neutral" },
          { label: "Net margin", value: money(margin), icon: margin < 0 ? "trendDown" : "trendUp", tone: margin < 0 ? "rose" : "emerald" },
        ]}
      />

      {/* Order & Pricing Context */}
      <section className={cn(card, "a-in p-5 sm:p-6")}>
        <SectionTitle title="Order & Pricing Details" />
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <dt className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">Customer</dt>
            <dd className="mt-1 text-[13.5px] font-semibold text-zinc-900">
              <Link href={`/admin/customers/${transaction.user_id}`} className="hover:text-primary hover:underline">
                {profile?.full_name || "Customer"}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">Product</dt>
            <dd className="mt-1 truncate text-[13.5px] font-semibold text-zinc-900">
              {product?.name || transaction.service_type.toUpperCase()}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">Recipient</dt>
            <dd className="mt-1 font-mono text-[13px] font-medium text-zinc-800">{transaction.destination || "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">Provider</dt>
            <dd className="mt-1 truncate text-[13.5px] font-semibold text-zinc-900">
              {provider?.name || "Unassigned"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">Provider Ref</dt>
            <dd className="mt-1 truncate font-mono text-[12.5px] text-zinc-600">
              {transaction.provider_reference || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">Discount / Coupon</dt>
            <dd className="mt-1 font-mono text-[12.5px] text-zinc-700">
              {discountAmount > 0 ? (
                <span>
                  −{money(discountAmount)} ({couponCode || (metadata.mode === "epin" ? "Route discount" : "Promo")})
                </span>
              ) : couponCode ? (
                couponCode
              ) : (
                `List ${money(originalAmount)}`
              )}
            </dd>
          </div>
        </dl>

        {failureReason ? (
          <div className="mt-4 flex items-start gap-2.5 rounded-[8px] border border-rose-200 bg-rose-50/70 px-3.5 py-2.5 text-[12.5px] font-medium text-rose-800">
            <AdminIcon name="alert" className="mt-0.5 size-4 shrink-0 text-rose-600" />
            <span className="font-mono break-all">{failureReason}</span>
          </div>
        ) : null}
      </section>

      {transaction.metadata?.mode === "epin" ? <RechargeCardRecovery
        transactionId={transaction.id}
        status={transaction.status}
        deliveryStatus={transaction.metadata.deliveryStatus ?? (transaction.status === "successful" ? "ready" : "awaiting_provider")}
        quantity={Number(transaction.metadata.quantity ?? 1)}
        pinCount={Number(transaction.metadata.pinCount ?? 0)}
        providerReference={transaction.provider_reference}
        legacy={transaction.metadata.pipelineVersion !== 2}
        reconciliationIssue={transaction.metadata.reconciliationIssue}
        canReconcile={session.permissions.includes("*") || session.permissions.includes("reconciliation.manage")}
      /> : <TransactionOperations
        transactionId={transaction.id}
        status={transaction.status}
        providerReference={transaction.provider_reference}
      />}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        {/* Timeline */}
        <section className={cn(card, "a-in p-5 sm:p-6")}>
          <SectionTitle title="Timeline" count={data.events.length} />
          {data.events.length ? (
            <ol className="relative mt-5 space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-zinc-200">
              {data.events.map((event, index) => (
                <li key={event.id} className="relative flex items-start gap-4 pl-0">
                  <span
                    className={cn(
                      "relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-a-surface",
                      index === data.events.length - 1 ? "bg-primary" : "bg-zinc-300",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold text-zinc-800">{event.summary}</span>
                    <span className="mt-0.5 block font-mono text-[11.5px] text-zinc-500 tabular-nums">
                      {dateTime(event.created_at)}
                    </span>
                  </span>
                  <StatusBadge value={event.to_status || event.event_type} size="sm" />
                </li>
              ))}
            </ol>
          ) : (
            <Empty>No Events Yet</Empty>
          )}
        </section>

        {/* Provider Attempts */}
        <section className={cn(card, "a-in p-5 sm:p-6")}>
          <SectionTitle title="Provider Attempts" count={data.attempts.length} />
          {data.attempts.length ? (
            <div className="mt-3 divide-y divide-[color:var(--a-border)]">
              {data.attempts.map((attempt) => {
                const attemptProvider = pickOne(attempt.provider as { name?: string; slug?: string } | null);
                const payloadPreview = attempt.response_redacted ? JSON.stringify(attempt.response_redacted) : null;
                return (
                  <div key={attempt.id} className="py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-a-primary-soft font-mono text-[12px] font-semibold text-primary tabular-nums">
                        {attempt.attempt_number}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-zinc-800">
                          {attemptProvider?.name || "Provider"}{" "}
                          <span className="font-mono text-[12px] font-normal text-zinc-500">
                            {attempt.provider_reference || `Attempt ${attempt.attempt_number}`}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[11.5px] text-zinc-500 tabular-nums">
                          HTTP {attempt.http_status || "—"} · {attempt.latency_ms ?? "—"} ms · {dateTime(attempt.created_at)}
                        </span>
                      </span>
                      <StatusBadge value={attempt.outcome} size="sm" />
                    </div>
                    {payloadPreview ? (
                      <pre className="mt-2 max-h-24 overflow-auto rounded-[6px] bg-zinc-50 px-2.5 py-1.5 font-mono text-[11px] text-zinc-600">
                        {payloadPreview}
                      </pre>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty>No Provider Calls</Empty>
          )}
        </section>

        {/* Wallet Ledger Entries */}
        <section className={cn(card, "a-in p-5 sm:p-6")}>
          <SectionTitle title="Wallet Ledger Trail" count={data.ledger.length} />
          {data.ledger.length ? (
            <div className="mt-3 divide-y divide-[color:var(--a-border)]">
              {data.ledger.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-zinc-800">
                      {entry.description || entry.entry_type}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[11.5px] text-zinc-500 tabular-nums">
                      {entry.reference} · Bal {money(Number(entry.balance_after ?? 0))} · {dateTime(entry.created_at)}
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={cn(
                        "font-mono text-[13px] font-semibold tabular-nums",
                        entry.entry_type === "debit" ? "text-rose-600" : "text-emerald-600",
                      )}
                    >
                      {entry.entry_type === "debit" ? "−" : "+"}
                      {money(Number(entry.amount))}
                    </span>
                    <StatusBadge value={entry.entry_type} size="sm" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No Ledger Entries Found</Empty>
          )}
        </section>

        {/* Provider API Logs */}
        <section className={cn(card, "a-in p-5 sm:p-6")}>
          <SectionTitle title="Provider API Logs" count={data.apiLogs.length} />
          {data.apiLogs.length ? (
            <div className="mt-3 divide-y divide-[color:var(--a-border)]">
              {data.apiLogs.map((log) => (
                <div key={log.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[12.5px] font-semibold text-zinc-800">
                        {log.method || "POST"} {log.endpoint || log.provider}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[11.5px] text-zinc-500 tabular-nums">
                        {log.provider} · {log.latency_ms ?? "—"} ms · {dateTime(log.created_at)}
                      </span>
                    </span>
                    <StatusBadge value={log.outcome || "logged"} size="sm" />
                  </div>
                  {log.response_payload ? (
                    <pre className="mt-2 max-h-24 overflow-auto rounded-[6px] bg-zinc-50 px-2.5 py-1.5 font-mono text-[11px] text-zinc-600">
                      {typeof log.response_payload === "string"
                        ? log.response_payload
                        : JSON.stringify(log.response_payload)}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <Empty>No Provider Logs Recorded</Empty>
          )}
        </section>

        {/* Refunds, Disputes & Cashback */}
        <section className={cn(card, "a-in p-5 sm:p-6 lg:col-span-2")}>
          <SectionTitle title="Refunds, Disputes & Cashback" count={claims.length + (data.cashbackAward ? 1 : 0)} />
          {claims.length || data.cashbackAward ? (
            <div className="mt-3 divide-y divide-[color:var(--a-border)]">
              {data.cashbackAward ? (
                <div className="flex items-center gap-3 py-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700">
                    <AdminIcon name="gift" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-zinc-800">
                      Cashback Reward ({money(Number(data.cashbackAward.amount ?? 0))})
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[11.5px] text-zinc-500 tabular-nums">
                      Cashback · {dateTime(data.cashbackAward.credited_at || data.cashbackAward.created_at)}
                    </span>
                  </span>
                  <StatusBadge value={data.cashbackAward.status || "credited"} size="sm" />
                </div>
              ) : null}
              {claims.map((item) => (
                <div key={item.id} className="flex items-center gap-3 py-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-700">
                    <AdminIcon name={item.kind === "Refund" ? "refund" : "dispute"} className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-zinc-800">{item.title}</span>
                    <span className="mt-0.5 block truncate font-mono text-[11.5px] text-zinc-500 tabular-nums">
                      {item.kind} · {dateTime(item.created_at)}
                    </span>
                  </span>
                  <StatusBadge value={item.status} size="sm" />
                </div>
              ))}
            </div>
          ) : (
            <Empty>No Refunds, Disputes or Cashback Awards</Empty>
          )}
        </section>
      </div>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded-[8px] border border-dashed border-zinc-200 bg-zinc-50/60 px-5 py-8 text-center text-[13.5px] font-semibold text-zinc-500">
      {children}
    </div>
  );
}
