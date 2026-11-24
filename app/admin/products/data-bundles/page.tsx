import { requireAdminPermission } from "../../../../lib/admin/auth";
import { loadServicePurchases, purchaseStatusFrom } from "../../../../lib/admin/purchases";
import { createAdminClient } from "../../../../lib/supabase/admin";
import DataBundlesWorkspace from "../../(console)/products/data-bundles/data-bundles-workspace";

export const dynamic = "force-dynamic";

function thirtyDaysAgoIso() {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

export default async function DataBundlesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPermission("products.view");
  const purchaseStatus = purchaseStatusFrom(await searchParams);
  const client = createAdminClient();
  const since30d = thirtyDaysAgoIso();

  const [
    { data: providers },
    { data: offers },
    { data: bundles },
    { data: productOffers },
    { data: categories },
    { rows: recentPurchases, filter: purchaseFilter },
    { data: cashbackFlag },
    { data: activeCoupons },
    { data: recentStatsTx },
  ] = await Promise.all([
    client
      .from("provider_registry")
      .select("id,name,status,slug,priority")
      .contains("capabilities", ["data"])
      .order("priority"),
    client
      .from("provider_catalogue_items")
      .select("id,provider_id,network_slug,provider_product_code,provider_name,data_amount_mb,validity_label,validity_hours,provider_cost,is_available,imported_at")
      .eq("service_type", "data")
      .order("provider_name"),
    client
      .from("service_products")
      .select("id,name,network,description,provider_cost,selling_price,cashback_amount,status,metadata,provider_id,provider_product_code,validity,provider:provider_registry(id,name),placement:product_placements(surface,badge,is_active)")
      .eq("service_type", "data")
      .order("updated_at", { ascending: false }),
    client
      .from("product_provider_offers")
      .select("product_id,provider_id,provider_catalogue_item_id,provider_product_code,provider_cost,priority,status,provider:provider_registry(id,name,slug)")
      .order("priority", { ascending: true }),
    client
      .from("data_bundle_categories")
      .select("network_slug,slug,name,sort_order")
      .eq("is_active", true)
      .order("sort_order"),
    loadServicePurchases({
      serviceTypes: ["data"],
      select: "id,internal_reference,provider_reference,destination,amount,provider_cost,cashback_amount,gross_margin,status,service_type,metadata,created_at,user:users(id,phone,email),provider:provider_registry(name,slug)",
      status: purchaseStatus,
      limit: 30,
    }),
    client
      .from("feature_flags")
      .select("enabled")
      .eq("key", "rewards.cashback")
      .maybeSingle(),
    client
      .from("discount_coupons")
      .select("id,code,discount_type,discount_value,max_discount,service_type,used_count,max_uses,expires_at")
      .eq("is_active", true)
      .in("service_type", ["data", "all"])
      .order("created_at", { ascending: false })
      .limit(12),
    client
      .from("service_transactions")
      .select("status,amount,provider_cost,cashback_amount,gross_margin,provider_id,metadata")
      .eq("service_type", "data")
      .gte("created_at", since30d)
      .limit(1000),
  ]);

  const txRows = recentStatsTx ?? [];
  const providerNameMap = new Map((providers ?? []).map((p) => [p.id, p.name]));

  let revenue30d = 0;
  let supplierCost30d = 0;
  let grossProfit30d = 0;
  let cashbackCost30d = 0;
  let discountCost30d = 0;
  let successfulCount = 0;
  let failedCount = 0;
  let pendingCount = 0;

  const networkAcc = new Map<string, { network: string; total: number; success: number; revenue: number; profit: number }>();
  const providerAcc = new Map<string, { providerId: string; name: string; total: number; success: number; revenue: number; profit: number }>();

  for (const row of txRows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const net = String(meta.network || "unknown").toLowerCase();
    const pid = row.provider_id || "unassigned";
    const pname = row.provider_id ? providerNameMap.get(row.provider_id) || "Provider" : "Unassigned";

    const netEntry = networkAcc.get(net) ?? { network: net, total: 0, success: 0, revenue: 0, profit: 0 };
    const provEntry = providerAcc.get(pid) ?? { providerId: pid, name: pname, total: 0, success: 0, revenue: 0, profit: 0 };

    netEntry.total += 1;
    provEntry.total += 1;

    if (row.status === "successful") {
      const amt = Number(row.amount ?? 0);
      const cost = Number(row.provider_cost ?? 0);
      const cb = Number(row.cashback_amount ?? 0);
      const margin = Number(row.gross_margin ?? amt - cost - cb);
      const disc = Number(meta.discountAmount ?? 0);

      successfulCount += 1;
      revenue30d += amt;
      supplierCost30d += cost;
      grossProfit30d += margin;
      cashbackCost30d += cb;
      discountCost30d += disc;

      netEntry.success += 1;
      netEntry.revenue += amt;
      netEntry.profit += margin;

      provEntry.success += 1;
      provEntry.revenue += amt;
      provEntry.profit += margin;
    } else if (row.status === "pending" || row.status === "initiated" || row.status === "processing") {
      pendingCount += 1;
    } else {
      failedCount += 1;
    }

    networkAcc.set(net, netEntry);
    providerAcc.set(pid, provEntry);
  }

  const settledTotal = successfulCount + failedCount;
  const successRate = settledTotal > 0 ? Math.round((successfulCount / settledTotal) * 100) : 0;

  return (
    <DataBundlesWorkspace
      providers={providers ?? []}
      offers={offers ?? []}
      bundles={bundles ?? []}
      productOffers={productOffers ?? []}
      categories={categories ?? []}
      recentPurchases={recentPurchases}
      purchaseFilter={purchaseFilter}
      cashbackEnabled={Boolean(cashbackFlag?.enabled)}
      activeCoupons={activeCoupons ?? []}
      analytics={{
        revenue30d,
        supplierCost30d,
        grossProfit30d,
        cashbackCost30d,
        discountCost30d,
        totalOrders30d: txRows.length,
        successfulCount,
        failedCount,
        pendingCount,
        successRate,
        byNetwork: Array.from(networkAcc.values()).sort((a, b) => b.revenue - a.revenue),
        byProvider: Array.from(providerAcc.values()).sort((a, b) => b.total - a.total),
      }}
    />
  );
}
