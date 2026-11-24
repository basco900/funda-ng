import "server-only";

import { createAdminClient } from "../supabase/admin";

export const OVERVIEW_PERIODS = [1, 7, 14, 30, 90] as const;
export const OVERVIEW_METRICS = ["deposits", "orders", "margin"] as const;
export const OVERVIEW_OUTCOMES = ["completed", "all", "pending", "failed"] as const;
export const DEPOSIT_SCOPES = ["all", "checkout", "virtual_account"] as const;
export const ORDER_SCOPES = ["all", "data", "airtime", "electricity", "cable", "education"] as const;

export type OverviewMetric = (typeof OVERVIEW_METRICS)[number];
export type OverviewOutcome = (typeof OVERVIEW_OUTCOMES)[number];

export type OverviewFilters = {
  metric?: OverviewMetric;
  scope?: string;
  outcome?: OverviewOutcome;
};

export type AdminOverview = {
  connected: boolean;
  periodDays: number;
  hero: {
    metric: OverviewMetric;
    scope: string;
    outcome: OverviewOutcome;
    totalValue: number;
    matchingCount: number;
    completedCount: number;
    settledCount: number;
    successRate: number;
    statuses: Record<string, number>;
    chart: Array<{ label: string; value: number; count: number }>;
  };
  metrics: {
    walletDeposits: number;
    walletFloat: number;
    successRate: number;
    registeredUsers: number;
    pendingValue: number;
    failedValue: number;
  };
  statuses: Record<string, number>;
  chart: Array<{ label: string; value: number; count: number }>;
  recent: Array<{
    id: string;
    reference: string;
    amount: number;
    status: string;
    provider: string;
    customer: string;
    createdAt: string;
  }>;
  alerts: Array<{ tone: "critical" | "warning" | "info"; title: string; detail: string; href: string }>;
};

const emptyOverview = (
  periodDays: number,
  heroFilter: { metric: OverviewMetric; scope: string; outcome: OverviewOutcome },
): AdminOverview => ({
  connected: false,
  periodDays,
  hero: {
    metric: heroFilter.metric,
    scope: heroFilter.scope,
    outcome: heroFilter.outcome,
    totalValue: 0,
    matchingCount: 0,
    completedCount: 0,
    settledCount: 0,
    successRate: 0,
    statuses: {},
    chart: [],
  },
  metrics: {
    walletDeposits: 0,
    walletFloat: 0,
    successRate: 0,
    registeredUsers: 0,
    pendingValue: 0,
    failedValue: 0,
  },
  statuses: { succeeded: 0, pending: 0, failed: 0, initializing: 0, expired: 0, underpaid: 0 },
  chart: [],
  recent: [],
  alerts: [
    {
      tone: "info",
      title: "Admin data is waiting for its migration",
      detail: "Apply the admin control-plane migration and confirm the Supabase secret key.",
      href: "/admin/platform/health",
    },
  ],
});

function dayLabel(date: Date, compact = false) {
  if (!compact) return new Intl.DateTimeFormat("en-NG", { weekday: "short" }).format(date);
  return new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short" }).format(date);
}

function depositChannel(row: { merchant_reference?: string | null; checkout_id?: string | null }) {
  return String(row.merchant_reference ?? "").startsWith("funda_va_") || !row.checkout_id
    ? "virtual_account"
    : "checkout";
}

function matchesOutcome(kind: "deposits" | "orders", status: string, outcome: OverviewOutcome) {
  if (outcome === "all") return true;
  if (kind === "deposits") {
    if (outcome === "completed") return status === "succeeded";
    if (outcome === "pending") return status === "pending" || status === "initializing" || status === "review";
    return status === "failed" || status === "expired" || status === "underpaid";
  }
  if (outcome === "completed") return status === "successful";
  if (outcome === "pending") return status === "initiated" || status === "processing" || status === "pending";
  return status === "failed" || status === "reversed" || status === "cancelled";
}

