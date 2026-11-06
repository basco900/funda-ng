"use client";

import { useState, useTransition } from "react";
import { AdminPageHeader } from "@/components/admin/page-pattern";
import AdminIcon from "../../(console)/admin-icon";
import AdminSelect from "../../(console)/admin-select";
import { AdminConfirm, AdminFeedback, AdminModal, AdminSwitch } from "../../(console)/admin-ui";
import styles from "../../admin.module.css";
import {
  saveCableTvConfig,
  bulkUpdateCableTvConfigs,
  saveCableTvPackage,
  deleteCableTvPackage,
  adminRefundTransaction,
} from "../../(console)/actions";

type TvConfigRow = {
  operator_code: string;
  operator_name: string;
  primary_provider: string;
  fallback_provider: string | null;
  convenience_fee: number;
  cashback_percentage: number;
  is_active: boolean;
  maintenance_notice: string | null;
  updated_at: string;
};

type TvPackageRow = {
  id: string;
  operator_code: string;
  package_code: string;
  name: string;
  price: number;
  duration_months: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
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
    operator?: string;
    operatorName?: string;
    packageName?: string;
    smartcardNumber?: string;
    subscriptionType?: string;
  } | null;
  created_at: string;
  user?: { id: string; phone?: string | null; email?: string | null } | null;
};

const OPERATOR_OPTIONS = [
  { value: "dstv", label: "DStv" },
  { value: "gotv", label: "GOtv" },
  { value: "startimes", label: "StarTimes" },
  { value: "showmax", label: "Showmax" },
];

