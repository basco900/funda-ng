import Link from "next/link";
import { rechargeDeliveryLabel } from "@/lib/recharge-cards";
import styles from "@/app/admin/admin.module.css";

export type RechargeReview = { id: string; internal_reference: string; network: string; denomination: number; quantity: number; pin_count: number; amount: number; delivery_status: string; reconciliation_issue: string | null; updated_at: string };

export default function RechargeCardReviews({ rows }: { rows: RechargeReview[] | null }) {
  if (rows?.length === 0) return null;
  return <section className={styles.workspacePanel}>
    <header className={styles.panelHeader}><h2>Recharge-card review</h2>{rows ? <span className={styles.countPill}>{rows.length}</span> : null}</header>
    {rows ? <div className={styles.workspaceTableWrap}><table className={styles.workspaceTable}><thead><tr><th>Order</th><th>Cards</th><th>PINs verified</th><th>Issue</th><th data-align="right">Action</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><Link className={styles.textAction} href={`/admin/transactions/${row.id}`}>{row.internal_reference}</Link></td><td>{row.network.toUpperCase()} · {row.quantity} × ₦{Number(row.denomination).toLocaleString("en-NG")}</td><td>{row.pin_count} / {row.quantity}</td><td><span className={styles.statusPill} data-status="pending">{rechargeDeliveryLabel(row.reconciliation_issue === "provider_status_conflict" ? row.reconciliation_issue : row.delivery_status)}</span></td><td data-align="right"><Link className={styles.textAction} href={`/admin/transactions/${row.id}`}>Review</Link></td></tr>)}</tbody></table></div> : <div className={styles.tableEmpty}><strong>Review queue unavailable</strong></div>}
  </section>;
}
