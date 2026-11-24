import { requireAdminPermission } from "../../../../../lib/admin/auth";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import styles from "../../../admin.module.css";
import ReviewActions from "./review-actions";
import AdminIcon from "../../admin-icon";
import { PageHeader, StatBand } from "../../../../../components/admin/kit";
import { UrlList, UrlStatusChips } from "../../../../../components/admin/list-controls";

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

export default async function PaymentReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPermission("wallet.adjust");
  const params = await searchParams;
  const reason = typeof params.reason === "string" ? params.reason : "";
  const outcome = typeof params.outcome === "string" ? params.outcome : "";
  const client = createAdminClient();
  const [{ data: pending }, { data: recent }] = await Promise.all([
    client.from("payment_review_queue").select("*").eq("status", "pending").order("created_at", { ascending: true }).limit(200),
    client.from("payment_review_queue").select("*").neq("status", "pending").order("resolved_at", { ascending: false }).limit(100),
  ]);
  const pendingRows = (pending ?? []) as ReviewRow[];
  const recentRows = (recent ?? []) as ReviewRow[];
  const heldValue = pendingRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const waiting = reason ? pendingRows.filter((row) => row.reason === reason) : pendingRows;
  const resolved = outcome ? recentRows.filter((row) => row.status === outcome) : recentRows;
  const values = { reason, outcome };
  const countBy = (rows: ReviewRow[], key: (row: ReviewRow) => string, label: (value: string) => string) => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, label: label(value), count }));
  };

  return (
    <div className={styles.workspacePage}>
      <PageHeader title="Payment Reviews" />

      <StatBand
        stats={[
          { label: "Awaiting review", value: pendingRows.length.toLocaleString("en-NG"), icon: "clock", tone: pendingRows.length ? "amber" : "neutral" },
          { label: "Value held", value: money(heldValue), icon: "wallet", tone: "primary" },
          { label: "Recently resolved", value: recentRows.length.toLocaleString("en-NG"), icon: "check", tone: "emerald" },
        ]}
      />

      <section className={styles.workspacePanel}>
        <div className={styles.directoryHeader}>
          <div className={styles.directoryTitle}>
            <h2>Awaiting Review</h2>
            <span className={styles.countPill}>{waiting.length}</span>
          </div>
          {pendingRows.length ? (
            <UrlList values={values}>
              <UrlStatusChips param="reason" total={pendingRows.length} options={countBy(pendingRows, (row) => row.reason, (value) => reasonLabels[value] ?? value.replaceAll("_", " "))} />
            </UrlList>
          ) : null}
        </div>
        <div className={styles.workspaceTableWrap}>
          <table className={styles.workspaceTable}>
            <thead><tr><th>Received</th><th>Reason</th><th data-align="right">Amount</th><th>Sender</th><th>Charge</th><th>Resolve</th></tr></thead>
            <tbody>
              {waiting.length ? waiting.map((row) => {
                const transfer = row.payload?.data?.payment_method_details?.bank_transfer;
                return (
                  <tr key={row.id}>
                    <td>
                      <div className={styles.cellValue}>
                        <strong>{dateLabel(row.created_at)}</strong>
                        <small>{timeLabel(row.created_at)}</small>
                      </div>
                    </td>
                    <td><span className={styles.statusPill} data-status="pending">{reasonLabels[row.reason] ?? row.reason}</span></td>
                    <td data-align="right" className={styles.cellPlain}>{row.amount !== null ? money(Number(row.amount)) : "—"} {row.currency && row.currency !== "NGN" ? row.currency : ""}</td>
                    <td>
                      <div className={styles.cellTitle}>
                        <strong>{[transfer?.sender_name, transfer?.sender_bank].filter(Boolean).join(" · ") || "—"}</strong>
                        {transfer?.narration ? <small>{transfer.narration}</small> : null}
                      </div>
                    </td>
                    <td><code>{row.charge_id ?? "—"}</code></td>
                    <td><ReviewActions reviewId={row.id} suggestedCustomer={row.user_id ?? row.suggested_user_id} /></td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={6}>
                    <div className={styles.tableEmpty}>
                      <AdminIcon name="check" />
                      <strong>{reason ? "Nothing Held for This Reason" : "Nothing Is Waiting for Review"}</strong>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.workspacePanel}>
        <div className={styles.directoryHeader}>
          <div className={styles.directoryTitle}>
            <h2>Recently Resolved</h2>
            <span className={styles.countPill}>{resolved.length}</span>
          </div>
          {recentRows.length ? (
            <UrlList values={values}>
              <UrlStatusChips param="outcome" total={recentRows.length} options={countBy(recentRows, (row) => row.status, (value) => value.charAt(0).toUpperCase() + value.slice(1))} />
            </UrlList>
          ) : null}
        </div>
        <div className={styles.workspaceTableWrap}>
          <table className={styles.workspaceTable}>
            <thead><tr><th>Resolved</th><th>Outcome</th><th>Reason</th><th data-align="right">Amount</th><th>Customer</th><th>Note</th></tr></thead>
            <tbody>
              {resolved.length ? resolved.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className={styles.cellValue}>
                      <strong>{row.resolved_at ? dateLabel(row.resolved_at) : "—"}</strong>
                      {row.resolved_at ? <small>{timeLabel(row.resolved_at)}</small> : null}
                    </div>
                  </td>
                  <td><span className={styles.statusPill} data-status={row.status}>{row.status}</span></td>
                  <td className={styles.cellPlain}>{reasonLabels[row.reason] ?? row.reason}</td>
                  <td data-align="right" className={styles.cellPlain}>{row.amount !== null ? money(Number(row.amount)) : "—"}</td>
                  <td><code>{row.user_id ? row.user_id.slice(0, 8) : "—"}</code></td>
                  <td className={styles.cellMuted}>{row.resolution_note ?? "—"}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6}>
                    <div className={styles.tableEmpty}>
                      <AdminIcon name="clock" />
                      <strong>No Decisions Yet</strong>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
}
