import {
  FUNDING_STATUSES,
  loadAdminOverview,
  OVERVIEW_METRICS,
  OVERVIEW_OUTCOMES,
  OVERVIEW_PERIODS,
  type OverviewMetric,
  type OverviewOutcome,
} from "../../../../lib/admin/overview";
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
  const period = (OVERVIEW_PERIODS as readonly number[]).includes(requestedPeriod) ? requestedPeriod : 7;
  const metric: OverviewMetric =
    typeof params.view === "string" && (OVERVIEW_METRICS as readonly string[]).includes(params.view)
      ? (params.view as OverviewMetric)
      : "deposits";
  const outcome: OverviewOutcome =
    typeof params.outcome === "string" && (OVERVIEW_OUTCOMES as readonly string[]).includes(params.outcome)
      ? (params.outcome as OverviewOutcome)
      : "completed";
  const scope = typeof params.scope === "string" ? params.scope : "all";
  const activity = typeof params.activity === "string" && (FUNDING_STATUSES as readonly string[]).includes(params.activity) ? params.activity : "";
  const overview = await loadAdminOverview(period, activity, { metric, scope, outcome });

  return <AdminDashboard admin={admin} overview={overview} activity={activity} />;
}
