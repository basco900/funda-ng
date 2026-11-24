"use client";

import { useState, useTransition } from "react";
import { AdminPageHeader } from "@/components/admin/page-pattern";
import { AdminConfirm, AdminFeedback, AdminModal } from "../../(console)/admin-ui";
import AdminIcon from "../../(console)/admin-icon";
import AdminSelect from "../../(console)/admin-select";
import styles from "../../admin.module.css";
import { FilterPicker, PurchaseStatusFilter, statusOptionsFrom } from "@/components/admin/list-controls";
import type { PurchaseFilter } from "@/lib/admin/purchases";
import {
  saveEducationConfig,
  bulkUpdateEducationConfigs,
  saveEducationPackage,
  deleteEducationPackage,
  adminRefundTransaction,
} from "../../(console)/actions";

type EducationConfigRow = {
  exam_body: string;
  name: string;
  short_name: string;
  primary_provider: string;
  fallback_provider: string | null;
  convenience_fee: number;
  cashback_percentage: number;
  is_active: boolean;
  requires_profile_code: boolean;
  instructions: string | null;
  portal_url: string | null;
  maintenance_notice: string | null;
};

type EducationPackageRow = {
  id: string;
  exam_body: string;
  package_code: string;
  name: string;
  description: string | null;
  service_type: string;
  price: number;
  cost_price: number;
  is_active: boolean;
  sort_order: number;
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
  metadata?: Record<string, unknown> | null;
  created_at: string;
  user?: { id: string; phone?: string | null; email?: string | null } | null;
};

