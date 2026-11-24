import type { ComponentProps } from "react";
import { requireAdminPermission } from "../../../../lib/admin/auth";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { loadServicePurchases, purchaseStatusFrom } from "../../../../lib/admin/purchases";
import ElectricityWorkspace from "./electricity-workspace";

type TransactionRecord = ComponentProps<typeof ElectricityWorkspace>["recentTransactions"][number];

export const dynamic = "force-dynamic";

export default async function AdminElectricityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPermission("products.view");
  const purchaseStatus = purchaseStatusFrom(await searchParams);
  const client = createAdminClient();

  const [
    { data: discoConfigs },
    { data: providers },
    { rows: recentElectricityTx, filter: purchaseFilter },
  ] = await Promise.all([
    client
      .from("electricity_disco_configs")
      .select("*")
      .order("disco_name", { ascending: true }),
    client
      .from("provider_registry")
      .select("id, name, slug, status")
      .order("name"),
    loadServicePurchases({ serviceTypes: ["electricity"], select: "id, internal_reference, provider_reference, destination, amount, status, service_type, metadata, created_at, user:users(id, phone, email)", status: purchaseStatus, limit: 20 }),
  ]);

  const normalizedTx = (recentElectricityTx as TransactionRecord[]).map((t) => ({
    ...t,
    user: Array.isArray(t.user) ? t.user[0] ?? null : t.user,
  }));

  return (
    <ElectricityWorkspace
      discoConfigs={discoConfigs ?? []}
      providers={providers ?? []}
      recentTransactions={normalizedTx}
      purchaseFilter={purchaseFilter}
    />
  );
}