function buildBuckets<T extends { created_at: string }>(
  days: number,
  rows: T[],
  valueOf: (row: T) => number,
) {
  const now = new Date();
  if (days <= 1) {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const labels = ["12am", "4am", "8am", "12pm", "4pm", "8pm"];
    return labels.map((label, index) => {
      const start = new Date(startOfDay.getTime() + index * 4 * 3_600_000);
      const end = new Date(start.getTime() + 4 * 3_600_000);
      const bucketRows = rows.filter((row) => {
        const created = new Date(row.created_at);
        return created >= start && created < end;
      });
      return {
        label,
        value: bucketRows.reduce((sum, row) => sum + valueOf(row), 0),
        count: bucketRows.length,
      };
    });
  }

  const bucketCount = days <= 7 ? 7 : days <= 14 ? 14 : days <= 30 ? 10 : 12;
  const spanDays = Math.max(1, Math.ceil(days / bucketCount));
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);
  const windowStart = new Date(tomorrowStart.getTime() - days * 86_400_000);

  return Array.from({ length: bucketCount }, (_, index) => {
    const start = new Date(windowStart.getTime() + index * spanDays * 86_400_000);
    const end = index === bucketCount - 1 ? tomorrowStart : new Date(start.getTime() + spanDays * 86_400_000);
    const bucketRows = rows.filter((row) => {
      const created = new Date(row.created_at);
      return created >= start && created < end;
    });
    return {
      label: dayLabel(start, days > 7),
      value: bucketRows.reduce((sum, row) => sum + valueOf(row), 0),
      count: bucketRows.length,
    };
  });
}

export const FUNDING_STATUSES = ["succeeded", "pending", "initializing", "review", "underpaid", "failed", "expired"] as const;

