"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/page-pattern";
import AdminIcon from "../../(console)/admin-icon";
import AdminSelect from "../../(console)/admin-select";
import { AdminConfirm, AdminFeedback, AdminModal, AdminSwitch } from "../../(console)/admin-ui";
import styles from "../../admin.module.css";
import { FilterPicker, UrlList, UrlSelect, statusOptionsFrom } from "@/components/admin/list-controls";
import { rechargeDeliveryLabel } from "@/lib/recharge-cards";
import ExportAction from "../../(console)/export-action";
import RechargeCardCatalogue, { type RechargeOffer } from "@/components/admin/recharge-card-catalogue";
import RechargeCardReviews, { type RechargeReview } from "@/components/admin/recharge-card-reviews";
import type { PurchaseFilter } from "@/lib/admin/purchases";
import {
  saveAirtimeRoute,
  deleteAirtimeRoute,
  adminRefundTransaction,
} from "../../(console)/actions";

type RouteRow = {
  id: string;
  network: string;
  mode: string;
  min_amount: number;
  max_amount: number;
  primary_provider: string;
  fallback_provider: string | null;
  discount_percentage: number;
  cashback_percentage: number;
  priority: number;
  is_active: boolean;
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
  created_at: string;
  mode?: string;
  network?: string;
  quantity?: number;
  unitAmount?: number;
  pinCount?: number;
  deliveryStatus?: string;
  discount_amount?: number;
  cashback_amount?: number;
  user?: { id: string; name?: string; phone?: string | null; email?: string | null } | null;
};

type RechargeSummary = { orders: number; ready: number; pending: number; review: number; refunded: number; pins: number; sales: number; savings: number; cashback: number; margin: number; held: number };

const NETWORK_OPTIONS = [
  { value: "all", label: "All networks" },
  { value: "mtn", label: "MTN" },
  { value: "airtel", label: "Airtel" },
  { value: "glo", label: "Glo" },
  { value: "9mobile", label: "9mobile" },
];

const MODE_OPTIONS = [
  { value: "all", label: "VTU & e-PIN" },
  { value: "vtu", label: "VTU top-up" },
  { value: "epin", label: "Recharge PIN" },
];

const PROVIDER_OPTIONS = [
  { value: "maskawasub", label: "Maskawasub" },
  { value: "smeplug", label: "SMEPlug" },
  { value: "vtpass", label: "VTPass" },
  { value: "pairgate", label: "PairGate" },
];

const FALLBACK_OPTIONS = [
  { value: "", label: "No fallback" },
  ...PROVIDER_OPTIONS.filter((p) => p.value !== "pairgate"),
];

const modeLabel = (mode: string) => (mode === "epin" ? "Recharge PIN" : mode === "vtu" ? "VTU" : "All modes");

