"use client";

import { useState, useTransition } from "react";
import { AdminPageHeader } from "@/components/admin/page-pattern";
import AdminIcon from "../../(console)/admin-icon";
import AdminSelect from "../../(console)/admin-select";
import { AdminConfirm, AdminFeedback, AdminModal, AdminSwitch } from "../../(console)/admin-ui";
import styles from "../../admin.module.css";
import { saveDiscountCoupon, deleteDiscountCoupon } from "../../(console)/actions";

type CouponRow = {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  min_purchase_amount: number;
  max_discount_amount: number | null;
  service_type: string;
  max_uses: number;
  times_used: number;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
};

const SERVICE_OPTIONS = [
  { value: "all", label: "All services" },
  { value: "airtime", label: "Airtime" },
  { value: "data", label: "Data" },
  { value: "electricity", label: "Electricity" },
];

const DISCOUNT_TYPE_OPTIONS = [
  { value: "percentage", label: "Percentage" },
  { value: "fixed", label: "Fixed amount" },
];

export default function CouponsWorkspace({
  coupons,
  totalCoupons,
}: {
  coupons: CouponRow[];
  totalCoupons: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [editingCoupon, setEditingCoupon] = useState<Partial<CouponRow> | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterService, setFilterService] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; code: string } | null>(null);

  const filteredCoupons = coupons.filter((c) => {
    if (filterService !== "all" && c.service_type !== "all" && c.service_type !== filterService) return false;
    if (searchQuery && !c.code.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const activeCount = coupons.filter((c) => c.is_active).length;
  const totalRedemptions = coupons.reduce((sum, c) => sum + (c.times_used || 0), 0);

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload = {
      id: editingCoupon?.id,
      code: (formData.get("code") as string).trim().toUpperCase(),
      discountType: formData.get("discountType") as "percentage" | "fixed",
      discountValue: Number(formData.get("discountValue")),
      minPurchaseAmount: Number(formData.get("minPurchaseAmount")),
      maxDiscountAmount: formData.get("maxDiscountAmount") ? Number(formData.get("maxDiscountAmount")) : null,
      serviceType: formData.get("serviceType") as "all" | "airtime" | "data" | "electricity",
      maxUses: Number(formData.get("maxUses")),
      expiresAt: (formData.get("expiresAt") as string) || null,
      isActive: formData.get("isActive") === "true",
    };

    startTransition(async () => {
      setFeedback(null);
      const res = await saveDiscountCoupon(payload);
      if (res.ok) {
        setFeedback({ type: "success", text: res.message });
        setIsModalOpen(false);
        setEditingCoupon(null);
      } else {
        setFeedback({ type: "error", text: res.message });
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      setFeedback(null);
      const res = await deleteDiscountCoupon({ id });
      setDeleteTarget(null);
      if (res.ok) {
        setFeedback({ type: "success", text: res.message });
      } else {
        setFeedback({ type: "error", text: res.message });
      }
    });
  }

  function handleToggleActive(coupon: CouponRow) {
    startTransition(async () => {
      setFeedback(null);
      const res = await saveDiscountCoupon({
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discount_type,
        discountValue: coupon.discount_value,
        minPurchaseAmount: coupon.min_purchase_amount,
        maxDiscountAmount: coupon.max_discount_amount,
        serviceType: coupon.service_type as "all" | "airtime" | "data" | "electricity",
        maxUses: coupon.max_uses,
        expiresAt: coupon.expires_at,
        isActive: !coupon.is_active,
      });
      if (res.ok) {
        setFeedback({ type: "success", text: `Coupon ${coupon.code} is now ${!coupon.is_active ? "active" : "paused"}.` });
      } else {
        setFeedback({ type: "error", text: res.message });
      }
    });
  }

  const openNewCoupon = () => {
    setEditingCoupon({
      code: "",
      discount_type: "percentage",
      discount_value: 5,
      min_purchase_amount: 1000,
      max_discount_amount: 250,
      service_type: "all",
      max_uses: 500,
      is_active: true,
    });
    setIsModalOpen(true);
  };

  return (
    <div className={styles.workspacePage}>
      <AdminPageHeader
        title="Coupons"
        actions={
          <>
            <button type="button" className={styles.primaryButton} onClick={openNewCoupon}>
              <AdminIcon name="plus" />
              Add coupon
            </button>
          </>
        }
        stats={[
          { icon: "coupon", tone: "slate", value: coupons.length, label: "Coupons", note: "codes in this workspace" },
          { icon: "check", tone: "emerald", value: activeCount, label: "Active", note: "redeemable now" },
          { icon: "transactions", tone: "amber", value: totalRedemptions.toLocaleString(), label: "Redemptions", note: "all-time uses" },
          { icon: "percent", tone: "primary", value: coupons.filter((c) => c.discount_type === "percentage").length, label: "Percentage", note: "percent-off codes" },
        ]}
      />

      {feedback ? <AdminFeedback tone={feedback.type} text={feedback.text} onClose={() => setFeedback(null)} /> : null}

      <section className={styles.workspacePanel}>
        <div className={styles.directoryHeader}>
          <div className={styles.directoryTop}>
            <div>
              <div className={styles.directoryTitle}>
                <h2>Coupon directory</h2>
                <span className={styles.countPill}>{filteredCoupons.length}</span>
              </div>
              <p className={styles.directorySub}>Codes, discounts, limits and expiry.</p>
            </div>
            <div className={styles.directoryTools}>
              <label className={styles.directorySearch}>
                <AdminIcon name="search" />
                <input placeholder="Search coupon code..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </label>
              <AdminSelect
                value={filterService}
                onValueChange={setFilterService}
                options={[{ value: "all", label: "All services" }, ...SERVICE_OPTIONS.slice(1)]}
              />
            </div>
          </div>
        </div>

        <div className={styles.workspaceTableWrap}>
          <table className={styles.workspaceTable}>
            <thead>
              <tr>
                <th>Coupon</th>
                <th>Discount</th>
                <th>Usage</th>
                <th>Expires</th>
                <th>Status</th>
                <th data-align="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredCoupons.length > 0 ? (
                filteredCoupons.map((coupon) => (
                  <tr key={coupon.id}>
                    <td>
                      <div className={styles.cellTitle}>
                        <strong>{coupon.code}</strong>
                        <small>{coupon.service_type === "all" ? "All services" : coupon.service_type}</small>
                      </div>
                    </td>
                    <td>
                      <div className={styles.cellValue}>
                        <strong>
                          {coupon.discount_type === "percentage"
                            ? `${coupon.discount_value}% off`
                            : `₦${Number(coupon.discount_value).toLocaleString()} off`}
                        </strong>
                        <small>
                          {coupon.min_purchase_amount > 0 ? `Min ₦${Number(coupon.min_purchase_amount).toLocaleString()}` : "No minimum"}
                          {coupon.max_discount_amount ? ` · Cap ₦${Number(coupon.max_discount_amount).toLocaleString()}` : ""}
                        </small>
                      </div>
                    </td>
                    <td>
                      <div className={styles.cellValue}>
                        <strong>{coupon.times_used || 0}</strong>
                        <small>{coupon.max_uses > 0 ? `of ${coupon.max_uses} uses` : "Unlimited"}</small>
                      </div>
                    </td>
                    <td className={styles.cellPlain}>
                      {coupon.expires_at
                        ? new Date(coupon.expires_at).toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" })
                        : "Never"}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(coupon)}
                        disabled={isPending}
                        className={`${styles.statusPill} ${styles.statusToggle}`}
                        data-status={coupon.is_active ? "active" : "paused"}
                        aria-label={coupon.is_active ? "Pause coupon" : "Activate coupon"}
                      >
                        {coupon.is_active ? "Active" : "Paused"}
                      </button>
                    </td>
                    <td data-align="right">
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.iconAction}
                          aria-label="Edit coupon"
                          data-tip="Edit coupon"
                          onClick={() => {
                            setEditingCoupon(coupon);
                            setIsModalOpen(true);
                          }}
                        >
                          <AdminIcon name="pencil" />
                        </button>
                        <button
                          type="button"
                          className={`${styles.iconAction} ${styles.iconActionDanger}`}
                          aria-label="Delete coupon"
                          data-tip="Delete coupon"
                          onClick={() => setDeleteTarget({ id: coupon.id, code: coupon.code })}
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
                      <AdminIcon name="coupon" />
                      <strong>No coupons match</strong>
                      <span>Change the filters or create one.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className={styles.workspaceFooter}>
          <span>Showing {filteredCoupons.length} of {coupons.length} coupons</span>
        </footer>
      </section>

      {isModalOpen ? (
        <AdminModal
          eyebrow="Coupon"
          title={editingCoupon?.id ? "Edit coupon" : "New coupon"}
          onClose={() => setIsModalOpen(false)}
          footer={
            <>
              <button type="button" className={styles.secondaryButton} onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button type="submit" form="coupon-form" disabled={isPending} className={styles.primaryButton}>
                {isPending ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <form id="coupon-form" onSubmit={handleSave} className={styles.modalForm}>
            <div className={styles.formGrid}>
              <label className={styles.fieldGroup}>
                <span>Code</span>
                <input
                  type="text"
                  name="code"
                  className={styles.codeInput}
                  defaultValue={editingCoupon?.code || ""}
                  placeholder="FLASH50"
                  required
                />
              </label>
              <div className={styles.fieldGroup}>
                <span>Service</span>
                <AdminSelect name="serviceType" defaultValue={editingCoupon?.service_type || "all"} options={SERVICE_OPTIONS} />
              </div>
              <div className={styles.fieldGroup}>
                <span>Type</span>
                <AdminSelect name="discountType" defaultValue={editingCoupon?.discount_type || "percentage"} options={DISCOUNT_TYPE_OPTIONS} />
              </div>
              <label className={styles.fieldGroup}>
                <span>Value (% or ₦)</span>
                <input type="number" step="0.5" name="discountValue" defaultValue={editingCoupon?.discount_value ?? 5} required />
              </label>
              <label className={styles.fieldGroup}>
                <span>Min spend (₦)</span>
                <input type="number" name="minPurchaseAmount" defaultValue={editingCoupon?.min_purchase_amount ?? 1000} />
              </label>
              <label className={styles.fieldGroup}>
                <span>Discount cap (₦)</span>
                <input type="number" name="maxDiscountAmount" defaultValue={editingCoupon?.max_discount_amount || ""} placeholder="Optional" />
              </label>
              <label className={styles.fieldGroup}>
                <span>Max uses</span>
                <input type="number" name="maxUses" defaultValue={editingCoupon?.max_uses ?? 500} />
              </label>
              <label className={styles.fieldGroup}>
                <span>Expires</span>
                <input type="date" name="expiresAt" defaultValue={editingCoupon?.expires_at ? editingCoupon.expires_at.slice(0, 10) : ""} />
              </label>
            </div>
            <p className={styles.panelNote}>Max uses 0 means unlimited.</p>
            <AdminSwitch name="isActive" label="Active" defaultChecked={editingCoupon?.is_active ?? true} />
          </form>
        </AdminModal>
      ) : null}

      {deleteTarget ? (
        <AdminConfirm
          title="Delete coupon?"
          body={<><strong>{deleteTarget.code}</strong> stops working immediately.</>}
          confirmLabel="Delete"
          pending={isPending}
          onConfirm={() => handleDelete(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}
    </div>
  );
}
