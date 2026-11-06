import { requireAdminPermission } from "../../../../lib/admin/auth";
import { createAdminClient } from "../../../../lib/supabase/admin";
import EducationWorkspace from "./education-workspace";

export const dynamic = "force-dynamic";

export default async function AdminEducationPage() {
  await requireAdminPermission("products.view");
  const client = createAdminClient();

  const [
    { data: educationConfigs },
    { data: educationPackages },
    { data: providers },
    { data: recentEducationTx },
  ] = await Promise.all([
    client
      .from("education_configs")
      .select("*")
      .order("exam_body", { ascending: true }),
    client
      .from("education_packages")
      .select("*")
      .order("sort_order", { ascending: true }),
    client
      .from("provider_registry")
      .select("id, name, slug, status")
      .order("name"),
    client
      .from("service_transactions")
      .select("id, internal_reference, provider_reference, destination, amount, status, service_type, metadata, created_at, user:users(id, phone, email)")
      .eq("service_type", "education")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const normalizedTx = (recentEducationTx ?? []).map((t) => ({
    ...t,
    user: Array.isArray(t.user) ? t.user[0] ?? null : t.user,
  }));

  return (
    <EducationWorkspace
      educationConfigs={educationConfigs ?? []}
      educationPackages={educationPackages ?? []}
      providers={providers ?? []}
      recentTransactions={normalizedTx}
    />
  );
}

