"use client";

import { useState, useTransition } from "react";
import AdminIcon from "@/app/admin/(console)/admin-icon";
import AdminSelect from "@/app/admin/(console)/admin-select";
import { AdminFeedback, AdminModal, AdminSwitch } from "@/app/admin/(console)/admin-ui";
import { queueRechargeInventoryCheck, saveRechargeCardOffer } from "@/app/admin/(console)/actions";
import { RECHARGE_DENOMINATIONS } from "@/lib/recharge-cards";
import styles from "@/app/admin/admin.module.css";

export type RechargeOffer = { id: string; network: string; denomination: number; unit_cost: number; max_quantity: number; is_active: boolean; verified_at: string };

export default function RechargeCardCatalogue({ offers, available = true }: { offers: RechargeOffer[]; available?: boolean }) {
  const [editing, setEditing] = useState<Partial<RechargeOffer> | null>(null);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  return <>
    <div className="flex justify-end"><button type="button" className={styles.ghostButton} disabled={pending} onClick={() => startTransition(async () => setFeedback(await queueRechargeInventoryCheck()))}>Check historical inventory</button></div>
    <section className={styles.workspacePanel}>
      <div className={styles.directoryHeader}><div className={styles.directoryTop}><div className={styles.directoryTitle}><h2>Recharge-card offers</h2><span className={styles.countPill}>{offers.length}</span></div><button type="button" className={styles.secondaryButton} disabled={!available} onClick={() => { setFeedback(null); setEditing({ network: "mtn", denomination: 100, max_quantity: 20, is_active: false }); }}><AdminIcon name="plus" />Add cards</button></div></div>
      {!editing && feedback ? <AdminFeedback tone={feedback.ok ? "success" : "error"} text={feedback.message} onClose={() => setFeedback(null)} /> : null}
      <div className={styles.workspaceTableWrap}><table className={styles.workspaceTable}>
        <thead><tr><th>Network / card</th><th data-align="right">Provider unit cost</th><th>Order limit</th><th>Status</th><th>Verified</th><th data-align="right">Action</th></tr></thead>
        <tbody>{offers.length ? offers.map((offer) => <tr key={offer.id}><td><strong>{offer.network.toUpperCase()} · ₦{offer.denomination.toLocaleString("en-NG")}</strong></td><td data-align="right">₦{offer.unit_cost.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</td><td>{offer.max_quantity} cards</td><td><span className={styles.statusPill} data-status={offer.is_active ? "active" : "paused"}>{offer.is_active ? "Active" : "Paused"}</span></td><td className={styles.cellMuted}>{new Date(offer.verified_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" })}</td><td data-align="right"><button type="button" className={styles.textAction} onClick={() => { setFeedback(null); setEditing(offer); }}>Edit</button></td></tr>) : <tr><td colSpan={6}><div className={styles.tableEmpty}><AdminIcon name="pricing" /><strong>{available ? "No recharge-card offers" : "Card catalogue unavailable"}</strong></div></td></tr>}</tbody>
      </table></div>
    </section>
    {editing ? <AdminModal title={editing.id ? "Edit recharge cards" : "Add recharge cards"} onClose={() => { if (!pending) setEditing(null); }} width={520} footer={<><button type="button" className={styles.secondaryButton} disabled={pending} onClick={() => setEditing(null)}>Cancel</button><button type="submit" form="recharge-offer-form" className={styles.primaryButton} disabled={pending}>{pending ? "Saving…" : "Save offer"}</button></>}>
      <form id="recharge-offer-form" className={styles.modalForm} onSubmit={(event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await saveRechargeCardOffer({ id: editing.id, network: values.get("network"), denomination: values.get("denomination"), unitCost: values.get("unitCost"), maxQuantity: values.get("maxQuantity"), isActive: values.get("isActive") === "true", verified: values.get("verified") === "on" });
          setFeedback(result);
          if (result.ok) setEditing(null);
        });
      }}>
        {feedback && !feedback.ok ? <AdminFeedback tone="error" text={feedback.message} onClose={() => setFeedback(null)} /> : null}
        <div className={styles.formGrid}>
          <div className={styles.fieldGroup}><span>Network</span><AdminSelect name="network" defaultValue={editing.network} disabled={pending} options={[{ value: "mtn", label: "MTN" }, { value: "airtel", label: "Airtel" }, { value: "glo", label: "Glo" }, { value: "9mobile", label: "9mobile" }]} /></div>
          <div className={styles.fieldGroup}><span>Card value</span><AdminSelect name="denomination" defaultValue={String(editing.denomination)} disabled={pending} options={RECHARGE_DENOMINATIONS.map((value) => ({ value: String(value), label: `₦${value.toLocaleString("en-NG")}` }))} /></div>
          <label className={styles.fieldGroup}><span>Verified provider cost per card (₦)</span><input type="number" name="unitCost" step="0.01" min="0.01" max="100000" defaultValue={editing.unit_cost} required disabled={pending} /></label>
          <label className={styles.fieldGroup}><span>Maximum cards per order</span><input type="number" name="maxQuantity" min="1" max="20" step="1" defaultValue={editing.max_quantity} required disabled={pending} /></label>
        </div>
        <AdminSwitch name="isActive" label="Active" defaultChecked={editing.is_active} />
        <label className={styles.rechargeConfirmation}><input name="verified" type="checkbox" required disabled={pending} /><span>I verified this unit cost with Maskawasub.</span></label>
      </form>
    </AdminModal> : null}
  </>;
}
