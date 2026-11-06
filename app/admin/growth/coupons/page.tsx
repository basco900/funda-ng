import { requireAdminPermission } from "../../../../lib/admin/auth";
import { createAdminClient } from "../../../../lib/supabase/admin";
import CouponsWorkspace from "./coupons-workspace";

export const dynamic = "force-dynamic";

export default async function AdminCouponsPage() {
  await requireAdminPermission("campaigns.manage");
  const client = createAdminClient();

  const [{ data: coupons }, { count: totalCoupons }] = await Promise.all([
    client
      .from("discount_coupons")
      .select("*")
      .order("created_at", { ascending: false }),
    client
      .from("discount_coupons")
      .select("*", { count: "exact", head: true }),
  ]);

  return (
    <CouponsWorkspace
      coupons={coupons ?? []}
      totalCoupons={totalCoupons ?? 0}
    />
  );
}