export default function EducationWorkspace({
  educationConfigs,
  educationPackages,
  providers,
  recentTransactions,
  purchaseFilter,
}: {
  educationConfigs: EducationConfigRow[];
  educationPackages: EducationPackageRow[];
  providers: ProviderRow[];
  recentTransactions: TransactionRow[];
  purchaseFilter?: PurchaseFilter;
}) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Active workspace tab
  const [activeTab, setActiveTab] = useState<"routing" | "packages" | "simulator" | "transactions">("routing");

  // Filter states
  const [filterExamBody, setFilterExamBody] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [packageStatus, setPackageStatus] = useState("");

  // Edit exam config drawer state
  const [editingConfig, setEditingConfig] = useState<EducationConfigRow | null>(null);
  const [isConfigDrawerOpen, setIsConfigDrawerOpen] = useState(false);

  // Add/Edit package drawer state
  const [editingPackage, setEditingPackage] = useState<Partial<EducationPackageRow> | null>(null);
  const [isPackageDrawerOpen, setIsPackageDrawerOpen] = useState(false);

  // Refund modal state
  const [refundTarget, setRefundTarget] = useState<TransactionRow | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [bulkTarget, setBulkTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EducationPackageRow | null>(null);

  // Live tester / simulator states
  const [testExamBody, setTestExamBody] = useState<string>("waec");
  const [testPackageCode, setTestPackageCode] = useState<string>("waec-result");
  const [testProfileCode, setTestProfileCode] = useState<string>("1048592849");
  const [testCandidatePhone, setTestCandidatePhone] = useState<string>("08012345678");
  const [testResult, setTestResult] = useState<{
    success: boolean;
    pin?: string;
    serial?: string;
    token?: string;
    candidateName?: string;
    instructions?: string;
    message: string;
  } | null>(null);
  const [testingBusy, setTestingBusy] = useState(false);

  const activeConfigsCount = educationConfigs.filter((c) => c.is_active).length;
  const activePackagesCount = educationPackages.filter((p) => p.is_active).length;

  const packageState = (pkg: EducationPackageRow) => (pkg.is_active ? "active" : "standby");
  const filteredPackages = educationPackages.filter((pkg) => {
    if (packageStatus && packageState(pkg) !== packageStatus) return false;
    if (filterExamBody !== "all" && pkg.exam_body !== filterExamBody) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        pkg.name.toLowerCase().includes(q) ||
        pkg.package_code.toLowerCase().includes(q) ||
        pkg.exam_body.toLowerCase().includes(q)
      );
    }
    return true;
  });

  function handleSaveConfig(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingConfig) return;
    const formData = new FormData(e.currentTarget);
    const payload = {
      examBody: editingConfig.exam_body,
      primaryProvider: formData.get("primaryProvider") as string,
      fallbackProvider: (formData.get("fallbackProvider") as string) || null,
      convenienceFee: Number(formData.get("convenienceFee")),
      cashbackPercentage: Number(formData.get("cashbackPercentage")),
      isActive: formData.get("isActive") === "true",
      requiresProfileCode: formData.get("requiresProfileCode") === "true",
      instructions: (formData.get("instructions") as string) || null,
      portalUrl: (formData.get("portalUrl") as string) || null,
      maintenanceNotice: (formData.get("maintenanceNotice") as string) || null,
    };

    startTransition(async () => {
      setFeedback(null);
      const res = await saveEducationConfig(payload);
      if (res.ok) {
        setFeedback({ type: "success", text: res.message });
        setIsConfigDrawerOpen(false);
        setEditingConfig(null);
      } else {
        setFeedback({ type: "error", text: res.message });
      }
    });
  }

  function handleBulkProviderChange(newPrimary: string) {
    setBulkTarget(null);
    startTransition(async () => {
      setFeedback(null);
      const res = await bulkUpdateEducationConfigs({ primaryProvider: newPrimary });
      if (res.ok) {
        setFeedback({ type: "success", text: res.message });
      } else {
        setFeedback({ type: "error", text: res.message });
      }
    });
  }

  function handleSavePackage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload = {
      id: editingPackage?.id,
      examBody: formData.get("examBody") as string,
      packageCode: formData.get("packageCode") as string,
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      serviceType: formData.get("serviceType") as string,
      price: Number(formData.get("price")),
      costPrice: Number(formData.get("costPrice")),
      sortOrder: Number(formData.get("sortOrder")),
      isActive: formData.get("isActive") === "true",
    };

    startTransition(async () => {
      setFeedback(null);
      const res = await saveEducationPackage(payload);
      if (res.ok) {
        setFeedback({ type: "success", text: res.message });
        setIsPackageDrawerOpen(false);
        setEditingPackage(null);
      } else {
        setFeedback({ type: "error", text: res.message });
      }
    });
  }

  function handleDeletePackage(id: string) {
    setDeleteTarget(null);
    startTransition(async () => {
      setFeedback(null);
      const res = await deleteEducationPackage({ id });
      if (res.ok) {
        setFeedback({ type: "success", text: res.message });
      } else {
        setFeedback({ type: "error", text: res.message });
      }
    });
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

  async function handleRunSimulator() {
    setTestingBusy(true);
    setTestResult(null);
    try {
      if (testExamBody === "jamb") {
        const verifyRes = await fetch("/api/services/education/verify-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileCode: testProfileCode, examType: "utme" }),
        });
        const verifyData = await verifyRes.json();
        if (verifyRes.ok && verifyData.valid) {
          setTestResult({
            success: true,
            pin: Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join(""),
            candidateName: verifyData.candidateName,
            instructions: "Take this 10-digit e-PIN and your Profile Code to any accredited JAMB CBT centre to complete registration.",
            message: `JAMB Profile verified for ${verifyData.candidateName}. Mock 10-digit e-PIN generated successfully.`,
          });
        } else {
          setTestResult({
            success: false,
            message: verifyData.error || verifyData.message || "Failed to verify JAMB profile code.",
          });
        }
      } else {
        // Generate simulated PIN
        const randomPin = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join("");
        const randomSerial = `${testExamBody.toUpperCase()}${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;
        setTestResult({
          success: true,
          pin: randomPin,
          serial: testExamBody === "neco" ? undefined : randomSerial,
          instructions: testExamBody === "waec" ? "Visit www.waecdirect.org to check your result." : testExamBody === "neco" ? "Visit result.neco.gov.ng and enter your token." : "Visit the official board portal to check results.",
          message: `Simulated ${testExamBody.toUpperCase()} PIN generated successfully.`,
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Simulator test failed.",
      });
    } finally {
      setTestingBusy(false);
    }
  }

  const providerOptions = providers.map((p) => ({ value: p.slug, label: p.name }));
  const providerName = (slug: string | null) => providers.find((p) => p.slug === slug)?.name ?? slug ?? "None";
  const EXAM_OPTIONS = [{ value: "waec", label: "WAEC" }, { value: "neco", label: "NECO" }, { value: "jamb", label: "JAMB" }, { value: "nabteb", label: "NABTEB" }, { value: "nbais", label: "NBAIS" }];
  const SERVICE_LABELS: Record<string, string> = { result_checker: "Result checker", registration: "Registration", utme: "UTME e-PIN", de: "Direct Entry", screening: "Screening" };
  const tabs = [
    { key: "routing", label: "Exam Boards", icon: "education", count: educationConfigs.length },
    { key: "packages", label: "Packages", icon: "catalogue", count: educationPackages.length },
    { key: "simulator", label: "Simulator", icon: "pulse" },
    { key: "transactions", label: "Transactions", icon: "transactions", count: recentTransactions.length },
  ] as const;
  const money = (value: number) => `₦${Number(value || 0).toLocaleString("en-NG")}`;

  return (
    <div className={styles.workspacePage}>
      <AdminPageHeader
        title="Education"
        actions={
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => {
              setEditingPackage({});
              setIsPackageDrawerOpen(true);
            }}
          >
            <AdminIcon name="plus" />
            Add package
          </button>
        }
        stats={[
          { icon: "education", tone: "primary", value: `${activeConfigsCount} of ${educationConfigs.length}`, label: "Boards live" },
          { icon: "catalogue", tone: "emerald", value: activePackagesCount, label: "Active packages" },
          { icon: "provider", tone: "slate", value: providers.filter((p) => p.status === "active").length, label: "Gateways" },
          { icon: "transactions", tone: "amber", value: recentTransactions.length, label: "Recent purchases" },
        ]}
      />

      {feedback ? <AdminFeedback tone={feedback.type} text={feedback.text} onClose={() => setFeedback(null)} /> : null}

      <section className={styles.workspacePanel}>
        <div className={styles.directoryHeader} data-tabbed>
          <nav className={styles.segmentedTabs} aria-label="Education sections">
            {tabs.map((tab) => (
              <button key={tab.key} type="button" className={styles.networkUnderlineTab} data-active={activeTab === tab.key} onClick={() => setActiveTab(tab.key)}>
                <AdminIcon name={tab.icon} />
                {tab.label}
                {"count" in tab ? <span className={styles.countPill}>{tab.count}</span> : null}
              </button>
            ))}
          </nav>
          {activeTab === "routing" ? (
            <div className={styles.directoryTools}>
              <AdminSelect value="" placeholder="Switch every board to…" options={providerOptions} onValueChange={(value) => value && setBulkTarget(value)} />
            </div>
          ) : null}
          {activeTab === "packages" ? (
            <div className={styles.directoryTools}>
              <label className={styles.directorySearch}>
                <AdminIcon name="search" />
                <input placeholder="Search packages" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </label>
              <AdminSelect value={filterExamBody} onValueChange={setFilterExamBody} options={[{ value: "all", label: "All boards" }, ...EXAM_OPTIONS]} />
              <FilterPicker value={packageStatus} onChange={setPackageStatus} options={statusOptionsFrom(educationPackages, packageState)} allLabel="All statuses" width={150} />
            </div>
          ) : null}
          {activeTab === "transactions" && purchaseFilter ? <PurchaseStatusFilter filter={purchaseFilter} /> : null}
        </div>

        {activeTab === "routing" ? (
          <div className={styles.workspaceTableWrap}>
            <table className={styles.workspaceTable}>
              <thead>
                <tr>
                  <th>Board</th>
                  <th>Providers</th>
                  <th data-align="right">Fee</th>
                  <th data-align="right">Cashback</th>
                  <th>Profile code</th>
                  <th>Status</th>
                  <th data-align="right">Action</th>
                </tr>
              </thead>
              <tbody>
                {educationConfigs.map((config) => (
                  <tr key={config.exam_body}>
                    <td>
                      <div className={styles.cellTitle}>
                        <strong>{config.short_name}</strong>
                        <small>{config.name}</small>
                      </div>
                    </td>
                    <td>
                      <div className={styles.cellTitle}>
                        <strong>{providerName(config.primary_provider)}</strong>
                        <small>{config.fallback_provider ? `Fallback · ${providerName(config.fallback_provider)}` : "No fallback"}</small>
                      </div>
                    </td>
                    <td data-align="right" className={styles.cellPlain}>{money(config.convenience_fee)}</td>
                    <td data-align="right" className={styles.cellPlain}>{config.cashback_percentage}%</td>
                    <td className={styles.cellPlain}>{config.requires_profile_code ? "Required" : "—"}</td>
                    <td>
                      <span className={styles.statusPill} data-status={config.is_active ? "active" : "paused"}>
                        {config.is_active ? "Active" : "Paused"}
                      </span>
                    </td>
                    <td data-align="right">
                      <div className={styles.rowActions}>
                        {config.portal_url ? (
                          <a href={config.portal_url} target="_blank" rel="noopener noreferrer" className={styles.iconAction} aria-label="Open portal" data-tip="Open portal">
                            <AdminIcon name="external" />
                          </a>
                        ) : null}
                        <button
                          type="button"
                          className={styles.iconAction}
                          aria-label="Configure"
                          data-tip="Configure"
                          onClick={() => {
                            setEditingConfig(config);
                            setIsConfigDrawerOpen(true);
                          }}
                        >
                          <AdminIcon name="pencil" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {activeTab === "packages" ? (
          <>
            <div className={styles.workspaceTableWrap}>
              <table className={styles.workspaceTable}>
                <thead>
                  <tr>
                    <th>Package</th>
                    <th>Type</th>
                    <th data-align="right">Price</th>
                    <th data-align="right">Cost</th>
                    <th data-align="right">Margin</th>
                    <th>Status</th>
                    <th data-align="right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPackages.length ? (
                    filteredPackages.map((pkg) => {
                      const profit = pkg.price - pkg.cost_price;
                      return (
                        <tr key={pkg.id}>
                          <td>
                            <div className={styles.cellTitle}>
                              <strong>{pkg.name}</strong>
                              <small>{pkg.exam_body.toUpperCase()} · {pkg.package_code}</small>
                            </div>
                          </td>
                          <td className={styles.cellPlain}>{SERVICE_LABELS[pkg.service_type] ?? pkg.service_type.replaceAll("_", " ")}</td>
                          <td data-align="right" className={styles.cellPlain}>{money(pkg.price)}</td>
                          <td data-align="right" className={styles.cellMuted}>{money(pkg.cost_price)}</td>
                          <td data-align="right">
                            <span className={profit >= 0 ? styles.profitText : styles.cellAccent}>{money(profit)}</span>
                          </td>
                          <td>
                            <span className={styles.statusPill} data-status={pkg.is_active ? "active" : "paused"}>
                              {pkg.is_active ? "Active" : "Paused"}
                            </span>
                          </td>
                          <td data-align="right">
                            <div className={styles.rowActions}>
                              <button
                                type="button"
                                className={styles.iconAction}
                                aria-label="Edit package"
                                data-tip="Edit"
                                onClick={() => {
                                  setEditingPackage(pkg);
                                  setIsPackageDrawerOpen(true);
                                }}
                              >
                                <AdminIcon name="pencil" />
                              </button>
                              <button type="button" className={`${styles.iconAction} ${styles.iconActionDanger}`} aria-label="Delete package" data-tip="Delete" onClick={() => setDeleteTarget(pkg)}>
                                <AdminIcon name="trash" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7}>
                        <div className={styles.tableEmpty}>
                          <AdminIcon name="catalogue" />
                          <strong>No Packages Match</strong>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <footer className={styles.workspaceFooter}>
              <span>Showing {filteredPackages.length} of {educationPackages.length} packages</span>
            </footer>
          </>
        ) : null}

        {activeTab === "simulator" ? (
          <div className={styles.testerPane}>
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <span>Exam board</span>
                <AdminSelect
                  value={testExamBody}
                  onValueChange={(value) => {
                    setTestExamBody(value);
                    const matching = educationPackages.filter((p) => p.exam_body === value);
                    if (matching.length > 0) setTestPackageCode(matching[0].package_code);
                  }}
                  options={EXAM_OPTIONS}
                />
              </div>
              <label className={styles.fieldGroup}>
                <span>Candidate phone</span>
                <input value={testCandidatePhone} onChange={(e) => setTestCandidatePhone(e.target.value)} placeholder="08012345678" inputMode="tel" />
              </label>
              {testExamBody === "jamb" ? (
                <label className={`${styles.fieldGroup} ${styles.formSpan}`}>
                  <span>JAMB profile code</span>
                  <input value={testProfileCode} onChange={(e) => setTestProfileCode(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10 digits" inputMode="numeric" />
                </label>
              ) : null}
            </div>
            <div>
              <button type="button" className={styles.primaryButton} onClick={handleRunSimulator} disabled={testingBusy}>
                {testingBusy ? "Testing…" : `Test ${testExamBody.toUpperCase()}`}
              </button>
            </div>
            {testResult ? (
              <div className={styles.verifyResult} data-valid={testResult.success}>
                <strong>
                  <AdminIcon name={testResult.success ? "check" : "alert"} />
                  {testResult.message}
                </strong>
                {testResult.candidateName || testResult.pin ? (
                  <div className={styles.summaryList}>
                    {testResult.candidateName ? <div><span>Candidate</span><strong>{testResult.candidateName}</strong></div> : null}
                    {testResult.pin ? <div><span>PIN</span><strong>{testResult.pin}</strong></div> : null}
                    {testResult.serial ? <div><span>Serial</span><strong>{testResult.serial}</strong></div> : null}
                  </div>
                ) : null}
                {testResult.instructions ? <p>{testResult.instructions}</p> : null}
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
                  <th>Package</th>
                  <th data-align="right">Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th data-align="right">Action</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.length ? (
                  recentTransactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>
                        <div className={styles.cellTitle}>
                          <strong>{tx.user?.phone || tx.user?.email || "Customer"}</strong>
                          <small>{tx.destination}</small>
                        </div>
                      </td>
                      <td>
                        <div className={styles.cellTitle}>
                          <strong>{String(tx.metadata?.packageName || tx.metadata?.examBody || "Education PIN")}</strong>
                          <small>{tx.internal_reference}</small>
                        </div>
                      </td>
                      <td data-align="right" className={styles.cellPlain}>{money(tx.amount)}</td>
                      <td><span className={styles.statusPill} data-status={tx.status}>{tx.status}</span></td>
                      <td>
                        <div className={styles.cellValue}>
                          <strong>{new Date(tx.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</strong>
                          <small>{new Date(tx.created_at).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" })}</small>
                        </div>
                      </td>
                      <td data-align="right">
                        {tx.status === "successful" ? (
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
                          <span className={styles.cellMuted}>—</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <div className={styles.tableEmpty}>
                        <AdminIcon name="transactions" />
                        <strong>No Purchases Yet</strong>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {isConfigDrawerOpen && editingConfig ? (
        <AdminModal
          eyebrow="Exam board"
          title={editingConfig.name}
          onClose={() => setIsConfigDrawerOpen(false)}
          footer={
            <>
              <button type="button" className={styles.secondaryButton} onClick={() => setIsConfigDrawerOpen(false)}>Cancel</button>
              <button type="submit" form="education-config-form" disabled={isPending} className={styles.primaryButton}>
                {isPending ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <form id="education-config-form" onSubmit={handleSaveConfig} className={styles.modalForm}>
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <span>Primary provider</span>
                <AdminSelect name="primaryProvider" defaultValue={editingConfig.primary_provider} options={providerOptions} />
              </div>
              <div className={styles.fieldGroup}>
                <span>Fallback provider</span>
                <AdminSelect name="fallbackProvider" defaultValue={editingConfig.fallback_provider || ""} options={[{ value: "", label: "No fallback" }, ...providerOptions]} />
              </div>
              <label className={styles.fieldGroup}>
                <span>Convenience fee (₦)</span>
                <input type="number" name="convenienceFee" defaultValue={editingConfig.convenience_fee} min="0" step="50" />
              </label>
              <label className={styles.fieldGroup}>
                <span>Cashback %</span>
                <input type="number" name="cashbackPercentage" defaultValue={editingConfig.cashback_percentage} min="0" max="100" step="0.5" />
              </label>
              <div className={styles.fieldGroup}>
                <span>Status</span>
                <AdminSelect name="isActive" defaultValue={String(editingConfig.is_active)} options={[{ value: "true", label: "Active" }, { value: "false", label: "Paused" }]} />
              </div>
              <div className={styles.fieldGroup}>
                <span>Profile code</span>
                <AdminSelect name="requiresProfileCode" defaultValue={String(editingConfig.requires_profile_code)} options={[{ value: "false", label: "Not required" }, { value: "true", label: "Required" }]} />
              </div>
              <label className={`${styles.fieldGroup} ${styles.formSpan}`}>
                <span>Portal URL</span>
                <input type="url" name="portalUrl" defaultValue={editingConfig.portal_url || ""} placeholder="https://www.waecdirect.org" />
              </label>
              <label className={`${styles.fieldGroup} ${styles.formSpan}`}>
                <span>Receipt instructions</span>
                <textarea name="instructions" defaultValue={editingConfig.instructions || ""} placeholder="Visit the official portal to view your result" rows={3} />
              </label>
              <label className={`${styles.fieldGroup} ${styles.formSpan}`}>
                <span>Offline notice</span>
                <input type="text" name="maintenanceNotice" defaultValue={editingConfig.maintenance_notice || ""} placeholder="Shown to customers while paused" />
              </label>
            </div>
          </form>
        </AdminModal>
      ) : null}

      {isPackageDrawerOpen && editingPackage ? (
        <AdminModal
          eyebrow="Package"
          title={editingPackage.id ? editingPackage.name ?? "Edit package" : "New package"}
          onClose={() => setIsPackageDrawerOpen(false)}
          footer={
            <>
              <button type="button" className={styles.secondaryButton} onClick={() => setIsPackageDrawerOpen(false)}>Cancel</button>
              <button type="submit" form="education-package-form" disabled={isPending} className={styles.primaryButton}>
                {isPending ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <form id="education-package-form" onSubmit={handleSavePackage} className={styles.modalForm}>
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <span>Exam board</span>
                <AdminSelect name="examBody" defaultValue={editingPackage.exam_body || "waec"} options={EXAM_OPTIONS} />
              </div>
              <label className={styles.fieldGroup}>
                <span>Package code</span>
                <input type="text" name="packageCode" defaultValue={editingPackage.package_code || ""} placeholder="waec-result" required />
              </label>
              <label className={`${styles.fieldGroup} ${styles.formSpan}`}>
                <span>Name</span>
                <input type="text" name="name" defaultValue={editingPackage.name || ""} placeholder="WAEC Result Checker" required />
              </label>
              <label className={`${styles.fieldGroup} ${styles.formSpan}`}>
                <span>Description</span>
                <input type="text" name="description" defaultValue={editingPackage.description || ""} placeholder="Shown to the student" />
              </label>
              <div className={`${styles.fieldGroup} ${styles.formSpan}`}>
                <span>Type</span>
                <AdminSelect name="serviceType" defaultValue={editingPackage.service_type || "result_checker"} options={Object.entries(SERVICE_LABELS).map(([value, label]) => ({ value, label }))} />
              </div>
            </div>
            <div className={styles.formGrid} data-cols="3">
              <label className={styles.fieldGroup}>
                <span>Price (₦)</span>
                <input type="number" name="price" defaultValue={editingPackage.price || 3500} min="100" step="50" required />
              </label>
              <label className={styles.fieldGroup}>
                <span>Cost (₦)</span>
                <input type="number" name="costPrice" defaultValue={editingPackage.cost_price || 3200} min="0" step="50" />
              </label>
              <label className={styles.fieldGroup}>
                <span>Order</span>
                <input type="number" name="sortOrder" defaultValue={editingPackage.sort_order ?? 1} />
              </label>
            </div>
            <div className={styles.fieldGroup}>
              <span>Status</span>
              <AdminSelect name="isActive" defaultValue={String(editingPackage.is_active ?? true)} options={[{ value: "true", label: "Active" }, { value: "false", label: "Paused" }]} />
            </div>
          </form>
        </AdminModal>
      ) : null}

      {bulkTarget ? (
        <AdminConfirm
          tone="primary"
          title="Switch every board?"
          body={<>Routes all exam boards through <strong>{providerName(bulkTarget)}</strong>.</>}
          confirmLabel="Switch"
          pending={isPending}
          onConfirm={() => handleBulkProviderChange(bulkTarget)}
          onCancel={() => setBulkTarget(null)}
        />
      ) : null}

      {deleteTarget ? (
        <AdminConfirm
          title="Delete package?"
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
              <button type="submit" form="education-refund-form" disabled={isPending || !refundReason.trim()} className={styles.dangerButton}>
                {isPending ? "Refunding…" : `Refund ${money(refundTarget.amount)}`}
              </button>
            </>
          }
        >
          <form id="education-refund-form" onSubmit={handleRefundSubmit} className={styles.modalForm}>
            <p className={styles.modalText}>
              Credits <strong>{money(refundTarget.amount)}</strong> back to <strong>{refundTarget.user?.phone || refundTarget.user?.email || "the customer"}</strong> and logs it.
            </p>
            <label className={styles.fieldGroup}>
              <span>Reason (logged)</span>
              <textarea rows={3} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="Invalid PIN issued by provider" required />
            </label>
          </form>
        </AdminModal>
      ) : null}
    </div>
  );
}
