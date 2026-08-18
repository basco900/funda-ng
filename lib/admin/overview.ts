import "server-only";

import { createAdminClient } from "../supabase/admin";

export type AdminOverview = {
  connected: boolean;
  periodDays: number;
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

const emptyOverview = (periodDays: number): AdminOverview => ({
  connected: false,
  periodDays,
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

function dayLabel(date: Date) {
  return new Intl.DateTimeFormat("en-NG", { weekday: "short" }).format(date);
}

export async function loadAdminOverview(periodDays = 7): Promise<AdminOverview> {
  const days = Math.max(1, Math.min(periodDays, 90));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  try {
    const admin = createAdminClient();
    const [profilesResult, walletsResult, fundingResult, recentResult] = await Promise.all([
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin.from("wallets").select("available_balance").limit(5000),
      admin
        .from("wallet_funding_transactions")
        .select("id, user_id, merchant_reference, amount, status, provider, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000),
      admin
        .from("wallet_funding_transactions")
        .select("id, user_id, merchant_reference, amount, status, provider, created_at")
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    if (profilesResult.error || walletsResult.error || fundingResult.error || recentResult.error) {
      return emptyOverview(days);
    }

    const funding = fundingResult.data ?? [];
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

    const chart = Array.from({ length: Math.min(days, 14) }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (Math.min(days, 14) - index - 1));
      const next = new Date(date.getTime() + 86_400_000);
      const rows = succeeded.filter((row) => {
        const created = new Date(row.created_at);
        return created >= date && created < next;
      });
      return {
        label: dayLabel(date),
        value: rows.reduce((sum, row) => sum + Number(row.amount), 0),
        count: rows.length,
      };
    });

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
      metrics: {
        walletDeposits,
        walletFloat,
        successRate,
        registeredUsers: profilesResult.count ?? 0,
        pendingValue: pendingRows.reduce((sum, row) => sum + Number(row.amount), 0),
        failedValue: failedRows.reduce((sum, row) => sum + Number(row.amount), 0),
      },
      statuses,
      chart,
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
    return emptyOverview(days);
  }
}
