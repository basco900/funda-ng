"use client";

import { useState, useTransition } from "react";
import { closeRechargeInvestigation, recordRechargeCardCost, resolveRechargeCardPurchase } from "@/app/admin/(console)/actions";
import AdminSelect from "@/app/admin/(console)/admin-select";
import { AdminFeedback } from "@/app/admin/(console)/admin-ui";
import { rechargeDeliveryLabel } from "@/lib/recharge-cards";
import styles from "@/app/admin/admin.module.css";

export default function RechargeCardRecovery({ transactionId, status, deliveryStatus, quantity, pinCount, providerReference, legacy = false, reconciliationIssue, canReconcile = true }: { transactionId: string; status: string; deliveryStatus: string; quantity: number; pinCount: number; providerReference?: string | null; legacy?: boolean; reconciliationIssue?: string | null; canReconcile?: boolean }) {
  const [action, setAction] = useState("recover");
  const [reconciling, setReconciling] = useState(false);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const terminal = ["successful", "failed", "reversed", "refunded", "cancelled"].includes(status) && !(legacy && status === "successful" && deliveryStatus !== "ready");
  return (
    <section className={styles.workspacePanel}>
      <header className={styles.panelHeader}><h2>Recharge-card recovery</h2><span className={styles.statusPill} data-status={terminal ? status : "pending"}>{rechargeDeliveryLabel(deliveryStatus)}</span></header>
      <div className={styles.modalForm} style={{ padding: "0 24px 24px" }}>
        <div className={styles.summaryList}><div><span>PINs verified</span><strong>{pinCount} / {quantity}</strong></div><div><span>Order</span><strong>{status}</strong></div></div>
        {feedback ? <AdminFeedback tone={feedback.ok ? "success" : "error"} text={feedback.message} onClose={() => setFeedback(null)} /> : null}
        {!terminal ? <form className={styles.modalForm} onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const values = new FormData(form);
          startTransition(async () => {
            const result = await resolveRechargeCardPurchase({ transactionId, action, providerReference: values.get("providerReference"), reason: values.get("reason"), pins: values.get("pins") ?? "", confirmed: values.get("confirmed") === "on" });
            setFeedback(result);
            if (result.ok) form.reset();
          });
        }}>
          <div className={styles.formGrid}>
            <div className={styles.fieldGroup}><span>Resolution</span><AdminSelect ariaLabel="Recharge-card resolution" value={action} onValueChange={setAction} disabled={pending} options={[{ value: "recover", label: "Recover provider PINs" }, ...(pinCount === 0 && status !== "successful" ? [{ value: "confirm_failure", label: "Confirm non-delivery & refund" }] : [])]} /></div>
            <label className={styles.fieldGroup}><span>Provider reference</span><input name="providerReference" defaultValue={providerReference ?? ""} maxLength={200} required disabled={pending} /></label>
          </div>
          {action === "recover" ? <label className={styles.fieldGroup}><span>Provider PIN batch ({quantity} cards)</span><textarea name="pins" placeholder={"PIN, serial\nPIN, serial"} rows={5} maxLength={20000} required autoComplete="off" spellCheck={false} disabled={pending} /></label> : null}
          <label className={styles.fieldGroup}><span>Provider evidence / case notes</span><textarea name="reason" rows={3} minLength={10} maxLength={1000} required disabled={pending} /></label>
          <label className={styles.rechargeConfirmation}><input name="confirmed" type="checkbox" required disabled={pending} /><span>{action === "recover" ? "I verified this batch against the provider order." : "The provider confirmed that no PINs were issued or will be delivered."}</span></label>
          <div><button type="submit" className={action === "recover" ? styles.primaryButton : styles.dangerButton} disabled={pending}>{pending ? "Resolving…" : action === "recover" ? "Recover PINs" : "Confirm refund"}</button></div>
        </form> : null}
        {canReconcile ? <div><button type="button" className={styles.secondaryButton} onClick={() => setReconciling((value) => !value)}>Reconcile provider cost</button></div> : null}
        {reconciling ? <form className={styles.modalForm} onSubmit={(event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          startTransition(async () => {
            const result = await recordRechargeCardCost({ transactionId, cost: values.get("cost"), statementReference: values.get("statementReference"), reason: values.get("reason") });
            setFeedback(result);
            if (result.ok) setReconciling(false);
          });
        }}>
          <div className={styles.formGrid}><label className={styles.fieldGroup}><span>Actual provider debit (₦)</span><input name="cost" type="number" min="0" max="500000" step="0.01" required disabled={pending} /></label><label className={styles.fieldGroup}><span>Statement reference</span><input name="statementReference" required maxLength={200} disabled={pending} /></label></div>
          <label className={styles.fieldGroup}><span>Reconciliation notes</span><textarea name="reason" required minLength={10} maxLength={1000} rows={3} disabled={pending} /></label>
          <div><button type="submit" className={styles.primaryButton} disabled={pending}>{pending ? "Saving…" : "Record actual cost"}</button></div>
        </form> : null}
        {reconciliationIssue && canReconcile ? <form className={styles.modalForm} onSubmit={(event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          startTransition(async () => {
            const result = await closeRechargeInvestigation({ transactionId, evidenceReference: values.get("evidenceReference"), reason: values.get("reason"), confirmed: values.get("confirmed") === "on" });
            setFeedback(result);
          });
        }}>
          <h3>Close provider investigation</h3>
          <label className={styles.fieldGroup}><span>Provider closure reference</span><input name="evidenceReference" required maxLength={200} disabled={pending} /></label>
          <label className={styles.fieldGroup}><span>Resolution evidence</span><textarea name="reason" required minLength={10} maxLength={1000} rows={3} disabled={pending} /></label>
          <label className={styles.rechargeConfirmation}><input type="checkbox" name="confirmed" required disabled={pending} /><span>The provider resolved this conflict and revoked any late PINs. Any financial adjustment has independent approval.</span></label>
          <div><button type="submit" className={styles.secondaryButton} disabled={pending}>{pending ? "Closing…" : "Close investigation"}</button></div>
        </form> : null}
      </div>
    </section>
  );
}
