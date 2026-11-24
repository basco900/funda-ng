"use client";

import { useState, useTransition } from "react";
import { AdminPageHeader } from "@/components/admin/page-pattern";
import AdminIcon from "../../(console)/admin-icon";
import AdminSelect from "../../(console)/admin-select";
import { AdminFeedback, AdminModal, AdminSwitch } from "../../(console)/admin-ui";
import styles from "../../admin.module.css";
import { FilterChips, PurchaseStatusFilter, statusOptionsFrom } from "@/components/admin/list-controls";
import type { PurchaseFilter } from "@/lib/admin/purchases";
import {
  saveElectricityDiscoConfig,
  bulkUpdateElectricityDiscos,
  adminRefundTransaction,
} from "../../(console)/actions";

type DiscoRow = {
  disco_code: string;
  disco_name: string;
  coverage_area: string;
  primary_provider: string;
  fallback_provider: string | null;
  supports_prepaid: boolean;
  supports_postpaid: boolean;
  convenience_fee: number;
  cashback_percentage: number;
  min_purchase_amount: number;
  max_purchase_amount: number;
  is_active: boolean;
  maintenance_notice: string | null;
};

type ProviderRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

type TransactionRow = {
  id: string;
  internal_reference: string;
  provider_reference: string | null;
  destination: string;
  amount: number;
  status: string;
  service_type: string;
  metadata?: {
    customerName?: string;
    token?: string;
    units?: string;
    discoName?: string;
  } | null;
  created_at: string;
  user?: { id: string; phone?: string | null; email?: string | null } | null;
};

const GATEWAY_OPTIONS = [
  { value: "vtpass", label: "VTPass" },
  { value: "maskawasub", label: "Maskawasub" },
  { value: "smeplug", label: "SMEPlug" },
];

const FALLBACK_OPTIONS = [
  { value: "", label: "No fallback" },
  { value: "maskawasub", label: "Maskawasub" },
  { value: "vtpass", label: "VTPass" },
  { value: "smeplug", label: "SMEPlug" },
];

const METER_TYPE_OPTIONS = [
  { value: "prepaid", label: "Prepaid" },
  { value: "postpaid", label: "Postpaid" },
];

