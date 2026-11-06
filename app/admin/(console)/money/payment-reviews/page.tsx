import { requireAdminPermission } from "../../../../../lib/admin/auth";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import styles from "../../../admin.module.css";
import ReviewActions from "./review-actions";

const money = (value: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(value);

const reasonLabels: Record<string, string> = {
  unmatched_deposit: "No matching customer",
  sender_match_unconfirmed: "Matched by sender account only",
  amount_mismatch: "Amount differs from checkout",
  currency_mismatch: "Unexpected currency",
  underpaid: "Underpaid",
  funding_limit: "Over KYC funding limit",
  wallet_restricted: "Wallet restricted",
  amount_too_large: "Unusually large deposit",
};

type ReviewRow = {
  id: string;
  reason: string;
  status: string;
  amount: number | null;
  currency: string | null;
  charge_id: string | null;
  checkout_id: string | null;
  user_id: string | null;
  suggested_user_id: string | null;
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
  payload: { data?: { payment_method_details?: { bank_transfer?: { sender_name?: string | null; sender_bank?: string | null; narration?: string | null } | null } | null } };
};

export default async function PaymentReviewsPage() {
  await requireAdminPermission("wallet.adjust");
  const client = createAdminClient();
  const [{ data: pending }, { data: recent }] = await Promise.all([
    client.from("payment_review_queue").select("*").eq("status", "pending").order("created_at", { ascending: true }).limit(200),
    client.from("payment_review_queue").select("*").neq("status", "pending").order("resolved_at", { ascending: false }).limit(30),
  ]);
  const pendingRows = (pending ?? []) as ReviewRow[];
  const recentRows = (recent ?? []) as ReviewRow[];
  const heldValue = pendingRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  return (
    <div className={styles.workspacePage}>
      <section className={styles.pageHeading}>
        <div>
          <h1>Payment Reviews</h1>
        </div>
      </section>

      <section className={styles.workspaceMetrics}>
        <article><span>Awaiting review</span><strong>{pendingRows.length}</strong><small>Oldest first</small></article>
        <article><span>Value held</span><strong>{money(heldValue)}</strong><small>Not yet in any wallet</small></article>
        <article><span>Recently resolved</span><strong>{recentRows.length}</strong><small>Last 30 decisions</small></article>
      </section>

      <section className={styles.workspacePanel}>
        <div className={styles.panelHeader}><h2>Awaiting Review</h2></div>
        <div className={styles.workspaceTableWrap}>
          <table className={styles.workspaceTable}>
            <thead><tr><th>Received</th><th>Reason</th><th data-align="right">Amount</th><th>Sender</th><th>Charge</th><th>Resolve</th></tr></thead>
            <tbody>
              {pendingRows.length ? pendingRows.map((row) => {
                const transfer = row.payload?.data?.payment_method_details?.bank_transfer;
                return (
                  <tr key={row.id}>
                    <td>{new Date(row.created_at).toLocaleString("en-NG")}</td>
                    <td><span className={styles.statusPill} data-status="pending">{reasonLabels[row.reason] ?? row.reason}</span></td>
                    <td data-align="right">{row.amount !== null ? money(Number(row.amount)) : "—"} {row.currency && row.currency !== "NGN" ? row.currency : ""}</td>
                    <td>{[transfer?.sender_name, transfer?.sender_bank].filter(Boolean).join(" · ") || "—"}{transfer?.narration ? <><br /><small>{transfer.narration}</small></> : null}</td>
                    <td><code>{row.charge_id ?? "—"}</code></td>
                    <td><ReviewActions reviewId={row.id} suggestedCustomer={row.user_id ?? row.suggested_user_id} /></td>
                  </tr>
                );
              }) : <tr><td colSpan={6}>Nothing is waiting for review.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.workspacePanel}>
        <div className={styles.panelHeader}><h2>Recently Resolved</h2></div>
        <div className={styles.workspaceTableWrap}>
          <table className={styles.workspaceTable}>
            <thead><tr><th>Resolved</th><th>Outcome</th><th>Reason</th><th data-align="right">Amount</th><th>Customer</th><th>Note</th></tr></thead>
            <tbody>
              {recentRows.length ? recentRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.resolved_at ? new Date(row.resolved_at).toLocaleString("en-NG") : "—"}</td>
                  <td><span className={styles.statusPill} data-status={row.status}>{row.status}</span></td>
                  <td>{reasonLabels[row.reason] ?? row.reason}</td>
                  <td data-align="right">{row.amount !== null ? money(Number(row.amount)) : "—"}</td>
                  <td><code>{row.user_id ?? "—"}</code></td>
                  <td>{row.resolution_note ?? "—"}</td>
                </tr>
              )) : <tr><td colSpan={6}>No decisions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