export default function CableTvWorkspace({
  tvConfigs,
  tvPackages,
  providers,
  recentTransactions,
}: {
  tvConfigs: TvConfigRow[];
  tvPackages: TvPackageRow[];
  providers: ProviderRow[];
  recentTransactions: TransactionRow[];
}) {
  const [activeTab, setActiveTab] = useState<"operators" | "packages" | "tester" | "transactions">("operators");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Edit Single Operator Modal
  const [editingConfig, setEditingConfig] = useState<TvConfigRow | null>(null);

  // Bulk Edit Modal
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  // Package Edit/Add Modal
  const [editingPackage, setEditingPackage] = useState<TvPackageRow | null>(null);
  const [isNewPackageModalOpen, setIsNewPackageModalOpen] = useState(false);
  const [packageFilterOperator, setPackageFilterOperator] = useState<string>("all");
  const [packageSearch, setPackageSearch] = useState<string>("");

  // Live Decoder Tester
  const [testOperator, setTestOperator] = useState("dstv");
  const [testSmartcard, setTestSmartcard] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<Record<string, unknown> | null>(null);

  // Refund Modal
  const [refundTarget, setRefundTarget] = useState<TransactionRow | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const activeOperatorsCount = tvConfigs.filter((c) => c.is_active).length;
  const activePackagesCount = tvPackages.filter((p) => p.is_active).length;
  const totalVolume = recentTransactions
    .filter((t) => t.status === "successful")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  function handleSaveConfig(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingConfig) return;
    const formData = new FormData(e.currentTarget);
    const payload = {
      operatorCode: editingConfig.operator_code,
      operatorName: editingConfig.operator_name,
      primaryProvider: formData.get("primaryProvider") as string,
      fallbackProvider: (formData.get("fallbackProvider") as string) || null,
      convenienceFee: Number(formData.get("convenienceFee")),
      cashbackPercentage: Number(formData.get("cashbackPercentage")),
      isActive: formData.get("isActive") === "true",
      maintenanceNotice: (formData.get("maintenanceNotice") as string) || null,
    };

    startTransition(async () => {
      const res = await saveCableTvConfig(payload);
      if (res.ok) {
        setFeedback({ type: "success", text: res.message });
        setEditingConfig(null);
      } else {
        setFeedback({ type: "error", text: res.message || "Failed to save configuration." });
      }
    });
  }

  function handleBulkUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {};
    const primaryProvider = formData.get("primaryProvider");
    const fallbackProvider = formData.get("fallbackProvider");
    const convenienceFee = formData.get("convenienceFee");
    const cashbackPercentage = formData.get("cashbackPercentage");

    if (primaryProvider) payload.primaryProvider = primaryProvider;
    if (fallbackProvider) payload.fallbackProvider = fallbackProvider;
    if (convenienceFee !== "") payload.convenienceFee = Number(convenienceFee);
    if (cashbackPercentage !== "") payload.cashbackPercentage = Number(cashbackPercentage);

    startTransition(async () => {
      const res = await bulkUpdateCableTvConfigs(payload);
      if (res.ok) {
        setFeedback({ type: "success", text: res.message });
        setIsBulkModalOpen(false);
      } else {
        setFeedback({ type: "error", text: res.message || "Failed to bulk update." });
      }
    });
  }

  function handleSavePackage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload = {
      id: editingPackage?.id,
      operatorCode: formData.get("operatorCode") as string,
      packageCode: (formData.get("packageCode") as string).trim(),
      name: (formData.get("name") as string).trim(),
      price: Number(formData.get("price")),
      durationMonths: Number(formData.get("durationMonths") || 1),
      sortOrder: Number(formData.get("sortOrder") || 0),
      isActive: formData.get("isActive") === "true",
    };

    startTransition(async () => {
      const res = await saveCableTvPackage(payload);
      if (res.ok) {
        setFeedback({ type: "success", text: res.message });
        setEditingPackage(null);
        setIsNewPackageModalOpen(false);
      } else {
        setFeedback({ type: "error", text: res.message || "Failed to save package." });
      }
    });
  }

  function handleDeletePackage(id: string) {
    startTransition(async () => {
      const res = await deleteCableTvPackage({ id });
      setDeleteTarget(null);
      if (res.ok) {
        setFeedback({ type: "success", text: res.message });
      } else {
        setFeedback({ type: "error", text: res.message || "Failed to delete package." });
      }
    });
  }

  async function handleTestVerification(e: React.FormEvent) {
    e.preventDefault();
    if (!testSmartcard.trim()) return;
    setVerifying(true);
    setVerifyResult(null);

    try {
      const res = await fetch("/api/services/tv/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operator: testOperator,
          smartcardNumber: testSmartcard.trim(),
        }),
      });
      const data = await res.json();
      setVerifyResult(data);
    } catch (err) {
      setVerifyResult({
        valid: false,
        error: err instanceof Error ? err.message : "Network failure while testing verification.",
      });
    } finally {
      setVerifying(false);
    }
  }

  function handleExecuteRefund() {
    if (!refundTarget || !refundReason.trim()) return;
    startTransition(async () => {
      const res = await adminRefundTransaction({
        transactionId: refundTarget.id,
        reason: refundReason.trim(),
      });
      if (res.ok) {
        setFeedback({ type: "success", text: res.message });
        setRefundTarget(null);
        setRefundReason("");
      } else {
        setFeedback({ type: "error", text: res.message || "Could not execute refund." });
      }
    });
  }

  const filteredPackages = tvPackages.filter((p) => {
    if (packageFilterOperator !== "all" && p.operator_code !== packageFilterOperator) return false;
    if (packageSearch) {
      const q = packageSearch.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.package_code.toLowerCase().includes(q);
    }
    return true;
  });

  const providerOptions = providers.map((p) => ({ value: p.slug, label: p.name }));
  const packageCount = (code: string) => tvPackages.filter((p) => p.operator_code === code).length;
  const tabs = [
    { id: "operators", label: "Operators", icon: "tv" },
    { id: "packages", label: "Bouquets", icon: "catalogue", count: tvPackages.length },
    { id: "tester", label: "Smartcard test", icon: "search" },
    { id: "transactions", label: "Transactions", icon: "transactions", count: recentTransactions.length },
  ] as const;

  return (
    <div className={styles.workspacePage}>
      <AdminPageHeader
        title="Cable TV"
        actions={
          <>
            <button type="button" className={styles.secondaryButton} onClick={() => setIsBulkModalOpen(true)}>
              <AdminIcon name="sliders" />
              Bulk switch
            </button>
            <button type="button" className={styles.primaryButton} onClick={() => { setEditingPackage(null); setIsNewPackageModalOpen(true); }}>
              <AdminIcon name="plus" />
              Add bouquet
            </button>
          </>
        }
        stats={[
          { icon: "tv", tone: "slate", value: activeOperatorsCount, label: "Operators", note: `of ${tvConfigs.length} live` },
          { icon: "catalogue", tone: "emerald", value: activePackagesCount, label: "Bouquets", note: "visible to customers" },
          { icon: "transactions", tone: "amber", value: recentTransactions.length, label: "Subscriptions", note: "recent orders" },
          { icon: "wallet", tone: "primary", value: `₦${totalVolume.toLocaleString("en-NG")}`, label: "Volume", note: "successful payments" },
        ]}
      />

      {feedback ? <AdminFeedback tone={feedback.type} text={feedback.text} onClose={() => setFeedback(null)} /> : null}

      <section className={styles.workspacePanel}>
        <div className={styles.directoryHeader}>
          <div className={styles.directoryTop}>
            <div className={styles.directoryTitle}>
              <h2>{tabs.find((tab) => tab.id === activeTab)?.label}</h2>
              {activeTab === "packages" ? <span className={styles.countPill}>{filteredPackages.length}</span> : null}
              {activeTab === "operators" ? <span className={styles.countPill}>{tvConfigs.length}</span> : null}
              {activeTab === "transactions" ? <span className={styles.countPill}>{recentTransactions.length}</span> : null}
            </div>
            {activeTab === "packages" ? (
              <div className={styles.directoryTools}>
                <label className={styles.directorySearch}>
                  <AdminIcon name="search" />
                  <input placeholder="Search bouquets..." value={packageSearch} onChange={(e) => setPackageSearch(e.target.value)} />
                </label>
                <AdminSelect
                  value={packageFilterOperator}
                  onValueChange={setPackageFilterOperator}
                  options={[
                    { value: "all", label: `All operators (${tvPackages.length})` },
                    ...OPERATOR_OPTIONS.map((o) => ({ value: o.value, label: `${o.label} (${packageCount(o.value)})` })),
                  ]}
                />
              </div>
            ) : null}
          </div>
        <nav className={styles.segmentedTabs} aria-label="Cable TV sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={styles.networkUnderlineTab}
              data-active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              <AdminIcon name={tab.icon} />
              {tab.label}
              {"count" in tab ? <span className={styles.countPill}>{tab.count}</span> : null}
            </button>
          ))}
        </nav>
        </div>

        {activeTab === "operators" ? (
          <div className={styles.operatorGrid}>
            {tvConfigs.map((config) => (
              <article key={config.operator_code} className={styles.operatorCard} data-active={config.is_active}>
                <header>
                  <div>
                    <span className={styles.subtleChip}>{config.operator_code}</span>
                    <h3>{config.operator_name}</h3>
                  </div>
                  <span className={styles.statusPill} data-status={config.is_active ? "live" : "paused"}>
                    {config.is_active ? "Live" : "Maintenance"}
                  </span>
                </header>
                <dl className={styles.operatorStats}>
                  <div><dt>Primary</dt><dd>{config.primary_provider}</dd></div>
                  <div><dt>Fallback</dt><dd>{config.fallback_provider || "None"}</dd></div>
                  <div><dt>Fee</dt><dd>₦{config.convenience_fee}</dd></div>
                  <div><dt>Cashback</dt><dd className={styles.cellAccent}>{config.cashback_percentage}%</dd></div>
                </dl>
                {config.maintenance_notice ? <p className={styles.noticeLine}>{config.maintenance_notice}</p> : null}
                <button type="button" className={styles.secondaryButton} onClick={() => setEditingConfig(config)}>
                  <AdminIcon name="sliders" />
                  Configure
                </button>
              </article>
            ))}
          </div>
        ) : null}

        {activeTab === "packages" ? (
          <>
            <div className={styles.workspaceTableWrap}>
              <table className={styles.workspaceTable}>
                <thead>
                  <tr>
                    <th>Bouquet</th>
                    <th data-align="right">Price</th>
                    <th>Duration</th>
                    <th data-align="center">Order</th>
                    <th>Status</th>
                    <th data-align="right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPackages.length > 0 ? (
                    filteredPackages.map((pkg) => (
                      <tr key={pkg.id}>
                        <td>
                          <div className={styles.cellTitle}>
                            <strong>{pkg.name}</strong>
                            <small>{OPERATOR_OPTIONS.find((o) => o.value === pkg.operator_code)?.label ?? pkg.operator_code} · {pkg.package_code}</small>
                          </div>
                        </td>
                        <td data-align="right" className={styles.cellPlain}>₦{pkg.price.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</td>
                        <td className={styles.cellPlain}>
                          {pkg.duration_months === 0 ? "1 week" : pkg.duration_months === 1 ? "1 month" : `${pkg.duration_months} months`}
                        </td>
                        <td data-align="center" className={styles.cellPlain}>{pkg.sort_order}</td>
                        <td>
                          <span className={styles.statusPill} data-status={pkg.is_active ? "active" : "disabled"}>
                            {pkg.is_active ? "Active" : "Hidden"}
                          </span>
                        </td>
                        <td data-align="right">
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              className={styles.iconAction}
                              aria-label="Edit bouquet"
                              data-tip="Edit bouquet"
                              onClick={() => {
                                setEditingPackage(pkg);
                                setIsNewPackageModalOpen(true);
                              }}
                            >
                              <AdminIcon name="pencil" />
                            </button>
                            <button
                              type="button"
                              className={`${styles.iconAction} ${styles.iconActionDanger}`}
                              aria-label="Delete bouquet"
                              data-tip="Delete bouquet"
                              onClick={() => setDeleteTarget({ id: pkg.id, name: pkg.name })}
                            >
                              <AdminIcon name="trash" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>
                        <div className={styles.tableEmpty}>
                          <AdminIcon name="catalogue" />
                          <strong>No bouquets match</strong>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <footer className={styles.workspaceFooter}>
              <span>Showing {filteredPackages.length} of {tvPackages.length} bouquets</span>
            </footer>
          </>
        ) : null}

        {activeTab === "tester" ? (
          <div className={styles.testerPane}>
            <form onSubmit={handleTestVerification} className={styles.modalForm}>
              <div className={styles.formGrid}>
                <div className={styles.fieldGroup}>
                  <span>Operator</span>
                  <AdminSelect value={testOperator} onValueChange={setTestOperator} options={OPERATOR_OPTIONS} />
                </div>
                <label className={styles.fieldGroup}>
                  <span>Smartcard / IUC</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="1023456789"
                    value={testSmartcard}
                    onChange={(e) => setTestSmartcard(e.target.value)}
                    required
                  />
                </label>
              </div>
              <div>
                <button type="submit" disabled={verifying || !testSmartcard.trim()} className={styles.primaryButton}>
                  {verifying ? "Verifying…" : "Verify"}
                </button>
              </div>
            </form>

            {verifyResult ? (
              <div className={styles.verifyResult} data-valid={Boolean(verifyResult.valid)}>
                <strong>
                  <AdminIcon name={verifyResult.valid ? "check" : "alert"} />
                  {verifyResult.valid ? "Smartcard verified" : "Verification failed"}
                </strong>
                {verifyResult.valid ? (
                  <div className={styles.summaryList}>
                    <div><span>Name</span><strong>{String(verifyResult.customerName || "—")}</strong></div>
                    <div><span>Bouquet</span><strong>{String(verifyResult.currentBouquet || "—")}</strong></div>
                    <div><span>Due date</span><strong>{String(verifyResult.dueDate || "—")}</strong></div>
                    <div><span>Operator</span><strong>{String(verifyResult.operatorName || verifyResult.operator || "—")}</strong></div>
                  </div>
                ) : null}
                {verifyResult.error ? <p>{String(verifyResult.error)}</p> : null}
                <details className={styles.rawPayload}>
                  <summary>Raw response</summary>
                  <pre>{JSON.stringify(verifyResult, null, 2)}</pre>
                </details>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === "transactions" ? (
          <div className={styles.workspaceTableWrap}>
            <table className={styles.workspaceTable}>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Bouquet</th>
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
                          <strong>{tx.metadata?.customerName || tx.user?.phone || tx.user?.email || "Customer"}</strong>
                          <small>Smartcard {tx.destination}</small>
                        </div>
                      </td>
                      <td>
                        <div className={styles.cellTitle}>
                          <strong>{tx.metadata?.packageName || tx.metadata?.operatorName || "Subscription"}</strong>
                          <small>{tx.internal_reference}</small>
                        </div>
                      </td>
                      <td data-align="right" className={styles.cellPlain}>
                        ₦{Number(tx.amount).toLocaleString("en-NG")}
                      </td>
                      <td><span className={styles.statusPill} data-status={tx.status}>{tx.status}</span></td>
                      <td>
                        <div className={styles.cellValue}>
                          <strong>{new Date(tx.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</strong>
                          <small>{new Date(tx.created_at).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" })}</small>
                        </div>
                      </td>
                      <td data-align="right">
                        {tx.status !== "failed" ? (
                          <button
                            type="button"
                            className={styles.textAction}
                            onClick={() => {
                              setRefundTarget(tx);
                              setRefundReason("");
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
                        <AdminIcon name="tv" />
                        <strong>No subscriptions yet</strong>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {editingConfig ? (
        <AdminModal
          eyebrow="Operator"
          title={editingConfig.operator_name}
          onClose={() => setEditingConfig(null)}
          footer={
            <>
              <button type="button" className={styles.secondaryButton} onClick={() => setEditingConfig(null)}>Cancel</button>
              <button type="submit" form="tv-config-form" disabled={isPending} className={styles.primaryButton}>
                {isPending ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <form id="tv-config-form" onSubmit={handleSaveConfig} className={styles.modalForm}>
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <span>Primary provider</span>
                <AdminSelect name="primaryProvider" defaultValue={editingConfig.primary_provider} options={providerOptions} searchable />
              </div>
              <div className={styles.fieldGroup}>
                <span>Fallback provider</span>
                <AdminSelect
                  name="fallbackProvider"
                  defaultValue={editingConfig.fallback_provider || ""}
                  options={[{ value: "", label: "No fallback" }, ...providerOptions]}
                  searchable
                />
              </div>
              <label className={styles.fieldGroup}>
                <span>Convenience fee (₦)</span>
                <input type="number" step="0.01" name="convenienceFee" defaultValue={editingConfig.convenience_fee} />
              </label>
              <label className={styles.fieldGroup}>
                <span>Cashback %</span>
                <input type="number" step="0.01" name="cashbackPercentage" defaultValue={editingConfig.cashback_percentage} />
              </label>
              <label className={`${styles.fieldGroup} ${styles.formSpan}`}>
                <span>Offline notice</span>
                <input
                  type="text"
                  name="maintenanceNotice"
                  placeholder="Shown to customers while offline"
                  defaultValue={editingConfig.maintenance_notice || ""}
                />
              </label>
            </div>
            <AdminSwitch name="isActive" label="Live" defaultChecked={editingConfig.is_active} />
          </form>
        </AdminModal>
      ) : null}

      {isBulkModalOpen ? (
        <AdminModal
          eyebrow="All operators"
          title="Bulk switch"
          onClose={() => setIsBulkModalOpen(false)}
          width={460}
          footer={
            <>
              <button type="button" className={styles.secondaryButton} onClick={() => setIsBulkModalOpen(false)}>Cancel</button>
              <button type="submit" form="tv-bulk-form" disabled={isPending} className={styles.primaryButton}>
                {isPending ? "Applying…" : "Apply to all"}
              </button>
            </>
          }
        >
          <form id="tv-bulk-form" onSubmit={handleBulkUpdate} className={styles.modalForm}>
            <p className={styles.modalText}>Applies to every operator. Leave a field empty to keep current values.</p>
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <span>Primary provider</span>
                <AdminSelect name="primaryProvider" defaultValue={providerOptions[0]?.value ?? ""} options={providerOptions} searchable />
              </div>
              <div className={styles.fieldGroup}>
                <span>Fallback provider</span>
                <AdminSelect name="fallbackProvider" defaultValue="" options={[{ value: "", label: "Keep current" }, ...providerOptions]} searchable />
              </div>
              <label className={styles.fieldGroup}>
                <span>Convenience fee (₦)</span>
                <input type="number" step="0.01" name="convenienceFee" placeholder="Keep current" />
              </label>
              <label className={styles.fieldGroup}>
                <span>Cashback %</span>
                <input type="number" step="0.01" name="cashbackPercentage" placeholder="Keep current" />
              </label>
            </div>
          </form>
        </AdminModal>
      ) : null}

      {isNewPackageModalOpen ? (
        <AdminModal
          eyebrow="Bouquet"
          title={editingPackage ? editingPackage.name : "New bouquet"}
          onClose={() => setIsNewPackageModalOpen(false)}
          footer={
            <>
              <button type="button" className={styles.secondaryButton} onClick={() => setIsNewPackageModalOpen(false)}>Cancel</button>
              <button type="submit" form="tv-package-form" disabled={isPending} className={styles.primaryButton}>
                {isPending ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <form id="tv-package-form" onSubmit={handleSavePackage} className={styles.modalForm}>
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <span>Operator</span>
                <AdminSelect name="operatorCode" defaultValue={editingPackage?.operator_code || "dstv"} options={OPERATOR_OPTIONS} />
              </div>
              <label className={styles.fieldGroup}>
                <span>Variation code</span>
                <input type="text" name="packageCode" placeholder="dstv-compact" defaultValue={editingPackage?.package_code || ""} required />
              </label>
              <label className={`${styles.fieldGroup} ${styles.formSpan}`}>
                <span>Name</span>
                <input type="text" name="name" placeholder="DStv Compact" defaultValue={editingPackage?.name || ""} required />
              </label>
            </div>
            <div className={styles.formGrid} data-cols="3">
              <label className={styles.fieldGroup}>
                <span>Price (₦)</span>
                <input type="number" step="0.01" name="price" defaultValue={editingPackage?.price || 1000} required />
              </label>
              <label className={styles.fieldGroup}>
                <span>Months</span>
                <input type="number" name="durationMonths" defaultValue={editingPackage?.duration_months ?? 1} />
              </label>
              <label className={styles.fieldGroup}>
                <span>Order</span>
                <input type="number" name="sortOrder" defaultValue={editingPackage?.sort_order ?? 0} />
              </label>
            </div>
            <AdminSwitch name="isActive" label="Visible to customers" defaultChecked={editingPackage?.is_active ?? true} />
          </form>
        </AdminModal>
      ) : null}

      {deleteTarget ? (
        <AdminConfirm
          title="Delete bouquet?"
          body={<>Removes <strong>{deleteTarget.name}</strong> from the catalogue.</>}
          confirmLabel="Delete"
          pending={isPending}
          onConfirm={() => handleDeletePackage(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
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
              <button type="button" disabled={isPending || !refundReason.trim()} onClick={handleExecuteRefund} className={styles.dangerButton}>
                {isPending ? "Refunding…" : `Refund ₦${Number(refundTarget.amount).toLocaleString()}`}
              </button>
            </>
          }
        >
          <p className={styles.modalText}>
            Credits <strong>₦{Number(refundTarget.amount).toLocaleString("en-NG")}</strong> back to the customer and logs it.
          </p>
          <div className={styles.summaryList}>
            <div><span>Reference</span><strong>{refundTarget.internal_reference}</strong></div>
            <div><span>Smartcard</span><strong>{refundTarget.destination}</strong></div>
          </div>
          <label className={styles.fieldGroup}>
            <span>Reason (logged)</span>
            <textarea
              rows={3}
              placeholder="Decoder not activated after timeout"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              required
            />
          </label>
        </AdminModal>
      ) : null}
    </div>
  );
}
