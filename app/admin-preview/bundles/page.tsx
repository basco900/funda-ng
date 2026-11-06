// TEMPORARY dev-only preview of the data bundles workspace. Delete after review.
import { notFound } from "next/navigation";
import AdminShell from "../../admin/(console)/admin-shell";
import DataBundlesWorkspace from "../../admin/(console)/products/data-bundles/data-bundles-workspace";

export const dynamic = "force-dynamic";

export default function BundlesPreview() {
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
  const providers = [{ id: "p1", name: "Maskawasub", status: "operational" }, { id: "p2", name: "SMEPlug", status: "operational" }];
  const offers = [5, 10, 2].map((gb, i) => ({ id: `o${i}`, provider_id: "p1", network_slug: "mtn", provider_product_code: `maskawa_ds_${gb}gb`, provider_name: `MTN ${gb}GB Data Share (30 Days)`, data_amount_mb: gb * 1024, validity_label: "30 days", validity_hours: 720, provider_cost: gb * 310, is_available: true }));
  const bundles = offers.map((offer, i) => ({ id: `b${i}`, name: offer.provider_name, network: "mtn", description: null, provider_cost: offer.provider_cost, selling_price: offer.provider_cost + 170, status: i === 2 ? "draft" : "active", metadata: { data_amount_mb: offer.data_amount_mb, category: "monthly" }, provider_id: "p1", provider_product_code: offer.provider_product_code, validity: "30 days", provider: { id: "p1", name: "Maskawasub" }, placement: null }));
  const categories = [{ network_slug: "mtn", slug: "monthly", name: "Monthly", sort_order: 1 }, { network_slug: "mtn", slug: "weekly", name: "Weekly", sort_order: 2 }];
  return (
    <AdminShell admin={admin}>
      <DataBundlesWorkspace providers={providers} offers={offers} bundles={bundles} categories={categories} />
    </AdminShell>
  );
}
