"use client";

import Link from "next/link";
import type { AdminSession } from "../../../../lib/admin/auth";
import type { AdminOverview, OverviewMetric } from "../../../../lib/admin/overview";
import { cn } from "../../../../lib/utils";
import { card, button, EmptyNote, NairaAmount, ProgressRing, Ribbon, SectionTitle, StatusBadge, TextLink, Tip } from "../../../../components/admin/kit";
import { UrlList, UrlResetButton, UrlSelect } from "../../../../components/admin/list-controls";
import AdminIcon, { type AdminIconName } from "../admin-icon";

const naira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });
const money = (value: number) => naira.format(value).replace("NGN", "₦");

const PERIOD_OPTIONS = [
  { value: "1", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

const METRIC_OPTIONS = [
  { value: "deposits", label: "Wallet deposits", description: "Funding inflows" },
  { value: "orders", label: "Service sales", description: "VTU & bill spend" },
  { value: "margin", label: "Net margin", description: "Gross service margin" },
];

const DEPOSIT_SCOPE_OPTIONS = [
  { value: "all", label: "All channels" },
  { value: "checkout", label: "Checkout" },
  { value: "virtual_account", label: "Virtual account" },
];

const SERVICE_SCOPE_OPTIONS = [
  { value: "all", label: "All services" },
  { value: "data", label: "Data" },
  { value: "airtime", label: "Airtime" },
  { value: "electricity", label: "Electricity" },
  { value: "cable", label: "Cable TV" },
  { value: "education", label: "Education" },
];

const OUTCOME_OPTIONS = [
  { value: "completed", label: "Succeeded" },
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
];

const PERIOD_LABEL: Record<number, string> = {
  1: "today",
  7: "last 7 days",
  14: "last 14 days",
  30: "last 30 days",
  90: "last 90 days",
};

const METRIC_LABEL: Record<OverviewMetric, string> = {
  deposits: "Wallet deposits",
  orders: "Service sales",
  margin: "Net margin",
};

const METRIC_ICON: Record<OverviewMetric, AdminIconName> = {
  deposits: "wallet",
  orders: "transactions",
  margin: "trendUp",
};

const SCOPE_LABEL: Record<string, string> = {
  checkout: "Checkout",
  virtual_account: "Virtual account",
  data: "Data",
  airtime: "Airtime",
  electricity: "Electricity",
  cable: "Cable TV",
  education: "Education",
};

const OUTCOME_DOT: Record<string, string> = {
  completed: "bg-emerald-500",
  all: "bg-primary",
  pending: "bg-amber-500",
  failed: "bg-rose-500",
};

const OUTCOME_WORD: Record<string, string> = {
  completed: "successful",
  all: "total",
  pending: "pending",
  failed: "unsuccessful",
};

const OUTCOMES: Array<{ key: string; label: string }> = [
  { key: "succeeded", label: "Succeeded" },
  { key: "pending", label: "Pending" },
  { key: "initializing", label: "Initiated" },
  { key: "underpaid", label: "Underpaid" },
  { key: "failed", label: "Failed" },
  { key: "expired", label: "Expired" },
];

const PROVIDERS = [
  { name: "Bachs", desc: "Wallet funding", live: true },
  { name: "VTPass", desc: "Bills & utilities", state: "Standby" },
  { name: "SMEPlug", desc: "Data & airtime", state: "Standby" },
  { name: "Pairgate", desc: "VTU fallback", state: "Test Mode" },
];

const ORDER_OUTCOMES: Array<{ key: string; label: string }> = [
  { key: "successful", label: "Successful" },
  { key: "processing", label: "Processing" },
  { key: "pending", label: "Pending" },
  { key: "initiated", label: "Initiated" },
  { key: "failed", label: "Failed" },
  { key: "reversed", label: "Reversed" },
  { key: "cancelled", label: "Cancelled" },
];

function timeAgo(value: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase() || "U";
}

export default function AdminDashboard({ admin, overview, activity }: { admin: AdminSession; overview: AdminOverview; activity: string }) {
  const firstName = admin.fullName.split(/\s+/)[0] || "Admin";
  const hero = overview.hero;
  const chartMax = Math.max(1, ...hero.chart.map((point) => point.value));
  const outcomeCatalog = hero.metric === "deposits" ? OUTCOMES : ORDER_OUTCOMES;
  const heroOutcomes = outcomeCatalog
    .map((item) => ({
      ...item,
      count: hero.statuses[item.key] ?? 0,
      href:
        hero.metric === "deposits"
          ? `/admin/money/funding?status=${item.key}`
          : `/admin/operations/transactions?status=${item.key}`,
    }))
    .filter((item) => item.count > 0);
  const values = {
    period: overview.periodDays === 7 ? "" : String(overview.periodDays),
    view: hero.metric === "deposits" ? "" : hero.metric,
    scope: hero.scope === "all" ? "" : hero.scope,
    outcome: hero.outcome === "completed" ? "" : hero.outcome,
    activity,
  };
  const scopeOptions = hero.metric === "deposits" ? DEPOSIT_SCOPE_OPTIONS : SERVICE_SCOPE_OPTIONS;
  const unitNoun = hero.metric === "deposits"
    ? hero.matchingCount === 1 ? "deposit" : "deposits"
    : hero.matchingCount === 1 ? "order" : "orders";
  const contextParts = [
    METRIC_LABEL[hero.metric],
    PERIOD_LABEL[overview.periodDays] ?? `last ${overview.periodDays} days`,
    hero.scope !== "all" ? SCOPE_LABEL[hero.scope] : null,
  ].filter(Boolean);

  return (
    <UrlList values={values}>
      <div className="space-y-5 pb-4 sm:space-y-7 sm:pb-8">
        <header className="flex flex-col gap-3.5 sm:flex-row sm:items-end sm:justify-between sm:gap-5">
          <h1 className="text-[24px] font-semibold tracking-[-0.04em] text-zinc-950 sm:text-[30px]">Welcome Back, {firstName}</h1>
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            <Link href="/admin/analytics/reports" className={button.secondary}>
              Reports
            </Link>
            <Link href="/admin/operations/live" className={button.primary}>
              <AdminIcon name="pulse" />
              Live Operations
            </Link>
          </div>
        </header>

        {!overview.connected ? (
          <div className="a-in flex flex-col gap-4 rounded-[8px] bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-a-surface text-amber-700">
                <AdminIcon name="plug" className="size-[18px]" />
              </span>
              <p className="text-[14px] font-semibold text-amber-700">Live Data Isn&apos;t Connected</p>
            </div>
            <Link href="/admin/platform/health" className={button.secondary}>
              System Health
            </Link>
          </div>
        ) : null}

        <section className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
          <div className="min-w-0 space-y-5">
            {/* Hero overview card: metric, duration, scope & outcome dropdowns + trend. */}
            <div className={cn(card, "a-in relative z-10")}>
              <div className="flex flex-col gap-2.5 border-b border-a-line/70 px-4 py-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-8 sm:py-4">
                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                  <UrlSelect
                    param="view"
                    fallback="deposits"
                    options={METRIC_OPTIONS}
                    leadingIcon={METRIC_ICON[hero.metric]}
                    ariaLabel="Metric"
                    className="w-full sm:w-auto"
                    resetParams={{ scope: null }}
                  />
                  <UrlSelect
                    param="period"
                    fallback="7"
                    options={PERIOD_OPTIONS}
                    leadingIcon="calendar"
                    ariaLabel="Duration"
                    className="w-full sm:w-auto"
                  />
                  <UrlSelect
                    param="scope"
                    fallback="all"
                    options={scopeOptions}
                    leadingIcon="filter"
                    ariaLabel={hero.metric === "deposits" ? "Channel" : "Service"}
                    className="w-full sm:w-auto"
                  />
                  <UrlSelect
                    param="outcome"
                    fallback="completed"
                    options={OUTCOME_OPTIONS}
                    leadingIcon="checkCircle"
                    ariaLabel="Outcome"
                    className="w-full sm:w-auto"
                    menuAlign="right"
                  />
                </div>
                <UrlResetButton params={["view", "period", "scope", "outcome"]} />
              </div>

              <div className="p-4 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-4 sm:flex-nowrap sm:items-start">
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-zinc-500 sm:text-[13px]">{contextParts.join(" · ")}</p>
                    <p className="mt-2 sm:mt-2.5">
                      <NairaAmount value={hero.totalValue} />
                    </p>
                    <div className="mt-2.5 inline-flex items-center gap-2 rounded-[7px] border border-a-line/70 bg-a-surface-soft px-2.5 py-1.5 sm:mt-3">
                      <span className={cn("size-1.5 shrink-0 rounded-full", OUTCOME_DOT[hero.outcome] ?? "bg-primary")} />
                      <span data-font="sans" className="text-[13px] leading-none font-semibold text-zinc-950 tabular-nums">
                        {hero.matchingCount.toLocaleString("en-NG")}
                      </span>
                      <span className="font-mono text-[11.5px] leading-none text-zinc-500">
                        {OUTCOME_WORD[hero.outcome] ?? "matching"} {unitNoun}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <ProgressRing value={hero.successRate} size={56}>
                      <span className="text-[12.5px] font-semibold text-zinc-900 tabular-nums">{Math.round(hero.successRate)}%</span>
                    </ProgressRing>
                    <span>
                      <span className="block text-[13px] font-semibold text-zinc-900 sm:text-[13.5px]">Success rate</span>
                      <span
                        className={cn(
                          "text-[11.5px] font-medium sm:text-[12px]",
                          hero.settledCount === 0
                            ? "text-zinc-400"
                            : hero.successRate >= 95
                              ? "text-emerald-700"
                              : "text-amber-700",
                        )}
                      >
                        {hero.settledCount === 0 ? "No settled yet" : hero.successRate >= 95 ? "Healthy" : "Needs a look"}
                      </span>
                    </span>
                  </div>
                </div>

                {hero.chart.length > 1 ? (
                  <div className="mt-6 flex h-28 items-end gap-1.5 sm:mt-8 sm:h-40 sm:gap-2" role="img" aria-label={`${METRIC_LABEL[hero.metric]} volume`}>
                    {hero.chart.map((point, index) => {
                      const latest = index === hero.chart.length - 1;
                      const hideOddMobile = hero.chart.length > 7 && index % 2 === 1 && !latest;
                      return (
                        <div key={`${point.label}-${index}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                          <span tabIndex={0} className="group relative flex w-full flex-1 items-end justify-center outline-none">
                            <span
                              className={cn("a-rise w-full max-w-[28px] rounded-t-[4px]", latest ? "bg-a-accent" : "bg-primary")}
                              style={{ height: point.value ? `${Math.max(4, (point.value / chartMax) * 100)}%` : 3, opacity: point.value ? 1 : 0.15, animationDelay: `${index * 40}ms` }}
                            />
                            <Tip>
                              {money(point.value)} · {point.count} {point.count === 1 ? (hero.metric === "deposits" ? "deposit" : "order") : (hero.metric === "deposits" ? "deposits" : "orders")}
                            </Tip>
                          </span>
                          <span className={cn("truncate font-mono text-[10.5px] font-medium sm:text-[11px]", latest ? "text-a-accent-ink" : "text-zinc-400", hideOddMobile && "max-sm:hidden")}>{point.label}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {heroOutcomes.length ? (
                  <div className="mt-5 border-t border-a-line/70 pt-4 sm:mt-7 sm:pt-5">
                    <Ribbon segments={heroOutcomes} />
                  </div>
                ) : null}

                <div className="mt-5 grid grid-cols-1 gap-1 border-t border-primary/10 pt-4 sm:mt-7 sm:grid-cols-3 sm:gap-2 sm:pt-5">
                  <QuickLink href="/admin/customers/wallets" icon="wallet" title="Wallet float" detail={money(overview.metrics.walletFloat)} />
                  <QuickLink href="/admin/users" icon="users" title="Customers" detail={`${overview.metrics.registeredUsers.toLocaleString("en-NG")} registered`} />
                  <QuickLink href="/admin/operations/pending" icon="clock" title="Awaiting status" detail={money(overview.metrics.pendingValue)} />
                </div>
              </div>
            </div>

            {/* Recent funding, filterable by state. */}
            <section className={cn(card, "a-in p-4 sm:p-6")}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-zinc-900">Recent Funding</h2>
                <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
                  <div className="min-w-0 flex-1 sm:w-[155px] sm:flex-none">
                    <UrlSelect
                      param="activity"
                      options={[
                        { value: "", label: "All statuses" },
                        ...OUTCOMES.map((outcome) => ({ value: outcome.key, label: outcome.label })),
                        { value: "review", label: "In review" },
                      ]}
                      leadingIcon="filter"
                      variant="default"
                      ariaLabel="Funding status"
                    />
                  </div>
                  <TextLink href="/admin/money/funding">All Funding</TextLink>
                </div>
              </div>
              {overview.recent.length ? (
                <div className="mt-3 divide-y divide-[color:var(--a-border)]">
                  {overview.recent.slice(0, 8).map((row) => (
                    <div key={row.id} className="flex items-center gap-3 py-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-a-primary-soft text-[12px] font-semibold text-primary">{initials(row.customer)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-zinc-800">{row.customer}</span>
                        <span className="mt-0.5 block truncate text-[12px] text-zinc-500">
                          {row.reference} · {timeAgo(row.createdAt)}
                        </span>
                      </span>
                      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                        <span className="text-[13.5px] font-semibold text-zinc-900 tabular-nums">{money(row.amount)}</span>
                        <StatusBadge value={row.status} size="sm" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4">
                  <EmptyNote icon="funding" title={activity ? "Nothing in This State" : "No Funding Yet"} />
                </div>
              )}
            </section>
          </div>

          <aside className="min-w-0">
            <section className={cn(card, "a-in divide-y divide-[color:var(--a-border)]")}>
              <div className="p-4 sm:p-6">
                <SectionTitle
                  title="Needs Attention"
                  action={<TextLink href="/admin/operations/live">Live Queue</TextLink>}
                />
                <div className="mt-4 space-y-1">
                  {overview.alerts.map((alert) => (
                    <AttentionRow key={alert.title} href={alert.href} tone={alert.tone} title={alert.title} />
                  ))}
                  {overview.metrics.pendingValue > 0 ? (
                    <AttentionRow href="/admin/money/reconciliation" tone="info" title={`${money(overview.metrics.pendingValue)} awaiting final status`} />
                  ) : null}
                </div>
              </div>

              <div className="p-5 sm:p-6">
                <SectionTitle title="Providers" action={<TextLink href="/admin/products/providers">Manage</TextLink>} />
                <div className="mt-3 divide-y divide-[color:var(--a-border)]">
                  {PROVIDERS.map((provider) => (
                    <Link key={provider.name} href="/admin/products/providers" className="group flex items-center gap-3 py-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-zinc-100 text-[12px] font-semibold text-zinc-600 group-hover:bg-a-primary-soft group-hover:text-primary">{provider.name[0]}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-zinc-800 group-hover:text-primary">{provider.name}</span>
                        <span className="mt-0.5 block truncate text-[12px] text-zinc-500">{provider.desc}</span>
                      </span>
                      <StatusBadge value={provider.live ? (overview.connected ? "Operational" : "Checking") : provider.state ?? "Standby"} size="sm" />
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </UrlList>
  );
}

function QuickLink({ href, icon, title, detail }: { href: string; icon: string; title: string; detail: string }) {
  return (
    <Link href={href} className="group flex min-w-0 items-center gap-3 rounded-[8px] px-3 py-2.5 transition-colors hover:bg-zinc-50">
      <span className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-a-primary-soft text-primary">
        <AdminIcon name={icon} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-zinc-800">{title}</span>
        <span className="mt-0.5 block truncate text-[12px] text-zinc-500 tabular-nums">{detail}</span>
      </span>
      <AdminIcon name="arrowRight" className="size-3.5 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}

function AttentionRow({ href, tone, title }: { href: string; tone: "critical" | "warning" | "info"; title: string }) {
  return (
    <Link href={href} className="group -mx-2 flex items-center gap-2.5 rounded-[8px] px-2 py-2 transition-colors hover:bg-zinc-50">
      <span className={cn("size-2 shrink-0 rounded-full", tone === "critical" ? "bg-rose-500" : tone === "warning" ? "bg-amber-500" : "bg-sky-500")} />
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-zinc-700 group-hover:text-zinc-950">{title}</span>
      <AdminIcon name="arrowRight" className="size-3.5 shrink-0 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}
