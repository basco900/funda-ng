import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPermission } from "../../../../../lib/admin/auth";
import { loadTransaction360 } from "../../../../../lib/admin/details";
import styles from "../../../admin.module.css";
import TransactionOperations from "./transaction-operations";

const money = (value: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);

export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPermission("transactions.view");
  const data = await loadTransaction360((await params).id);
  if (!data) notFound();
  const transaction = data.transaction;
  return <div className={styles.workspacePage}>
    <Link href="/admin/transactions" className={styles.backLink}>← Transactions</Link>
    <section className={styles.detailHero}><div><span className={styles.pageEyebrow}>Transaction timeline</span><h1>{transaction.internal_reference}</h1><p>{transaction.profile?.full_name || "Customer"} · {transaction.service_type} · {transaction.destination}</p></div><div className={styles.detailPills}><span>{transaction.status}</span><span>{money(Number(transaction.amount))}</span></div></section>
    <section className={styles.workspaceMetrics}>{[["Provider cost", money(Number(transaction.provider_cost)), "Supplier price"], ["Margin", money(Number(transaction.gross_margin)), "Before overhead"], ["Cashback", money(Number(transaction.cashback_amount)), "Customer reward"]].map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</section>
    <section className={styles.detailGrid}>
      <article className={styles.workspacePanel}><div className={styles.panelHeader}><h2>Status timeline</h2></div><div className={styles.detailList}>{data.events.map((event) => <div key={event.id}><span>{event.summary}<small>{new Date(event.created_at).toLocaleString("en-NG")}</small></span><em>{event.to_status || event.event_type}</em></div>)}</div></article>
      <article className={styles.workspacePanel}><div className={styles.panelHeader}><h2>Provider attempts</h2></div><div className={styles.detailList}>{data.attempts.map((attempt) => <div key={attempt.id}><span>Attempt {attempt.attempt_number}<small>{attempt.http_status || "—"} · {attempt.latency_ms || "—"} ms</small></span><em>{attempt.outcome}</em></div>)}</div></article>
      <TransactionOperations transactionId={transaction.id} status={transaction.status} />
      <article className={styles.workspacePanel}><div className={styles.panelHeader}><h2>Refunds & disputes</h2></div><div className={styles.detailList}>{[...data.refunds, ...data.disputes].map((item) => <div key={item.id}><span>{"reason" in item ? item.reason : item.dispute_number}<small>{new Date(item.created_at).toLocaleString("en-NG")}</small></span><em>{item.status}</em></div>)}</div></article>
    </section>
  </div>;
}
