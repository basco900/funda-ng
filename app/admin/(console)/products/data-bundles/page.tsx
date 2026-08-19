import { requireAdminPermission } from "../../../../../lib/admin/auth";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import DataBundlesWorkspace from "./data-bundles-workspace";

// This static route intentionally takes precedence over the admin catch-all workspace.

export default async function DataBundlesPage() {
  await requireAdminPermission("products.view");
  const client = createAdminClient();
  const [{ data: providers }, { data: offers }, { data: bundles }, { data: categories }] = await Promise.all([
    client.from("provider_registry").select("id,name,status").contains("capabilities", ["data"]).order("priority"),
    client.from("provider_catalogue_items").select("id,provider_id,network_slug,provider_product_code,provider_name,data_amount_mb,validity_label,validity_hours,provider_cost,is_available,imported_at").eq("service_type", "data").order("provider_name"),
    client.from("service_products").select("id,name,network,description,provider_cost,selling_price,status,metadata,provider:provider_registry(name),placement:product_placements(surface,badge,is_active)").eq("service_type", "data").order("updated_at", { ascending: false }),
    client.from("data_bundle_categories").select("network_slug,slug,name,sort_order").eq("is_active", true).order("sort_order"),
  ]);
  return <DataBundlesWorkspace providers={providers ?? []} offers={offers ?? []} bundles={bundles ?? []} categories={categories ?? []} />;
}