export default function AirtimeWorkspace({
  routes,
  providers,
  recentTransactions,
  purchaseFilter,
  totalRoutesCount,
  purchaseMode = "",
  rechargeSummary,
  rechargeOffers = [],
  catalogueAvailable = true,
  rechargeReviews = [],
}: {
  routes: RouteRow[];
  providers: ProviderRow[];
  recentTransactions: TransactionRow[];
  purchaseFilter?: PurchaseFilter;
  totalRoutesCount: number;
  purchaseMode?: string;
  rechargeSummary?: RechargeSummary | null;
  rechargeOffers?: RechargeOffer[];
  catalogueAvailable?: boolean;
  rechargeReviews?: RechargeReview[] | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Modal / Drawer state for adding or editing a route rule
  const [editingRule, setEditingRule] = useState<Partial<RouteRow> | null>(null);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);

  // Chargeback / Refund modal state
  const [refundTarget, setRefundTarget] = useState<TransactionRow | null>(null);
  const [refundReason, setRefundReason] = useState("");

  // Filters
  const [filterNetwork, setFilterNetwork] = useState<string>("all");
  const [filterMode, setFilterMode] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const routeState = (route: RouteRow) => (route.is_active ? "active" : "paused");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const filteredRoutes = routes.filter((r) => {
    if (filterStatus && routeState(r) !== filterStatus) return false;
    if (filterNetwork !== "all" && r.network !== "all" && r.network !== filterNetwork) return false;
    if (filterMode !== "all" && r.mode !== "all" && r.mode !== filterMode) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        r.primary_provider.toLowerCase().includes(q) ||
        (r.fallback_provider && r.fallback_provider.toLowerCase().includes(q)) ||
        r.network.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const registeredProviders = new Set(providers.map((provider) => provider.slug));
  const routeProviders = PROVIDER_OPTIONS.map((provider) => ({ ...provider, disabled: registeredProviders.size > 0 && !registeredProviders.has(provider.value) }));

  function handleSaveRule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload = {
      id: editingRule?.id,
      network: formData.get("network") as string,
      mode: formData.get("mode") as string,
      minAmount: Number(formData.get("minAmount")),
      maxAmount: Number(formData.get("maxAmount")),
      primaryProvider: formData.get("primaryProvider") as string,
      fallbackProvider: (formData.get("fallbackProvider") as string) || null,
      discountPercentage: Number(formData.get("discountPercentage")),
      cashbackPercentage: Number(formData.get("cashbackPercentage")),
      priority: Number(formData.get("priority")),
      isActive: formData.get("isActive") === "true",
    };

    startTransition(async () => {
      setFeedback(null);
      const res = await saveAirtimeRoute(payload);
      if (res.ok) {
        setFeedback({ type: "success", text: res.message });
        setIsRuleModalOpen(false);
        setEditingRule(null);
      } else {
        setFeedback({ type: "error", text: res.message });
      }
    });
  }

  function handleDeleteRule(id: string) {
    startTransition(async () => {
      setFeedback(null);
      const res = await deleteAirtimeRoute({ id });
      setDeleteTarget(null);
      if (res.ok) {
        setFeedback({ type: "success", text: res.message });
      } else {
        setFeedback({ type: "error", text: res.message });
      }
    });
  }

  function handleToggleRule(rule: RouteRow) {
    startTransition(async () => {
      setFeedback(null);
      const res = await saveAirtimeRoute({
        id: rule.id,
        network: rule.network,
        mode: rule.mode,
        minAmount: rule.min_amount,
        maxAmount: rule.max_amount,
        primaryProvider: rule.primary_provider,
        fallbackProvider: rule.fallback_provider,
        discountPercentage: rule.discount_percentage,
        cashbackPercentage: rule.cashback_percentage,
        priority: rule.priority,
        isActive: !rule.is_active,
      });
      if (res.ok) {
        setFeedback({ type: "success", text: `Rule ${!rule.is_active ? "activated" : "paused"}.` });
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

  const openNewRule = () => {
    setEditingRule({
      network: "all",
      mode: "all",
      min_amount: 50,
      max_amount: 10000,
      primary_provider: "maskawasub",
      fallback_provider: "smeplug",
      discount_percentage: 2.5,
      cashback_percentage: 0.5,
      priority: 10,
      is_active: true,
    });
    setIsRuleModalOpen(true);
  };

  return (
    <div className={styles.workspacePage}>
      <AdminPageHeader
        title="Airtime & PINs"
        actions={
          <>
            <button type="button" className={styles.primaryButton} onClick={openNewRule}>
              <AdminIcon name="plus" />
              Add rule
            </button>
          </>
        }
      />

      {rechargeSummary ? <section className="rounded-[8px] border border-a-line bg-a-surface p-5 sm:p-6" aria-label="Recharge-card analytics, last 30 days">
        <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-[17px] font-semibold text-zinc-900">Recharge cards <span className="ml-2 text-[12px] font-normal text-zinc-500">30 days</span></h2><ExportAction source="recharge_card_operations" /></div>
        <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-5">
          <div><strong className="block text-[30px] font-semibold tracking-[-0.04em] text-zinc-950 tabular-nums">₦{Number(rechargeSummary.sales).toLocaleString("en-NG")}</strong><span className="text-[12.5px] text-zinc-500">{rechargeSummary.pins} PINs delivered · {rechargeSummary.ready} orders</span></div>
          <div className="flex-1" />
          <dl className="flex flex-wrap gap-x-7 gap-y-3 text-[12.5px]">
            {[['Held', `₦${Number(rechargeSummary.held).toLocaleString("en-NG")}`], ['Needs review', rechargeSummary.review], ['Discounts', `₦${Number(rechargeSummary.savings).toLocaleString("en-NG")}`], ['Cashback', `₦${Number(rechargeSummary.cashback).toLocaleString("en-NG")}`], ['Estimated margin', `₦${Number(rechargeSummary.margin).toLocaleString("en-NG")}`]].map(([label, value]) => <div key={label}><dt className="text-zinc-500">{label}</dt><dd className="mt-1 text-[16px] font-semibold text-zinc-900 tabular-nums">{value}</dd></div>)}
          </dl>
        </div>
      </section> : null}

      {feedback ? <AdminFeedback tone={feedback.type} text={feedback.text} onClose={() => setFeedback(null)} /> : null}

      <RechargeCardCatalogue offers={rechargeOffers} available={catalogueAvailable} />
      <RechargeCardReviews rows={rechargeReviews} />

      <section className={styles.workspacePanel}>
        <div className={styles.directoryHeader}>
          <div className={styles.directoryTop}>
            <div>
              <div className={styles.directoryTitle}>
                <h2>Range rules</h2>
                <span className={styles.countPill}>{filteredRoutes.length}</span>
              </div>
            </div>
            <div className={styles.directoryTools}>
              <label className={styles.directorySearch}>
                <AdminIcon name="search" />
                <input
                  placeholder="Search provider or network..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </label>
              <AdminSelect value={filterNetwork} options={NETWORK_OPTIONS} onValueChange={setFilterNetwork} />
              <AdminSelect value={filterMode} options={MODE_OPTIONS} onValueChange={setFilterMode} />
              <FilterPicker value={filterStatus} onChange={setFilterStatus} options={statusOptionsFrom(routes, routeState)} allLabel="All statuses" width={150} />
            </div>
          </div>
        </div>

        <div className={styles.workspaceTableWrap}>
          <table className={styles.workspaceTable}>
            <thead>
              <tr>
                <th>Network</th>
                <th>Amount range</th>
                <th>Providers</th>
                <th data-align="right">Discount</th>
                <th data-align="right">Cashback</th>
                <th data-align="center">Priority</th>
                <th>Status</th>
                <th data-align="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRoutes.length > 0 ? (
                filteredRoutes.map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      <div className={styles.cellTitle}>
                        <strong>{NETWORK_OPTIONS.find((n) => n.value === rule.network)?.label ?? rule.network}</strong>
                        <small>{modeLabel(rule.mode)}</small>
                      </div>
                    </td>
                    <td className={styles.cellPlain}>
                      ₦{Number(rule.min_amount).toLocaleString()} – ₦{Number(rule.max_amount).toLocaleString()}
                    </td>
                    <td>
                      <div className={styles.cellTitle}>
                        <strong>{PROVIDER_OPTIONS.find((p) => p.value === rule.primary_provider)?.label ?? rule.primary_provider}</strong>
                        <small>
                          {rule.fallback_provider
                            ? `Fallback · ${PROVIDER_OPTIONS.find((p) => p.value === rule.fallback_provider)?.label ?? rule.fallback_provider}`
                            : "No fallback"}
                        </small>
                      </div>
                    </td>
                    <td data-align="right" className={styles.cellPlain}>{rule.discount_percentage}%</td>
                    <td data-align="right" className={styles.cellPlain}>{rule.cashback_percentage}%</td>
                    <td data-align="center" className={styles.cellPlain}>{rule.priority}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleToggleRule(rule)}
                        disabled={isPending}
                        className={`${styles.statusPill} ${styles.statusToggle}`}
                        data-status={rule.is_active ? "active" : "paused"}
                        aria-label={rule.is_active ? "Pause rule" : "Activate rule"}
                      >
                        {rule.is_active ? "Active" : "Paused"}
                      </button>
                    </td>
                    <td data-align="right">
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.iconAction}
                          aria-label="Edit rule"
                          data-tip="Edit rule"
                          onClick={() => {
                            setEditingRule(rule);
                            setIsRuleModalOpen(true);
                          }}
                        >
                          <AdminIcon name="pencil" />
                        </button>
                        <button
                          type="button"
                          className={`${styles.iconAction} ${styles.iconActionDanger}`}
                          aria-label="Delete rule"
                          data-tip="Delete rule"
                          onClick={() => setDeleteTarget(rule.id)}
                        >
                          <AdminIcon name="trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>
                    <div className={styles.tableEmpty}>
                      <AdminIcon name="phone" />
                      <strong>No rules match</strong>
                      <span>Change the filters or add a rule.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className={styles.workspaceFooter}>
          <span>Showing {filteredRoutes.length} of {totalRoutesCount} rules</span>
        </footer>
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
          <UrlList values={{ purchases: purchaseFilter?.status ?? "", purchaseMode }}>
            <div className="flex flex-wrap gap-2">
              <UrlSelect param="purchaseMode" leadingIcon="filter" ariaLabel="Purchase type" options={[{ value: "", label: "All purchases" }, { value: "epin", label: "Recharge cards" }, { value: "vtu", label: "Airtime top-ups" }]} />
              {purchaseFilter ? <UrlSelect param="purchases" leadingIcon="checkCircle" ariaLabel="Purchase status" options={[{ value: "", label: `All statuses (${purchaseFilter.total})` }, ...purchaseFilter.options.map((option) => ({ value: option.value, label: `${option.label} (${option.count})` }))]} /> : null}
            </div>
          </UrlList>
        </div>

        <div className={styles.workspaceTableWrap}>
          <table className={styles.workspaceTable}>
            <thead>
              <tr>
                <th>Purchase</th>
                <th>Reference</th>
                <th data-align="right">Amount</th>
                <th>Status</th>
                <th>Date</th>
                <th data-align="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {recentTransactions.length > 0 ? (
                recentTransactions.map((tx) => {
                  const when = new Date(tx.created_at);
                  return (
                    <tr key={tx.id}>
                      <td>
                        <div className={styles.cellTitle}>
                          <strong>{tx.mode === "epin" ? `${tx.network?.toUpperCase()} · ${tx.quantity} × ₦${Number(tx.unitAmount).toLocaleString("en-NG")}` : tx.destination}</strong>
                          <small>{tx.user?.name || tx.user?.email || tx.user?.phone || "Customer"}</small>
                        </div>
                      </td>
                      <td><Link className={styles.textAction} href={`/admin/transactions/${tx.id}`}>{tx.internal_reference}</Link></td>
                      <td data-align="right" className={styles.cellPlain}><div className={styles.cellValue}><strong>₦{Number(tx.amount).toLocaleString("en-NG")}</strong>{Number(tx.discount_amount) > 0 ? <small>−₦{Number(tx.discount_amount).toLocaleString("en-NG")} discount</small> : null}</div></td>
                      <td><div className={styles.cellValue}><span className={styles.statusPill} data-status={tx.status}>{tx.status}</span>{tx.mode === "epin" ? <small>{rechargeDeliveryLabel(tx.deliveryStatus ?? "awaiting_provider")} · {tx.pinCount}/{tx.quantity}</small> : null}</div></td>
                      <td>
                        <div className={styles.cellValue}>
                          <strong>{when.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</strong>
                          <small>{when.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" })}</small>
                        </div>
                      </td>
                      <td data-align="right">
                        {tx.mode === "epin" ? <Link className={styles.textAction} href={`/admin/transactions/${tx.id}`}>{["pending", "processing", "initiated"].includes(tx.status) ? "Resolve" : "View"}</Link> : !["failed", "refunded", "reversed"].includes(tx.status) ? (
                          <button
                            type="button"
                            className={styles.textAction}
                            onClick={() => {
                              setRefundTarget(tx);
                              setRefundReason(`Airtime not received for ${tx.internal_reference}`);
                            }}
                          >
                            Refund
                          </button>
                        ) : (
                          <span className={styles.cellMuted}>Refunded</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className={styles.tableEmpty}>
                      <AdminIcon name="transactions" />
                      <strong>No purchases yet</strong>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isRuleModalOpen ? (
        <AdminModal
          eyebrow="Airtime routing"
          title={editingRule?.id ? "Edit rule" : "New rule"}
          onClose={() => setIsRuleModalOpen(false)}
          width={560}
          footer={
            <>
              <button type="button" className={styles.secondaryButton} onClick={() => setIsRuleModalOpen(false)}>Cancel</button>
              <button type="submit" form="airtime-rule-form" disabled={isPending} className={styles.primaryButton}>
                {isPending ? "Saving…" : "Save rule"}
              </button>
            </>
          }
        >
          <form id="airtime-rule-form" onSubmit={handleSaveRule} className={styles.modalForm}>
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <span>Network</span>
                <AdminSelect name="network" defaultValue={editingRule?.network || "all"} options={NETWORK_OPTIONS} />
              </div>
              <div className={styles.fieldGroup}>
                <span>Mode</span>
                <AdminSelect name="mode" value={editingRule?.mode || "all"} onValueChange={(mode) => setEditingRule((rule) => ({ ...rule, mode, ...(mode === "epin" ? { primary_provider: "maskawasub", fallback_provider: null } : {}) }))} options={MODE_OPTIONS} />
              </div>
              <label className={styles.fieldGroup}>
                <span>Min amount (₦)</span>
                <input type="number" name="minAmount" defaultValue={editingRule?.min_amount ?? 50} min={50} max={500000} required />
              </label>
              <label className={styles.fieldGroup}>
                <span>Max amount (₦)</span>
                <input type="number" name="maxAmount" defaultValue={editingRule?.max_amount ?? 10000} min={50} max={500000} required />
              </label>
              <div className={styles.fieldGroup}>
                <span>Primary provider</span>
                <AdminSelect name="primaryProvider" value={editingRule?.primary_provider || "maskawasub"} onValueChange={(primary_provider) => setEditingRule((rule) => ({ ...rule, primary_provider }))} options={editingRule?.mode === "epin" ? routeProviders.filter((provider) => provider.value === "maskawasub") : routeProviders} />
              </div>
              <div className={styles.fieldGroup}>
                <span>Fallback provider</span>
                <AdminSelect name="fallbackProvider" value={editingRule?.fallback_provider ?? ""} onValueChange={(fallback_provider) => setEditingRule((rule) => ({ ...rule, fallback_provider }))} options={editingRule?.mode === "epin" ? [{ value: "", label: "No fallback" }] : FALLBACK_OPTIONS.filter((option) => option.value !== editingRule?.primary_provider)} />
              </div>
            </div>

            <div className={styles.formGrid} data-cols="3">
              <label className={styles.fieldGroup}>
                <span>Discount %</span>
                <input type="number" step="0.1" name="discountPercentage" defaultValue={editingRule?.discount_percentage ?? 2.5} min={0} max={20} />
              </label>
              <label className={styles.fieldGroup}>
                <span>Cashback %</span>
                <input type="number" step="0.1" name="cashbackPercentage" defaultValue={editingRule?.cashback_percentage ?? 0.5} min={0} max={10} />
              </label>
              <label className={styles.fieldGroup}>
                <span>Priority</span>
                <input type="number" name="priority" defaultValue={editingRule?.priority ?? 10} min={0} max={100} />
              </label>
            </div>

            <AdminSwitch name="isActive" label="Active" defaultChecked={editingRule?.is_active ?? true} />
          </form>
        </AdminModal>
      ) : null}

      {deleteTarget ? (
        <AdminConfirm
          title="Delete rule?"
          body="Traffic in this range will use the next matching rule."
          confirmLabel="Delete"
          pending={isPending}
          onConfirm={() => handleDeleteRule(deleteTarget)}
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
              <button type="submit" form="airtime-refund-form" disabled={isPending || !refundReason.trim()} className={styles.dangerButton}>
                {isPending ? "Refunding…" : `Refund ₦${Number(refundTarget.amount).toLocaleString()}`}
              </button>
            </>
          }
        >
          <form id="airtime-refund-form" onSubmit={handleRefundSubmit} className={styles.modalForm}>
            <p className={styles.modalText}>
              Marks the purchase as failed and credits <strong>₦{Number(refundTarget.amount).toLocaleString("en-NG")}</strong> back to the customer.
            </p>
            <div className={styles.summaryList}>
              <div><span>Reference</span><strong>{refundTarget.internal_reference}</strong></div>
              <div><span>Recipient</span><strong>{refundTarget.destination}</strong></div>
              <div><span>Amount</span><strong>₦{Number(refundTarget.amount).toLocaleString("en-NG")}</strong></div>
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
