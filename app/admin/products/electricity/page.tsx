import { requireAdminPermission } from "../../../../lib/admin/auth";
import { createAdminClient } from "../../../../lib/supabase/admin";
import ElectricityWorkspace from "./electricity-workspace";

export const dynamic = "force-dynamic";

export default async function AdminElectricityPage() {
  await requireAdminPermission("products.view");
  const client = createAdminClient();

  const [
    { data: discoConfigs },
    { data: providers },
    { data: recentElectricityTx },
  ] = await Promise.all([
    client
      .from("electricity_disco_configs")
      .select("*")
      .order("disco_name", { ascending: true }),
    client
      .from("provider_registry")
      .select("id, name, slug, status")
      .order("name"),
    client
      .from("service_transactions")
      .select("id, internal_reference, provider_reference, destination, amount, status, service_type, metadata, created_at, user:users(id, phone, email)")
      .eq("service_type", "electricity")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const normalizedTx = (recentElectricityTx ?? []).map((t) => ({
    ...t,
    user: Array.isArray(t.user) ? t.user[0] ?? null : t.user,
  }));

  return (
    <ElectricityWorkspace
      discoConfigs={discoConfigs ?? []}
      providers={providers ?? []}
      recentTransactions={normalizedTx}
    />
  );
}
