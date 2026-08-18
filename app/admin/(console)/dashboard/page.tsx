import { loadAdminOverview } from "../../../../lib/admin/overview";
import { requireAdminPermission } from "../../../../lib/admin/auth";
import AdminDashboard from "./admin-dashboard";

export const metadata = {
  title: "Control centre",
};

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdminPermission("dashboard.view");
  const params = await searchParams;
  const requestedPeriod = Number(typeof params.period === "string" ? params.period : 7);
  const period = [1, 7, 30, 90].includes(requestedPeriod) ? requestedPeriod : 7;
  const overview = await loadAdminOverview(period);

  return <AdminDashboard admin={admin} overview={overview} />;
}
