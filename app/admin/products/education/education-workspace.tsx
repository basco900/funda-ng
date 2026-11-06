"use client";

import { useState, useTransition } from "react";
import { AdminPageHeader } from "@/components/admin/page-pattern";
import AdminIcon from "../../(console)/admin-icon";
import styles from "../../admin.module.css";
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
}: {
  educationConfigs: EducationConfigRow[];
  educationPackages: EducationPackageRow[];
  providers: ProviderRow[];
  recentTransactions: TransactionRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Active workspace tab
  const [activeTab, setActiveTab] = useState<"routing" | "packages" | "simulator" | "transactions">("routing");

  // Filter states
  const [filterExamBody, setFilterExamBody] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Edit exam config drawer state
  const [editingConfig, setEditingConfig] = useState<EducationConfigRow | null>(null);
  const [isConfigDrawerOpen, setIsConfigDrawerOpen] = useState(false);

  // Add/Edit package drawer state
  const [editingPackage, setEditingPackage] = useState<Partial<EducationPackageRow> | null>(null);
  const [isPackageDrawerOpen, setIsPackageDrawerOpen] = useState(false);

  // Refund modal state
  const [refundTarget, setRefundTarget] = useState<TransactionRow | null>(null);
  const [refundReason, setRefundReason] = useState("");

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

  const filteredPackages = educationPackages.filter((pkg) => {
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
    if (!confirm(`Switch primary API provider for ALL Exam Boards to ${newPrimary.toUpperCase()}?`)) return;
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
    if (!confirm("Are you sure you want to delete this package from the catalogue?")) return;
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

  return (
    <div className="w-full space-y-6 pb-16 font-sans text-slate-900">
      <AdminPageHeader
        title="Education & Exam PINs"
        stats={[
          { label: "Exam Bodies", value: `${activeConfigsCount} / ${educationConfigs.length}` },
          { label: "Packages", value: `${activePackagesCount} / ${educationPackages.length}` },
          { label: "Gateways", value: `${providers.filter((p) => p.status === "active").length} Live` },
          { label: "PIN Vault", value: "AES-GCM", tone: "success" },
        ]}
      />

      {/* Notification Banner */}
      {feedback && (
        <div
          className="flex items-center justify-between rounded-[8px] p-3 text-[12.5px] font-medium"
          style={{
            backgroundColor: feedback.type === "success" ? "#ecfdf5" : "#fef2f2",
            color: feedback.type === "success" ? "#065f46" : "#991b1b",
            border: `1px solid ${feedback.type === "success" ? "#a7f3d0" : "#fecaca"}`,
          }}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="font-bold text-inherit cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--admin-line)", marginBottom: "20px" }}>
        {[
          { key: "routing", label: "Exam Bodies & API Routing", icon: "provider" },
          { key: "packages", label: "PIN Packages & Pricing", icon: "catalogue" },
          { key: "simulator", label: "Live Tester / Simulator", icon: "pulse" },
          { key: "transactions", label: "Recent PIN Transactions & Refunds", icon: "transactions" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              padding: "10px 16px",
              border: "none",
              background: "transparent",
              borderBottom: activeTab === tab.key ? "2px solid #660033" : "2px solid transparent",
              color: activeTab === tab.key ? "#660033" : "var(--admin-muted)",
              fontWeight: activeTab === tab.key ? 700 : 500,
              fontSize: "13.5px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <AdminIcon name={tab.icon} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: EXAM BODIES & API ROUTING */}
      {activeTab === "routing" && (
        <section className={styles.workspacePanel}>
          <div className={styles.workspaceToolbar}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <h2>Exam Boards &amp; API Switcher</h2>
              <span className={styles.countPill}>{educationConfigs.length} Boards</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "12px", color: "var(--admin-muted)", fontWeight: 600 }}>Quick Global Switch:</span>
              <select
                style={{
                  height: "38px",
                  padding: "0 12px",
                  borderRadius: "10px",
                  border: "1px solid var(--admin-line)",
                  background: "var(--admin-surface)",
                  fontSize: "12.5px",
                  color: "var(--admin-ink)",
                  fontWeight: 600,
                }}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) handleBulkProviderChange(e.target.value);
                  e.target.value = "";
                }}
              >
                <option value="" disabled>Switch All Boards to...</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.slug}>{p.name} ({p.slug})</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.workspaceTableWrap}>
            <table className={styles.workspaceTable}>
              <thead>
                <tr>
                  <th>Exam Board</th>
                  <th>Primary API Provider</th>
                  <th>Fallback Failover Provider</th>
                  <th>Convenience Fee</th>
                  <th>Cashback</th>
                  <th style={{ textAlign: "center" }}>Profile Code Required</th>
                  <th style={{ textAlign: "center" }}>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {educationConfigs.map((config) => (
                  <tr key={config.exam_body}>
                    <td>
                      <div style={{ display: "grid", gap: "2px" }}>
                        <strong style={{ fontSize: "14px", color: "var(--admin-ink)" }}>{config.name}</strong>
                        <span style={{ fontSize: "12px", color: "var(--admin-muted)" }}>
                          Code: <strong style={{ color: "#660033" }}>{config.short_name}</strong>
                          {config.portal_url && (
                            <> • <a href={config.portal_url} target="_blank" rel="noopener noreferrer" style={{ color: "#660033" }}>Portal ↗</a></>
                          )}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={styles.subtleChip} style={{ fontWeight: 700 }}>
                        {config.primary_provider.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {config.fallback_provider ? (
                        <span className={styles.subtleChip} style={{ background: "#f8fafc", color: "#64748b" }}>
                          {config.fallback_provider.toUpperCase()}
                        </span>
                      ) : (
                        <span style={{ color: "var(--admin-faint)", fontSize: "12px" }}>None</span>
                      )}
                    </td>
                    <td>
                      <strong>₦{Number(config.convenience_fee || 0).toLocaleString("en-NG")}</strong>
                    </td>
                    <td>
                      <span style={{ color: "#059669", fontWeight: 700 }}>
                        {config.cashback_percentage}%
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {config.requires_profile_code ? (
                        <span className={styles.statusPill} style={{ background: "#eff6ff", color: "#1d4ed8", borderColor: "rgba(29, 78, 216, 0.2)" }}>
                          Yes (10 Digits)
                        </span>
                      ) : (
                        <span style={{ color: "var(--admin-faint)", fontSize: "12px" }}>No</span>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className={styles.statusPill} data-status={config.is_active ? "active" : "standby"}>
                        {config.is_active ? "Active" : "Paused"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        style={{ height: "34px", padding: "0 12px", fontSize: "12px" }}
                        onClick={() => {
                          setEditingConfig(config);
                          setIsConfigDrawerOpen(true);
                        }}
                      >
                        Edit Routing
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 2: PACKAGES & PIN CATALOGUE */}
      {activeTab === "packages" && (
        <section className={styles.workspacePanel}>
          <div className={styles.workspaceToolbar}>
            <label>
              <AdminIcon name="search" />
              <input
                placeholder="Search packages, PIN type, exam code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <select
                style={{
                  height: "40px",
                  padding: "0 12px",
                  borderRadius: "10px",
                  border: "1px solid var(--admin-line)",
                  fontSize: "12.5px",
                  background: "var(--admin-surface)",
                  color: "var(--admin-ink)",
                }}
                value={filterExamBody}
                onChange={(e) => setFilterExamBody(e.target.value)}
              >
                <option value="all">All Exam Boards</option>
                <option value="waec">WAEC</option>
                <option value="neco">NECO</option>
                <option value="jamb">JAMB</option>
                <option value="nabteb">NABTEB</option>
                <option value="nbais">NBAIS</option>
              </select>
            </div>
          </div>

          <div className={styles.workspaceTableWrap}>
            <table className={styles.workspaceTable}>
              <thead>
                <tr>
                  <th>Exam Board &amp; Code</th>
                  <th>Package Name</th>
                  <th>Type</th>
                  <th style={{ textAlign: "right" }}>Selling Price</th>
                  <th style={{ textAlign: "right" }}>Cost Price</th>
                  <th style={{ textAlign: "right" }}>Margin</th>
                  <th style={{ textAlign: "center" }}>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPackages.map((pkg) => {
                  const profit = pkg.price - pkg.cost_price;
                  const profitPct = pkg.cost_price > 0 ? ((profit / pkg.cost_price) * 100).toFixed(1) : "—";
                  return (
                    <tr key={pkg.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: "6px",
                              fontWeight: 700,
                              fontSize: "11px",
                              textTransform: "uppercase",
                              background: "rgba(102, 0, 51, 0.08)",
                              color: "#660033",
                            }}
                          >
                            {pkg.exam_body}
                          </span>
                          <code style={{ fontSize: "12px" }}>{pkg.package_code}</code>
                        </div>
                      </td>
                      <td>
                        <strong style={{ fontSize: "13.5px", color: "var(--admin-ink)" }}>{pkg.name}</strong>
                        {pkg.description && (
                          <div style={{ fontSize: "11.5px", color: "var(--admin-muted)" }}>{pkg.description}</div>
                        )}
                      </td>
                      <td>
                        <span className={styles.subtleChip}>
                          {pkg.service_type.replace("_", " ").toUpperCase()}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <strong style={{ fontSize: "14px", color: "var(--admin-ink)" }}>
                          ₦{pkg.price.toLocaleString("en-NG")}
                        </strong>
                      </td>
                      <td style={{ textAlign: "right", color: "var(--admin-muted)" }}>
                        ₦{pkg.cost_price.toLocaleString("en-NG")}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span style={{ color: profit >= 0 ? "#059669" : "#dc2626", fontWeight: 700, fontSize: "12.5px" }}>
                          +₦{profit.toLocaleString("en-NG")} ({profitPct}%)
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span className={styles.statusPill} data-status={pkg.is_active ? "active" : "standby"}>
                          {pkg.is_active ? "Active" : "Paused"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className={styles.rowActionGroup}>
                          <button
                            type="button"
                            className={styles.ghostButton}
                            onClick={() => {
                              setEditingPackage(pkg);
                              setIsPackageDrawerOpen(true);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={styles.ghostButton}
                            style={{ color: "#dc2626" }}
                            onClick={() => handleDeletePackage(pkg.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 3: LIVE SIMULATOR */}
      {activeTab === "simulator" && (
        <section className={styles.workspacePanel} style={{ padding: "28px" }}>
          <div style={{ maxWidth: "680px" }}>
            <span className={styles.pageEyebrow}>Diagnostic Simulator</span>
            <h2 style={{ fontSize: "20px", fontWeight: 700, margin: "6px 0 8px" }}>
              Test Exam PIN Generation &amp; JAMB Profile Validation
            </h2>
            <p style={{ color: "var(--admin-muted)", fontSize: "13.5px", marginBottom: "20px" }}>
              Simulate live API calls across WAEC, NECO, and JAMB gateways before rolling out to students and institutions.
            </p>

            <div style={{ display: "grid", gap: "16px" }}>
              <div className={styles.fieldGroup}>
                <label>Select Examination Body</label>
                <select
                  value={testExamBody}
                  onChange={(e) => {
                    setTestExamBody(e.target.value);
                    const matching = educationPackages.filter((p) => p.exam_body === e.target.value);
                    if (matching.length > 0) setTestPackageCode(matching[0].package_code);
                  }}
                >
                  <option value="waec">WAEC (West African Examinations Council)</option>
                  <option value="neco">NECO (National Examinations Council)</option>
                  <option value="jamb">JAMB (Joint Admissions &amp; Matriculation Board)</option>
                  <option value="nabteb">NABTEB (National Business &amp; Technical Exams)</option>
                  <option value="nbais">NBAIS (National Board for Arabic &amp; Islamic Studies)</option>
                </select>
              </div>

              {testExamBody === "jamb" && (
                <div className={styles.fieldGroup}>
                  <label>Candidate 10-Digit JAMB Profile Code</label>
                  <input
                    value={testProfileCode}
                    onChange={(e) => setTestProfileCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="Enter 10-digit Profile Code"
                  />
                  <small style={{ color: "var(--admin-muted)", fontSize: "11.5px" }}>
                    Simulates instant real-time lookup with JAMB central candidate database.
                  </small>
                </div>
              )}

              <div className={styles.fieldGroup}>
                <label>Recipient Candidate Phone Number</label>
                <input
                  value={testCandidatePhone}
                  onChange={(e) => setTestCandidatePhone(e.target.value)}
                  placeholder="08012345678"
                />
              </div>

              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleRunSimulator}
                disabled={testingBusy}
                style={{ height: "46px", marginTop: "8px" }}
              >
                {testingBusy ? "Validating & Querying Gateways..." : `Test ${testExamBody.toUpperCase()} Gateway Response →`}
              </button>

              {testResult && (
                <div
                  style={{
                    padding: "20px",
                    borderRadius: "14px",
                    marginTop: "16px",
                    background: testResult.success ? "#ecfdf5" : "#fef2f2",
                    border: `1px solid ${testResult.success ? "#a7f3d0" : "#fecaca"}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span style={{ fontSize: "18px" }}>{testResult.success ? "✅" : "❌"}</span>
                    <strong style={{ color: testResult.success ? "#065f46" : "#991b1b", fontSize: "14px" }}>
                      {testResult.message}
                    </strong>
                  </div>
                  {testResult.candidateName && (
                    <div style={{ fontSize: "13px", color: "#065f46", marginBottom: "6px" }}>
                      Candidate Name: <strong>{testResult.candidateName}</strong>
                    </div>
                  )}
                  {testResult.pin && (
                    <div style={{ background: "#ffffff", padding: "12px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.06)", marginTop: "10px" }}>
                      <div style={{ fontSize: "11.5px", color: "#64748b", fontWeight: 700 }}>GENERATED EXAM PIN:</div>
                      <div style={{ fontSize: "20px", fontWeight: 800, color: "#660033", letterSpacing: "1px", margin: "4px 0" }}>
                        {testResult.pin}
                      </div>
                      {testResult.serial && (
                        <div style={{ fontSize: "12px", color: "#334155" }}>
                          Serial Number: <strong>{testResult.serial}</strong>
                        </div>
                      )}
                      {testResult.instructions && (
                        <div style={{ fontSize: "12px", color: "#64748b", marginTop: "6px" }}>
                          Instructions: {testResult.instructions}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* TAB 4: RECENT TRANSACTIONS & REFUNDS */}
      {activeTab === "transactions" && (
        <section className={styles.workspacePanel}>
          <div className={styles.workspaceToolbar}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <h2>Recent Education Purchases</h2>
              <span className={styles.countPill}>{recentTransactions.length} Recorded</span>
            </div>
          </div>

          <div className={styles.workspaceTableWrap}>
            <table className={styles.workspaceTable}>
              <thead>
                <tr>
                  <th>Transaction Ref</th>
                  <th>Customer</th>
                  <th>Exam / Package</th>
                  <th>Destination (Phone/Profile)</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Purchased Time</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.length > 0 ? (
                  recentTransactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>
                        <code style={{ fontSize: "12px" }}>{tx.internal_reference}</code>
                      </td>
                      <td>
                        <strong>{tx.user?.phone || tx.user?.email || "Customer"}</strong>
                      </td>
                      <td>
                        <span className={styles.subtleChip}>
                          {String(tx.metadata?.packageName || tx.metadata?.examBody || "Education PIN").toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <strong>{tx.destination}</strong>
                      </td>
                      <td>
                        <strong style={{ fontSize: "13.5px" }}>
                          ₦{Number(tx.amount).toLocaleString("en-NG")}
                        </strong>
                      </td>
                      <td>
                        <span className={styles.statusPill} data-status={tx.status}>
                          {tx.status}
                        </span>
                      </td>
                      <td>
                        <time style={{ color: "var(--admin-muted)", fontSize: "12px" }}>
                          {new Date(tx.created_at).toLocaleString("en-NG", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {tx.status === "successful" && (
                          <button
                            type="button"
                            className={styles.ghostButton}
                            style={{ color: "#dc2626", fontWeight: 700 }}
                            onClick={() => {
                              setRefundTarget(tx);
                              setRefundReason("Failed PIN validation / Candidate issue");
                            }}
                          >
                            Chargeback / Refund
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8}>
                      <div className={styles.tableEmpty}>
                        <AdminIcon name="transactions" />
                        <strong>No Education Transactions Yet</strong>
                        <span>Purchases made on the frontend will appear here with live audit details.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* DRAWER: EDIT EXAM CONFIG ROUTING */}
      {isConfigDrawerOpen && editingConfig && (
        <div className={styles.productDrawerBackdrop} onClick={() => setIsConfigDrawerOpen(false)}>
          <div className={styles.productDrawer} onClick={(e) => e.stopPropagation()}>
            <header>
              <div>
                <span>Exam Board API Routing</span>
                <h2>{editingConfig.name} ({editingConfig.short_name})</h2>
              </div>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => setIsConfigDrawerOpen(false)}
              >
                ✕
              </button>
            </header>

            <form onSubmit={handleSaveConfig} style={{ display: "grid", gap: "18px", padding: "24px" }}>
              <div className={styles.fieldGroup}>
                <label>Primary API Provider</label>
                <select name="primaryProvider" defaultValue={editingConfig.primary_provider}>
                  {providers.map((p) => (
                    <option key={p.id} value={p.slug}>{p.name} ({p.slug})</option>
                  ))}
                </select>
              </div>

              <div className={styles.fieldGroup}>
                <label>Fallback Provider (Automatic Failover)</label>
                <select name="fallbackProvider" defaultValue={editingConfig.fallback_provider || ""}>
                  <option value="">None (No Failover)</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.slug}>{p.name} ({p.slug})</option>
                  ))}
                </select>
              </div>

              <div className={styles.drawerGrid2}>
                <div className={styles.fieldGroup}>
                  <label>Convenience Fee (₦)</label>
                  <input
                    type="number"
                    name="convenienceFee"
                    defaultValue={editingConfig.convenience_fee}
                    min="0"
                    step="50"
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label>Cashback Percentage (%)</label>
                  <input
                    type="number"
                    name="cashbackPercentage"
                    defaultValue={editingConfig.cashback_percentage}
                    min="0"
                    max="100"
                    step="0.5"
                  />
                </div>
              </div>

              <div className={styles.drawerGrid2}>
                <div className={styles.fieldGroup}>
                  <label>Board Operational Status</label>
                  <select name="isActive" defaultValue={String(editingConfig.is_active)}>
                    <option value="true">Active (Purchases Allowed)</option>
                    <option value="false">Paused / Inactive</option>
                  </select>
                </div>
                <div className={styles.fieldGroup}>
                  <label>Requires Candidate Profile Code</label>
                  <select name="requiresProfileCode" defaultValue={String(editingConfig.requires_profile_code)}>
                    <option value="false">No (Direct Phone/Email PIN)</option>
                    <option value="true">Yes (e.g. JAMB Profile Code)</option>
                  </select>
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <label>Official Portal URL</label>
                <input
                  type="url"
                  name="portalUrl"
                  defaultValue={editingConfig.portal_url || ""}
                  placeholder="https://www.waecdirect.org"
                />
              </div>

              <div className={styles.fieldGroup}>
                <label>Usage Instructions (Shown on Receipt)</label>
                <textarea
                  name="instructions"
                  defaultValue={editingConfig.instructions || ""}
                  placeholder="Visit official portal to view result..."
                  rows={3}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label>Maintenance / Downtime Notice (Optional)</label>
                <input
                  type="text"
                  name="maintenanceNotice"
                  defaultValue={editingConfig.maintenance_notice || ""}
                  placeholder="Leave empty if service is healthy"
                />
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setIsConfigDrawerOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={isPending}
                  style={{ flex: 1 }}
                >
                  {isPending ? "Saving..." : "Save Board Configuration"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRAWER: ADD / EDIT PACKAGE */}
      {isPackageDrawerOpen && editingPackage && (
        <div className={styles.productDrawerBackdrop} onClick={() => setIsPackageDrawerOpen(false)}>
          <div className={styles.productDrawer} onClick={(e) => e.stopPropagation()}>
            <header>
              <div>
                <span>Package Catalogue Studio</span>
                <h2>{editingPackage.id ? "Edit Examination Package" : "Add Examination Package"}</h2>
              </div>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => setIsPackageDrawerOpen(false)}
              >
                ✕
              </button>
            </header>

            <form onSubmit={handleSavePackage} style={{ display: "grid", gap: "18px", padding: "24px" }}>
              <div className={styles.drawerGrid2}>
                <div className={styles.fieldGroup}>
                  <label>Exam Board</label>
                  <select name="examBody" defaultValue={editingPackage.exam_body || "waec"}>
                    <option value="waec">WAEC</option>
                    <option value="neco">NECO</option>
                    <option value="jamb">JAMB</option>
                    <option value="nabteb">NABTEB</option>
                    <option value="nbais">NBAIS</option>
                  </select>
                </div>
                <div className={styles.fieldGroup}>
                  <label>Package Code (Unique)</label>
                  <input
                    type="text"
                    name="packageCode"
                    defaultValue={editingPackage.package_code || ""}
                    placeholder="e.g. waec-result"
                    required
                  />
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <label>Display Name</label>
                <input
                  type="text"
                  name="name"
                  defaultValue={editingPackage.name || ""}
                  placeholder="e.g. WAEC Result Checker e-PIN"
                  required
                />
              </div>

              <div className={styles.fieldGroup}>
                <label>Description (Optional)</label>
                <input
                  type="text"
                  name="description"
                  defaultValue={editingPackage.description || ""}
                  placeholder="Short explanation shown to student"
                />
              </div>

              <div className={styles.fieldGroup}>
                <label>Service Type</label>
                <select name="serviceType" defaultValue={editingPackage.service_type || "result_checker"}>
                  <option value="result_checker">Result Checker PIN</option>
                  <option value="registration">Registration Scratch Card</option>
                  <option value="utme">JAMB UTME e-PIN</option>
                  <option value="de">JAMB Direct Entry (DE)</option>
                  <option value="screening">Post-UTME / Screening</option>
                </select>
              </div>

              <div className={styles.drawerGrid2}>
                <div className={styles.fieldGroup}>
                  <label>Customer Price (₦)</label>
                  <input
                    type="number"
                    name="price"
                    defaultValue={editingPackage.price || 3500}
                    min="100"
                    step="50"
                    required
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label>Gateway Cost Price (₦)</label>
                  <input
                    type="number"
                    name="costPrice"
                    defaultValue={editingPackage.cost_price || 3200}
                    min="0"
                    step="50"
                  />
                </div>
              </div>

              <div className={styles.drawerGrid2}>
                <div className={styles.fieldGroup}>
                  <label>Sort Order</label>
                  <input
                    type="number"
                    name="sortOrder"
                    defaultValue={editingPackage.sort_order ?? 1}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label>Status</label>
                  <select name="isActive" defaultValue={String(editingPackage.is_active ?? true)}>
                    <option value="true">Active (Live in App)</option>
                    <option value="false">Paused</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setIsPackageDrawerOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={isPending}
                  style={{ flex: 1 }}
                >
                  {isPending ? "Saving..." : "Save Package"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADMIN REFUND / CHARGEBACK */}
      {refundTarget && (
        <div className={styles.commandBackdrop} onClick={() => setRefundTarget(null)}>
          <div
            className={styles.commandPalette}
            style={{ width: "min(520px, 94vw)", padding: "24px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className={styles.pageEyebrow} style={{ color: "#dc2626" }}>Admin Intervention</span>
            <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "6px 0 12px" }}>
              Refund Education Transaction
            </h2>
            <p style={{ color: "var(--admin-muted)", fontSize: "13.5px" }}>
              Instantly credit <strong>₦{Number(refundTarget.amount).toLocaleString("en-NG")}</strong> back to customer{" "}
              <strong>{refundTarget.user?.phone || refundTarget.user?.email || "Wallet"}</strong>.
            </p>

            <form onSubmit={handleRefundSubmit} style={{ display: "grid", gap: "14px", marginTop: "16px" }}>
              <div className={styles.fieldGroup}>
                <label>Refund Reason (Required for Audit Trail)</label>
                <input
                  type="text"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="e.g. Invalid PIN code issued by provider"
                  required
                />
              </div>

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setRefundTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  style={{ background: "#dc2626", borderColor: "#dc2626" }}
                  disabled={isPending}
                >
                  {isPending ? "Refunding..." : "Confirm & Execute Refund"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

