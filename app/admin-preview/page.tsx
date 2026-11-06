// TEMPORARY dev-only visual preview of the admin shell with sample data. Delete after review.
import { notFound } from "next/navigation";
import AdminShell from "../admin/(console)/admin-shell";
import AirtimeWorkspace from "../admin/products/airtime/airtime-workspace";
import WorkspaceTable from "../admin/(console)/[...segments]/workspace-table";

export const dynamic = "force-dynamic";

export default function AdminPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const admin = {
    id: "preview",
    authUserId: "preview",
    email: "abbas@funda.ng",
    fullName: "Abbas Abubakar",
    initials: "AA",
    role: "Super Admin",
    roleSlug: "super_admin",
    permissions: ["*"],
    bootstrap: false,
  };

  const routes = [
    { id: "r1", network: "mtn", mode: "vtu", min_amount: 50, max_amount: 10000, primary_provider: "maskawasub", fallback_provider: "smeplug", discount_percentage: 2.5, cashback_percentage: 0.5, priority: 10, is_active: true },
    { id: "r2", network: "airtel", mode: "all", min_amount: 100, max_amount: 50000, primary_provider: "maskawasub", fallback_provider: null, discount_percentage: 3, cashback_percentage: 1, priority: 20, is_active: true },
    { id: "r3", network: "glo", mode: "epin", min_amount: 100, max_amount: 5000, primary_provider: "vtpass", fallback_provider: "smeplug", discount_percentage: 1.5, cashback_percentage: 0, priority: 5, is_active: false },
    { id: "r4", network: "9mobile", mode: "vtu", min_amount: 50, max_amount: 20000, primary_provider: "smeplug", fallback_provider: "vtpass", discount_percentage: 2, cashback_percentage: 0.5, priority: 15, is_active: true },
  ];
  const providers = [
    { id: "p1", name: "MaskawaSub", slug: "maskawasub", status: "active" },
    { id: "p2", name: "VTPass", slug: "vtpass", status: "active" },
  ];
  const recentTransactions = [
    { id: "t1", internal_reference: "FND-20261026-9A1B", provider_reference: null, destination: "08163474155", amount: 500, status: "successful", service_type: "airtime", created_at: new Date().toISOString(), user: { id: "u1", phone: "08163474155" } },
    { id: "t2", internal_reference: "FND-20261025-77C2", provider_reference: null, destination: "07025468818", amount: 1000, status: "failed", service_type: "airtime", created_at: new Date().toISOString(), user: { id: "u2", email: "zee@funda.ng" } },
  ];

  return (
    <AdminShell admin={admin}>
      <AirtimeWorkspace routes={routes} providers={providers} recentTransactions={recentTransactions} totalRoutesCount={4} />
      <div className="mt-6"><WorkspaceTable title="Transactions" icon="transactions" columns={[{ key: "reference", label: "Reference" }, { key: "service", label: "Service" }, { key: "destination", label: "Destination" }, { key: "amount", label: "Amount", align: "right" }, { key: "status", label: "Status" }, { key: "created", label: "Created" }]} rows={["Successful","Failed","Pending","Successful","Refunded","Processing","Successful","Failed"].map((status, i) => ({ reference: `FND-2026102${i}-9A1B${i}`, service: i % 3 ? "Data" : "Airtime", destination: "08163474155", amount: `₦${(i + 1) * 120}`, status, created: "25 Oct, 20:05" }))} /></div>
    </AdminShell>
  );
}