export default function ElectricityWorkspace({
  discoConfigs,
  providers,
  recentTransactions,
  purchaseFilter,
}: {
  discoConfigs: DiscoRow[];
  providers: ProviderRow[];
  recentTransactions: TransactionRow[];
  purchaseFilter?: PurchaseFilter;
}) {
  const [isPending, startTransition] = useTransition();
  const [discoStatus, setDiscoStatus] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Edit Single Disco Modal
  const [editingDisco, setEditingDisco] = useState<DiscoRow | null>(null);

  // Bulk Edit Modal
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  // Meter Verification Test Drawer
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [testDisco, setTestDisco] = useState("ikeja");
  const [testMeterType, setTestMeterType] = useState("prepaid");
  const [testMeterNumber, setTestMeterNumber] = useState("");
  const [verifyResult, setVerifyResult] = useState<{
    valid: boolean;
    customerName?: string;
    customerAddress?: string;
    message?: string;
  } | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Refund Modal
  const [refundTarget, setRefundTarget] = useState<TransactionRow | null>(null);
  const [refundReason, setRefundReason] = useState("");

  const activeDiscosCount = discoConfigs.filter((d) => d.is_active).length;

  function handleSaveSingle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingDisco) return;
    const formData = new FormData(e.currentTarget);
    const payload = {
      discoCode: editingDisco.disco_code,
      primaryProvider: formData.get("primaryProvider") as string,
      fallbackProvider: (formData.get("fallbackProvider") as string) || null,
      supportsPrepaid: formData.get("supportsPrepaid") === "true",
      supportsPostpaid: formData.get("supportsPostpaid") === "true",
      convenienceFee: Number(formData.get("convenienceFee")),
      cashbackPercentage: Number(formData.get("cashbackPercentage")),
      minPurchaseAmount: Number(formData.get("minPurchaseAmount")),
      maxPurchaseAmount: Number(formData.get("maxPurchaseAmount")),
      isActive: formData.get("isActive") === "true",
      maintenanceNotice: (formData.get("maintenanceNotice") as string) || null,
    };

    startTransition(async () => {
      setFeedback(null);
      const res = await saveElectricityDiscoConfig(payload);
      if (res.ok) {
        setFeedback({ type: "success", text: res.message });
        setEditingDisco(null);
      } else {
        setFeedback({ type: "error", text: res.message });
      }
    });
  }

  function handleBulkSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const primaryProvider = formData.get("bulkPrimary") as string;
    const fallbackProvider = formData.get("bulkFallback") as string;
    const feeStr = formData.get("bulkFee") as string;
    const cashbackStr = formData.get("bulkCashback") as string;

    const payload: {
      primaryProvider?: string;
      fallbackProvider?: string;
      convenienceFee?: number;
      cashbackPercentage?: number;
    } = {};

    if (primaryProvider) payload.primaryProvider = primaryProvider;
    if (fallbackProvider) payload.fallbackProvider = fallbackProvider;
    if (feeStr !== "") payload.convenienceFee = Number(feeStr);
    if (cashbackStr !== "") payload.cashbackPercentage = Number(cashbackStr);

    startTransition(async () => {
      setFeedback(null);
      const res = await bulkUpdateElectricityDiscos(payload);
      if (res.ok) {
        setFeedback({ type: "success", text: res.message });
        setIsBulkModalOpen(false);
      } else {
        setFeedback({ type: "error", text: res.message });
      }
    });
  }

  function handleToggleDisco(disco: DiscoRow) {
    startTransition(async () => {
      setFeedback(null);
      const res = await saveElectricityDiscoConfig({
        discoCode: disco.disco_code,
        primaryProvider: disco.primary_provider,
        fallbackProvider: disco.fallback_provider,
        supportsPrepaid: disco.supports_prepaid,
        supportsPostpaid: disco.supports_postpaid,
        convenienceFee: disco.convenience_fee,
        cashbackPercentage: disco.cashback_percentage,
        minPurchaseAmount: disco.min_purchase_amount,
        maxPurchaseAmount: disco.max_purchase_amount,
        isActive: !disco.is_active,
        maintenanceNotice: !disco.is_active ? null : "Offline for scheduled grid maintenance.",
      });
      if (res.ok) {
        setFeedback({ type: "success", text: `${disco.disco_name} is now ${!disco.is_active ? "online" : "in maintenance"}.` });
      } else {
        setFeedback({ type: "error", text: res.message });
      }
    });
  }

  async function handleTestVerification(e: React.FormEvent) {
    e.preventDefault();
    if (!testMeterNumber.trim()) return;
    setVerifying(true);
    setVerifyResult(null);

    try {
      const res = await fetch("/api/services/electricity/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disco: testDisco,
          meterNumber: testMeterNumber.trim(),
          meterType: testMeterType,
        }),
      });
      const data = await res.json();
      setVerifyResult(data);
    } catch {
      setVerifyResult({ valid: false, message: "Network error while verifying meter." });
    } finally {
      setVerifying(false);
    }
  }

  function handleRefundSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!refundTarget || !refundReason.trim()) return;
    startTransition(async () => {
      setFeedback(null);
      const res = await adminRefundTransaction({
        transactionId: refundTarget.id,
        reason: refundReason.trim(),
      });
      if (res.ok) {
        setFeedback({ type: "success", text: res.message });
        setRefundTarget(null);
        setRefundReason("");
      } else {
        setFeedback({ type: "error", text: res.message });
      }
    });
  }

  const discoState = (disco: DiscoRow) => (disco.is_active ? "active" : "offline");
  const visibleDiscos = discoStatus ? discoConfigs.filter((disco) => discoState(disco) === discoStatus) : discoConfigs;

  return (
    <div className={styles.workspacePage}>
      <AdminPageHeader
        title="Electricity"
        actions={
          <>
            <button type="button" className={styles.secondaryButton} onClick={() => setIsVerifyModalOpen(true)}>
              <AdminIcon name="search" />
              Test meter
            </button>
            <button type="button" className={styles.primaryButton} onClick={() => setIsBulkModalOpen(true)}>
              <AdminIcon name="bolt" />
              Bulk switch
            </button>
          </>
        }
        stats={[
          { icon: "bolt", tone: "slate", value: activeDiscosCount, label: "Active discos", note: `of ${discoConfigs.length} distribution companies` },
          { icon: "transactions", tone: "emerald", value: recentTransactions.length, label: "Purchases", note: "recent token orders" },
          { icon: "alert", tone: "amber", value: recentTransactions.filter((tx) => tx.status === "failed").length, label: "Failed", note: "eligible for refund" },
          { icon: "provider", tone: "primary", value: providers.length, label: "Gateways", note: "connected providers" },
        ]}
      />

      {feedback ? <AdminFeedback tone={feedback.type} text={feedback.text} onClose={() => setFeedback(null)} /> : null}

      <section className={styles.workspacePanel}>
        <div className={styles.directoryHeader}>
          <div className={styles.directoryTop}>
            <div>
              <div className={styles.directoryTitle}>
                <h2>Disco directory</h2>
                <span className={styles.countPill}>{visibleDiscos.length}</span>
              </div>
            </div>
          </div>
          <FilterChips options={statusOptionsFrom(discoConfigs, discoState)} total={discoConfigs.length} value={discoStatus} onChange={setDiscoStatus} />
        </div>

        <div className={styles.workspaceTableWrap}>
          <table className={styles.workspaceTable}>
            <thead>
              <tr>
                <th>Disco</th>
                <th>Providers</th>
                <th>Meters</th>
                <th data-align="right">Fee</th>
                <th data-align="right">Cashback</th>
                <th>Status</th>
                <th data-align="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleDiscos.map((disco) => (
                <tr key={disco.disco_code}>
                  <td>
                    <div className={styles.cellTitle}>
                      <strong>{disco.disco_name}</strong>
                      <small>{disco.coverage_area}</small>
                    </div>
                  </td>
                  <td>
                    <div className={styles.cellTitle}>
                      <strong>{disco.primary_provider}</strong>
                      <small>{disco.fallback_provider ? `Fallback · ${disco.fallback_provider}` : "No fallback"}</small>
                    </div>
                  </td>
                  <td className={styles.cellPlain}>
                    {[disco.supports_prepaid ? "Prepaid" : null, disco.supports_postpaid ? "Postpaid" : null].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td data-align="right" className={styles.cellPlain}>₦{disco.convenience_fee}</td>
                  <td data-align="right" className={styles.cellPlain}>{disco.cashback_percentage}%</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleToggleDisco(disco)}
                      disabled={isPending}
                      className={`${styles.statusPill} ${styles.statusToggle}`}
                      data-status={disco.is_active ? "active" : "offline"}
                      aria-label={disco.is_active ? "Take offline" : "Bring online"}
                    >
                      {disco.is_active ? "Active" : "Offline"}
                    </button>
                  </td>
                  <td data-align="right">
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.iconAction} aria-label="Configure" data-tip="Configure" onClick={() => setEditingDisco(disco)}>
                        <AdminIcon name="pencil" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.workspacePanel}>
        <div className={styles.directoryHeader}>
          <div className={styles.directoryTop}>
            <div>
              <div className={styles.directoryTitle}>
                <h2>Recent purchases</h2>
                <span className={styles.countPill}>{recentTransactions.length}</span>
              </div>
            </div>
          </div>
          {purchaseFilter ? <PurchaseStatusFilter filter={purchaseFilter} /> : null}
        </div>

        <div className={styles.workspaceTableWrap}>
          <table className={styles.workspaceTable}>
            <thead>
              <tr>
                <th>Meter</th>
                <th>Token</th>
                <th data-align="right">Amount</th>
                <th>Status</th>
                <th>Date</th>
                <th data-align="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {recentTransactions.length > 0 ? (
                recentTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>
                      <div className={styles.cellTitle}>
                        <strong>{tx.destination}</strong>
                        <small>{tx.metadata?.customerName || "Customer"} · {tx.internal_reference}</small>
                      </div>
                    </td>
                    <td>
                      <div className={styles.cellValue}>
                        <strong>{tx.metadata?.token || "—"}</strong>
                        <small>{tx.metadata?.units ? `${tx.metadata.units} kWh` : "No units"}</small>
                      </div>
                    </td>
                    <td data-align="right" className={styles.cellPlain}>₦{Number(tx.amount).toLocaleString("en-NG")}</td>
                    <td><span className={styles.statusPill} data-status={tx.status}>{tx.status}</span></td>
                      <td>
                        <div className={styles.cellValue}>
                          <strong>{new Date(tx.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</strong>
                          <small>{new Date(tx.created_at).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" })}</small>
                        </div>
                      </td>
                    <td data-align="right">
                      {!["failed", "refunded", "reversed"].includes(tx.status) ? (
                        <button
                          type="button"
                          className={styles.textAction}
                          onClick={() => {
                            setRefundTarget(tx);
                            setRefundReason(`Token failure for meter ${tx.destination}`);
                          }}
                        >
                          Refund
                        </button>
                      ) : (
                        <span className={styles.cellMuted}>Refunded</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className={styles.tableEmpty}>
                      <AdminIcon name="bolt" />
                      <strong>No purchases yet</strong>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editingDisco ? (
        <AdminModal
          eyebrow="Disco"
          title={editingDisco.disco_name}
          onClose={() => setEditingDisco(null)}
          width={540}
          footer={
            <>
              <button type="button" className={styles.secondaryButton} onClick={() => setEditingDisco(null)}>Cancel</button>
              <button type="submit" form="disco-form" disabled={isPending} className={styles.primaryButton}>
                {isPending ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <form id="disco-form" onSubmit={handleSaveSingle} className={styles.modalForm}>
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <span>Primary gateway</span>
                <AdminSelect name="primaryProvider" defaultValue={editingDisco.primary_provider} options={GATEWAY_OPTIONS} />
              </div>
              <div className={styles.fieldGroup}>
                <span>Fallback gateway</span>
                <AdminSelect name="fallbackProvider" defaultValue={editingDisco.fallback_provider ?? ""} options={FALLBACK_OPTIONS} />
              </div>
              <label className={styles.fieldGroup}>
                <span>Convenience fee (₦)</span>
                <input type="number" name="convenienceFee" defaultValue={editingDisco.convenience_fee} min={0} max={1000} required />
              </label>
              <label className={styles.fieldGroup}>
                <span>Cashback %</span>
                <input type="number" step="0.1" name="cashbackPercentage" defaultValue={editingDisco.cashback_percentage} min={0} max={10} required />
              </label>
              <label className={styles.fieldGroup}>
                <span>Min purchase (₦)</span>
                <input type="number" name="minPurchaseAmount" defaultValue={editingDisco.min_purchase_amount} min={100} required />
              </label>
              <label className={styles.fieldGroup}>
                <span>Max purchase (₦)</span>
                <input type="number" name="maxPurchaseAmount" defaultValue={editingDisco.max_purchase_amount} min={1000} max={1000000} required />
              </label>
              <label className={`${styles.fieldGroup} ${styles.formSpan}`}>
                <span>Offline notice</span>
                <input
                  type="text"
                  name="maintenanceNotice"
                  defaultValue={editingDisco.maintenance_notice || ""}
                  placeholder="Shown to customers while offline"
                />
              </label>
            </div>
            <div className={styles.switchRow}>
              <AdminSwitch name="supportsPrepaid" label="Prepaid" defaultChecked={editingDisco.supports_prepaid} />
              <AdminSwitch name="supportsPostpaid" label="Postpaid" defaultChecked={editingDisco.supports_postpaid} />
              <AdminSwitch name="isActive" label="Active" defaultChecked={editingDisco.is_active} />
            </div>
          </form>
        </AdminModal>
      ) : null}

      {isBulkModalOpen ? (
        <AdminModal
          eyebrow="All Discos"
          title="Bulk switch"
          onClose={() => setIsBulkModalOpen(false)}
          width={460}
          footer={
            <>
              <button type="button" className={styles.secondaryButton} onClick={() => setIsBulkModalOpen(false)}>Cancel</button>
              <button type="submit" form="disco-bulk-form" disabled={isPending} className={styles.primaryButton}>
                {isPending ? "Applying…" : "Apply to all"}
              </button>
            </>
          }
        >
          <form id="disco-bulk-form" onSubmit={handleBulkSubmit} className={styles.modalForm}>
            <p className={styles.modalText}>Applies to all 12 Discos. Leave a field empty to keep current values.</p>
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <span>Primary gateway</span>
                <AdminSelect name="bulkPrimary" defaultValue="vtpass" options={GATEWAY_OPTIONS} />
              </div>
              <div className={styles.fieldGroup}>
                <span>Fallback gateway</span>
                <AdminSelect name="bulkFallback" defaultValue="maskawasub" options={FALLBACK_OPTIONS} />
              </div>
              <label className={styles.fieldGroup}>
                <span>Convenience fee (₦)</span>
                <input type="number" name="bulkFee" placeholder="Keep current" />
              </label>
              <label className={styles.fieldGroup}>
                <span>Cashback %</span>
                <input type="number" step="0.1" name="bulkCashback" placeholder="Keep current" />
              </label>
            </div>
          </form>
        </AdminModal>
      ) : null}

      {isVerifyModalOpen ? (
        <AdminModal eyebrow="Diagnostics" title="Test meter" onClose={() => setIsVerifyModalOpen(false)} width={460}>
          <form onSubmit={handleTestVerification} className={styles.modalForm}>
            <div className={styles.fieldGroup}>
              <span>Disco</span>
              <AdminSelect
                value={testDisco}
                onValueChange={setTestDisco}
                searchable
                options={discoConfigs.map((d) => ({ value: d.disco_code, label: d.disco_name }))}
              />
            </div>
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <span>Meter type</span>
                <AdminSelect value={testMeterType} onValueChange={setTestMeterType} options={METER_TYPE_OPTIONS} />
              </div>
              <label className={styles.fieldGroup}>
                <span>Meter number</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={testMeterNumber}
                  onChange={(e) => setTestMeterNumber(e.target.value)}
                  placeholder="01011504932"
                  required
                />
              </label>
            </div>
            <button type="submit" disabled={verifying} className={styles.primaryButton}>
              {verifying ? "Verifying…" : "Verify meter"}
            </button>
          </form>

          {verifyResult ? (
            <div className={styles.verifyResult} data-valid={verifyResult.valid}>
              <strong>
                <AdminIcon name={verifyResult.valid ? "check" : "alert"} />
                {verifyResult.valid ? "Meter verified" : "Verification failed"}
              </strong>
              {verifyResult.customerName || verifyResult.customerAddress ? (
                <div className={styles.summaryList}>
                  {verifyResult.customerName ? <div><span>Name</span><strong>{verifyResult.customerName}</strong></div> : null}
                  {verifyResult.customerAddress ? <div><span>Address</span><strong>{verifyResult.customerAddress}</strong></div> : null}
                </div>
              ) : null}
              {verifyResult.message ? <p>{verifyResult.message}</p> : null}
            </div>
          ) : null}
        </AdminModal>
      ) : null}

      {refundTarget ? (
        <AdminModal
          eyebrow="Refund"
          title="Refund to wallet"
          onClose={() => setRefundTarget(null)}
          width={440}
          footer={
            <>
              <button type="button" className={styles.secondaryButton} onClick={() => setRefundTarget(null)}>Cancel</button>
              <button type="submit" form="electricity-refund-form" disabled={isPending || !refundReason.trim()} className={styles.dangerButton}>
                {isPending ? "Refunding…" : `Refund ₦${Number(refundTarget.amount).toLocaleString()}`}
              </button>
            </>
          }
        >
          <form id="electricity-refund-form" onSubmit={handleRefundSubmit} className={styles.modalForm}>
            <p className={styles.modalText}>
              Marks the purchase as failed and credits <strong>₦{Number(refundTarget.amount).toLocaleString("en-NG")}</strong> back to the customer.
            </p>
            <div className={styles.summaryList}>
              <div><span>Reference</span><strong>{refundTarget.internal_reference}</strong></div>
              <div><span>Meter</span><strong>{refundTarget.destination}</strong></div>
            </div>
            <label className={styles.fieldGroup}>
              <span>Reason (logged)</span>
              <textarea value={refundReason} onChange={(e) => setRefundReason(e.target.value)} required rows={3} />
            </label>
          </form>
        </AdminModal>
      ) : null}
    </div>
  );
}
