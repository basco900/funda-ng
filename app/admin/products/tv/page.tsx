import type { ComponentProps } from "react";
import { requireAdminPermission } from "../../../../lib/admin/auth";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { loadServicePurchases, purchaseStatusFrom } from "../../../../lib/admin/purchases";
import CableTvWorkspace from "./tv-workspace";

type TransactionRecord = ComponentProps<typeof CableTvWorkspace>["recentTransactions"][number];

export const dynamic = "force-dynamic";

export default async function AdminCableTvPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPermission("products.view");
  const purchaseStatus = purchaseStatusFrom(await searchParams);
  const client = createAdminClient();

  const [
    { data: tvConfigs },
    { data: tvPackages },
    { data: providers },
    { rows: recentTvTx, filter: purchaseFilter },
  ] = await Promise.all([
    client
      .from("cable_tv_configs")
      .select("*")
      .order("operator_name", { ascending: true }),
    client
      .from("cable_tv_packages")
      .select("*")
      .order("sort_order", { ascending: true }),
    client
      .from("provider_registry")
      .select("id, name, slug, status")
      .order("name"),
    loadServicePurchases({ serviceTypes: ["tv", "cable_tv", "cable"], select: "id, internal_reference, provider_reference, destination, amount, status, service_type, metadata, created_at, user:users(id, phone, email)", status: purchaseStatus, limit: 20 }),
  ]);

  const normalizedTx = (recentTvTx as TransactionRecord[]).map((t) => ({
    ...t,
    user: Array.isArray(t.user) ? t.user[0] ?? null : t.user,
  }));

  return (
    <CableTvWorkspace
      tvConfigs={tvConfigs ?? []}
      tvPackages={tvPackages ?? []}
      providers={providers ?? []}
      recentTransactions={normalizedTx}
      purchaseFilter={purchaseFilter}
    />
  );
}

