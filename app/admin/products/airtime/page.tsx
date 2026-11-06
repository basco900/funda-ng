import { requireAdminPermission } from "../../../../lib/admin/auth";
import { createAdminClient } from "../../../../lib/supabase/admin";
import AirtimeWorkspace from "./airtime-workspace";

export const dynamic = "force-dynamic";

export default async function AdminAirtimePage() {
  await requireAdminPermission("products.view");
  const client = createAdminClient();

  const [
    { data: routes },
    { data: providers },
    { data: recentAirtimeTx },
    { count: totalRoutesCount },
  ] = await Promise.all([
    client
      .from("airtime_provider_routes")
      .select("*")
      .order("priority", { ascending: false }),
    client
      .from("provider_registry")
      .select("id, name, slug, status")
      .order("name"),
    client
      .from("service_transactions")
      .select("id, internal_reference, provider_reference, destination, amount, status, service_type, created_at, user:users(id, phone, email)")
      .eq("service_type", "airtime")
      .order("created_at", { ascending: false })
      .limit(15),
    client
      .from("airtime_provider_routes")
      .select("*", { count: "exact", head: true }),
  ]);

  const normalizedTx = (recentAirtimeTx ?? []).map((t) => ({
    ...t,
    user: Array.isArray(t.user) ? t.user[0] ?? null : t.user,
  }));

  return (
    <AirtimeWorkspace
      routes={routes ?? []}
      providers={providers ?? []}
      recentTransactions={normalizedTx}
      totalRoutesCount={totalRoutesCount ?? 0}
    />
  );
}