/** `activity` narrows the recent list; `filters` slices the overview hero card. */
export async function loadAdminOverview(
  periodDays = 7,
  activity = "",
  filters: OverviewFilters = {},
): Promise<AdminOverview> {
  const days = Math.max(1, Math.min(periodDays, 90));
  const metric: OverviewMetric = OVERVIEW_METRICS.includes(filters.metric ?? "deposits")
    ? (filters.metric ?? "deposits")
    : "deposits";
  const outcome: OverviewOutcome = OVERVIEW_OUTCOMES.includes(filters.outcome ?? "completed")
    ? (filters.outcome ?? "completed")
    : "completed";
  const allowedScopes: readonly string[] = metric === "deposits" ? DEPOSIT_SCOPES : ORDER_SCOPES;
  const scope = filters.scope && allowedScopes.includes(filters.scope) ? filters.scope : "all";
  const heroFilter = { metric, scope, outcome };
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  try {
    const admin = createAdminClient();
    const [profilesResult, walletsResult, fundingResult, recentResult, serviceResult] = await Promise.all([
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin.from("wallets").select("available_balance").limit(5000),
      admin
        .from("wallet_funding_transactions")
        .select("id, user_id, merchant_reference, checkout_id, amount, status, provider, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000),
      admin
        .from("wallet_funding_transactions")
        .select("id, user_id, merchant_reference, amount, status, provider, created_at")
        .order("created_at", { ascending: false })
        .limit(12)
        .match(activity ? { status: activity } : {}),
      admin
        .from("service_transactions")
        .select("id, service_type, amount, gross_margin, status, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000),
    ]);

    if (profilesResult.error || walletsResult.error || fundingResult.error || recentResult.error) {
      return emptyOverview(days, heroFilter);
    }

    const funding = fundingResult.data ?? [];
    const serviceRows = serviceResult.error ? [] : (serviceResult.data ?? []);
    const recentRows = recentResult.data ?? [];
    const userIds = [...new Set(recentRows.map((row) => row.user_id).filter(Boolean))];
    const { data: profileRows } = userIds.length
      ? await admin.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] as Array<{ id: string; full_name: string }> };
    const profileNames = new Map((profileRows ?? []).map((profile) => [profile.id, profile.full_name]));

    const statuses: Record<string, number> = {
      succeeded: 0,
      pending: 0,
      failed: 0,
      initializing: 0,
      expired: 0,
      underpaid: 0,
    };
    for (const row of funding) statuses[row.status] = (statuses[row.status] ?? 0) + 1;

    const completed = funding.filter((row) => ["succeeded", "failed", "expired", "underpaid"].includes(row.status));
    const succeeded = funding.filter((row) => row.status === "succeeded");
    const successRate = completed.length ? (succeeded.length / completed.length) * 100 : 0;
    const walletDeposits = succeeded.reduce((sum, row) => sum + Number(row.amount), 0);
    const walletFloat = (walletsResult.data ?? []).reduce((sum, row) => sum + Number(row.available_balance), 0);
    const pendingRows = funding.filter((row) => ["pending", "initializing"].includes(row.status));
    const failedRows = funding.filter((row) => ["failed", "expired", "underpaid"].includes(row.status));
    const defaultChart = buildBuckets(days, succeeded, (row) => Number(row.amount));

    let hero: AdminOverview["hero"];
    if (metric === "deposits") {
      const scoped = scope === "all" ? funding : funding.filter((row) => depositChannel(row) === scope);
      const settled = scoped.filter((row) => ["succeeded", "failed", "expired", "underpaid"].includes(row.status));
      const completedCount = scoped.filter((row) => row.status === "succeeded").length;
      const matching = scoped.filter((row) => matchesOutcome("deposits", row.status, outcome));
      const heroStatuses: Record<string, number> = {};
      for (const row of scoped) heroStatuses[row.status] = (heroStatuses[row.status] ?? 0) + 1;
      hero = {
        metric,
        scope,
        outcome,
        totalValue: matching.reduce((sum, row) => sum + Number(row.amount), 0),
        matchingCount: matching.length,
        completedCount,
        settledCount: settled.length,
        successRate: settled.length ? (completedCount / settled.length) * 100 : 0,
        statuses: heroStatuses,
        chart: buildBuckets(days, matching, (row) => Number(row.amount)),
      };
    } else {
      const scoped = scope === "all" ? serviceRows : serviceRows.filter((row) => row.service_type === scope);
      const settled = scoped.filter((row) => ["successful", "failed", "reversed", "cancelled"].includes(row.status));
      const completedCount = scoped.filter((row) => row.status === "successful").length;
      const matching = scoped.filter((row) => matchesOutcome("orders", row.status, outcome));
      const heroStatuses: Record<string, number> = {};
      for (const row of scoped) heroStatuses[row.status] = (heroStatuses[row.status] ?? 0) + 1;
      const valueOf = (row: (typeof serviceRows)[number]) =>
        metric === "margin" ? Number(row.gross_margin ?? 0) : Number(row.amount ?? 0);
      hero = {
        metric,
        scope,
        outcome,
        totalValue: matching.reduce((sum, row) => sum + valueOf(row), 0),
        matchingCount: matching.length,
        completedCount,
        settledCount: settled.length,
        successRate: settled.length ? (completedCount / settled.length) * 100 : 0,
        statuses: heroStatuses,
        chart: buildBuckets(days, matching, valueOf),
      };
    }

    const alerts: AdminOverview["alerts"] = [];
    if (pendingRows.length) {
      alerts.push({
        tone: "warning",
        title: `${pendingRows.length} funding ${pendingRows.length === 1 ? "payment needs" : "payments need"} attention`,
        detail: "Pending or initializing payments are waiting for a final provider state.",
        href: "/admin/operations/pending",
      });
    }
    if (failedRows.length) {
      alerts.push({
        tone: "critical",
        title: `${failedRows.length} unsuccessful ${failedRows.length === 1 ? "payment" : "payments"}`,
        detail: "Review provider responses before retrying or reversing funds.",
        href: "/admin/operations/failed",
      });
    }
    if (!alerts.length) {
      alerts.push({
        tone: "info",
        title: "Nothing urgent right now",
        detail: "Funding activity is clear of unresolved failures in this period.",
        href: "/admin/operations/live",
      });
    }

    return {
      connected: true,
      periodDays: days,
      hero,
      metrics: {
        walletDeposits,
        walletFloat,
        successRate,
        registeredUsers: profilesResult.count ?? 0,
        pendingValue: pendingRows.reduce((sum, row) => sum + Number(row.amount), 0),
        failedValue: failedRows.reduce((sum, row) => sum + Number(row.amount), 0),
      },
      statuses,
      chart: defaultChart,
      recent: recentRows.map((row) => ({
        id: row.id,
        reference: row.merchant_reference,
        amount: Number(row.amount),
        status: row.status,
        provider: row.provider,
        customer: profileNames.get(row.user_id) || `User ${String(row.user_id).slice(0, 8)}`,
        createdAt: row.created_at,
      })),
      alerts,
    };
  } catch {
    return emptyOverview(days, heroFilter);
  }
}
