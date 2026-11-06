import { requireAdminPermission } from "../../../../lib/admin/auth";
import { createAdminClient } from "../../../../lib/supabase/admin";
import CableTvWorkspace from "./tv-workspace";

export const dynamic = "force-dynamic";

export default async function AdminCableTvPage() {
  await requireAdminPermission("products.view");
  const client = createAdminClient();

  const [
    { data: tvConfigs },
    { data: tvPackages },
    { data: providers },
    { data: recentTvTx },
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
    client
      .from("service_transactions")
      .select("id, internal_reference, provider_reference, destination, amount, status, service_type, metadata, created_at, user:users(id, phone, email)")
      .in("service_type", ["tv", "cable_tv", "cable"])
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const normalizedTx = (recentTvTx ?? []).map((t) => ({
    ...t,
    user: Array.isArray(t.user) ? t.user[0] ?? null : t.user,
  }));

  return (
    <CableTvWorkspace
      tvConfigs={tvConfigs ?? []}
      tvPackages={tvPackages ?? []}
      providers={providers ?? []}
      recentTransactions={normalizedTx}
    />
  );
}

