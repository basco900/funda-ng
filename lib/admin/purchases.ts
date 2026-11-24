import "server-only";

import { createAdminClient } from "../supabase/admin";

/** A product page's recent purchases, filtered by state on the server (`?purchases=failed`). */

export const PURCHASE_STATUSES = ["successful", "pending", "processing", "initiated", "failed", "reversed", "refunded", "cancelled"] as const;

export type PurchaseFilter = {
  status: string;
  total: number;
  options: Array<{ value: string; label: string; count: number }>;
};

export function purchaseStatusFrom(params: Record<string, string | string[] | undefined>, key = "purchases") {
  const value = params[key];
  return typeof value === "string" && (PURCHASE_STATUSES as readonly string[]).includes(value) ? value : "";
}

type CountQuery = PromiseLike<{ count: number | null }> & { eq(column: string, value: string): CountQuery; or(filters: string): CountQuery };
type ListQuery = PromiseLike<{ data: unknown[] | null }> & { eq(column: string, value: string): ListQuery; or(filters: string): ListQuery };

export async function loadServicePurchases({ serviceTypes, select, status, limit = 20, mode }: { serviceTypes: readonly string[]; select: string; status: string; limit?: number; mode?: "vtu" | "epin" }) {
  const client = createAdminClient();
  const count = () => {
    const query = client.from("service_transactions").select("id", { count: "exact", head: true }).in("service_type", serviceTypes) as unknown as CountQuery;
    return mode === "vtu" ? query.or("metadata->>mode.eq.vtu,metadata->>mode.is.null") : mode ? query.eq("metadata->>mode", mode) : query;
  };
  let list = client.from("service_transactions").select(select).in("service_type", serviceTypes).order("created_at", { ascending: false }).limit(limit) as unknown as ListQuery;
  if (status) list = list.eq("status", status);
  if (mode === "vtu") list = list.or("metadata->>mode.eq.vtu,metadata->>mode.is.null");
  else if (mode) list = list.eq("metadata->>mode", mode);

  const [{ data }, total, ...counts] = await Promise.all([list, count(), ...PURCHASE_STATUSES.map((value) => count().eq("status", value))]);
  const filter: PurchaseFilter = {
    status,
    total: total.count ?? 0,
    options: PURCHASE_STATUSES.map((value, index) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1), count: counts[index].count ?? 0 })).filter((option) => option.count > 0 || option.value === status),
  };
  return { rows: (data ?? []) as Record<string, unknown>[], filter };
}
