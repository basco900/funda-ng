import type { ComponentProps } from "react";
import { requireAdminPermission } from "../../../../lib/admin/auth";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { loadServicePurchases, purchaseStatusFrom } from "../../../../lib/admin/purchases";
import EducationWorkspace from "./education-workspace";

type TransactionRecord = ComponentProps<typeof EducationWorkspace>["recentTransactions"][number];

export const dynamic = "force-dynamic";

export default async function AdminEducationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPermission("products.view");
  const purchaseStatus = purchaseStatusFrom(await searchParams);
  const client = createAdminClient();

  const [
    { data: educationConfigs },
    { data: educationPackages },
    { data: providers },
    { rows: recentEducationTx, filter: purchaseFilter },
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
    loadServicePurchases({ serviceTypes: ["education"], select: "id, internal_reference, provider_reference, destination, amount, status, service_type, metadata, created_at, user:users(id, phone, email)", status: purchaseStatus, limit: 20 }),
  ]);

  const normalizedTx = (recentEducationTx as TransactionRecord[]).map((t) => ({
    ...t,
    user: Array.isArray(t.user) ? t.user[0] ?? null : t.user,
  }));

  return (
    <EducationWorkspace
      educationConfigs={educationConfigs ?? []}
      educationPackages={educationPackages ?? []}
      providers={providers ?? []}
      recentTransactions={normalizedTx}
      purchaseFilter={purchaseFilter}
    />
  );
}

