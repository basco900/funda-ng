import type { ComponentProps } from "react";
import { requireAdminPermission } from "../../../../lib/admin/auth";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { loadServicePurchases, purchaseStatusFrom } from "../../../../lib/admin/purchases";
import AirtimeWorkspace from "./airtime-workspace";

type TransactionRecord = ComponentProps<typeof AirtimeWorkspace>["recentTransactions"][number];

export const dynamic = "force-dynamic";

export default async function AdminAirtimePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPermission("products.view");
  const params = await searchParams;
  const purchaseStatus = purchaseStatusFrom(params);
  const purchaseMode = params.purchaseMode === "epin" || params.purchaseMode === "vtu" ? params.purchaseMode : "";
  const client = createAdminClient();

  const [
    { data: routes },
    { data: providers },
    { rows: recentAirtimeTx, filter: purchaseFilter },
    { count: totalRoutesCount },
    summary,
    catalogue,
    pendingCards,
    conflictedCards,
  ] = await Promise.all([
    client
      .from("airtime_provider_routes")
      .select("*")
      .order("priority", { ascending: false }),
    client
      .from("provider_registry")
      .select("id, name, slug, status")
      .order("name"),
    loadServicePurchases({ serviceTypes: ["airtime"], select: "id,user_id,internal_reference,provider_reference,destination,amount,discount_amount,cashback_amount,status,service_type,created_at,metadata", status: purchaseStatus, mode: purchaseMode || undefined, limit: 50 }),
    client
      .from("airtime_provider_routes")
      .select("*", { count: "exact", head: true }),
    client.rpc("recharge_card_summary", { p_since: new Date(new Date().getTime() - 30 * 86400000).toISOString(), p_until: new Date().toISOString() }),
    client.from("recharge_card_catalogue").select("id,network,denomination,unit_cost,max_quantity,is_active,verified_at").order("network").order("denomination"),
    client.from("recharge_card_operations").select("id,internal_reference,network,denomination,quantity,pin_count,amount,delivery_status,reconciliation_issue,updated_at").in("status", ["pending", "processing", "initiated"]).order("updated_at", { ascending: false }).limit(50),
    client.from("recharge_card_operations").select("id,internal_reference,network,denomination,quantity,pin_count,amount,delivery_status,reconciliation_issue,updated_at").not("reconciliation_issue", "is", null).order("updated_at", { ascending: false }).limit(50),
  ]);

  const userIds = [...new Set(recentAirtimeTx.map((tx) => String(tx.user_id)))];
  const { data: profiles } = userIds.length ? await client.from("profiles").select("id,full_name").in("id", userIds) : { data: [] };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  const normalizedTx: TransactionRecord[] = recentAirtimeTx.map((record) => {
    const meta = (record.metadata ?? {}) as Record<string, unknown>;
    const tx = { ...record }; delete tx.metadata;
    return { ...tx, mode: String(meta.mode ?? "vtu"), network: String(meta.network ?? ""), quantity: Number(meta.quantity ?? 1), unitAmount: Number(meta.unitAmount ?? record.amount), pinCount: Number(meta.pinCount ?? 0), deliveryStatus: String(meta.deliveryStatus ?? (record.status === "successful" ? "ready" : "awaiting_provider")), user: { id: String(record.user_id), name: names.get(String(record.user_id)) || "Customer" } } as TransactionRecord;
  });

  return (
    <AirtimeWorkspace
      routes={routes ?? []}
      providers={providers ?? []}
      recentTransactions={normalizedTx}
      purchaseFilter={purchaseFilter}
      totalRoutesCount={totalRoutesCount ?? 0}
      purchaseMode={purchaseMode}
      rechargeSummary={summary.error ? null : summary.data}
      rechargeOffers={(catalogue.data ?? []).map((offer) => ({ ...offer, denomination: Number(offer.denomination), unit_cost: Number(offer.unit_cost), max_quantity: Number(offer.max_quantity) }))}
      catalogueAvailable={!catalogue.error}
      rechargeReviews={pendingCards.error || conflictedCards.error ? null : [...new Map([...(pendingCards.data ?? []), ...(conflictedCards.data ?? [])].map((row) => [row.id, { ...row, denomination: Number(row.denomination), quantity: Number(row.quantity), pin_count: Number(row.pin_count), amount: Number(row.amount) }])).values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 50)}
    />
  );
}
