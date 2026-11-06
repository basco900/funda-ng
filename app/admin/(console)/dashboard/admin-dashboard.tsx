"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { AdminSession } from "../../../../lib/admin/auth";
import type { AdminOverview } from "../../../../lib/admin/overview";
import { cn } from "../../../../lib/utils";
import AdminIcon from "../admin-icon";

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

function money(value: number) {
  return naira.format(value).replace("NGN", "₦");
}

function timeAgo(value: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function statusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function AdminDashboard({ admin, overview }: { admin: AdminSession; overview: AdminOverview }) {
  const firstName = admin.fullName.split(/\s+/)[0] || "Admin";
  const maxChartValue = Math.max(...overview.chart.map((point) => point.value), 1);
  const totalStatuses = Object.values(overview.statuses).reduce((sum, count) => sum + count, 0);
  const statusSegments = [
    { key: "succeeded", label: "Successful", color: "bg-emerald-500", text: "text-emerald-700" },
    { key: "pending", label: "Pending", color: "bg-amber-500", text: "text-amber-700" },
    { key: "initializing", label: "Initiated", color: "bg-blue-500", text: "text-blue-700" },
    { key: "failed", label: "Failed", color: "bg-rose-500", text: "text-rose-700" },
  ];

  return (
    <div className="flex flex-col h-full space-y-6 pb-8 font-sans text-zinc-900">
      {/* Header (Jobly Africa pattern) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold text-zinc-400 mb-1 tracking-wide">
            <span>Admin Panel</span>
            <span className="text-zinc-300">→</span>
            <span className="text-zinc-900">Platform Overview</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-zinc-900">
            Welcome back, {firstName}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector tabs */}
          <div className="inline-flex rounded-[6px] border border-zinc-200 bg-white p-0.5 shadow-xs">
            {[1, 7, 30, 90].map((days) => (
              <Link
                key={days}
                href={`/admin/dashboard?period=${days}`}
                className={cn(
                  "rounded-[5px] px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  overview.periodDays === days
                    ? "bg-primary text-white"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50",
                )}
              >
                {days === 1 ? "Today" : `${days}d`}
              </Link>
            ))}
          </div>

          <Link
            href="/admin/analytics/reports"
            className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-zinc-200 rounded-[6px] shadow-xs text-xs font-semibold text-zinc-700 hover:text-primary hover:border-primary/30 transition-colors"
          >
            <AdminIcon name="report" className="h-3.5 w-3.5 text-zinc-400" />
            Export
          </Link>

          <Link
            href="/admin/operations/live"
            className="flex items-center gap-1.5 h-9 px-3.5 bg-primary text-white rounded-[6px] shadow-xs text-xs font-semibold hover:bg-primary/90 transition-colors"
          >
            <AdminIcon name="pulse" className="h-3.5 w-3.5" />
            Live Ops
          </Link>
        </div>
      </div>

      {!overview.connected && (
        <div className="flex items-center justify-between rounded-[8px] border border-amber-200/80 bg-amber-50/70 p-4 text-[12.5px] text-amber-900">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-amber-100 text-amber-700">
              <AdminIcon name="plug" className="h-4 w-4" />
            </span>
            <div>
              <strong className="block font-semibold">Live data not connected</strong>
              <span className="text-[11.5px] text-amber-700">Run the latest database migrations to enable real-time reporting.</span>
            </div>
          </div>
          <Link
            href="/admin/platform/health"
            className="rounded-[6px] border border-amber-300 bg-white px-3 py-1 text-[11.5px] font-semibold text-amber-800 hover:bg-amber-50"
          >
            Set up →
          </Link>
        </div>
      )}

      {/* Grid: Platform Health + 3 Key Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Platform Overview Card */}
        <div className="lg:col-span-5 rounded-[8px] border border-slate-200/70 bg-white p-5 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex justify-between items-center mb-4">
              <span className="text-[11px] font-bold uppercase text-zinc-500 tracking-wider">
                Deposit Volume
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200/50">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Live Feed
              </span>
            </div>

            <div className="mb-4">
              <div className="text-[28px] font-semibold tracking-tight text-zinc-900">
                {money(overview.metrics.walletDeposits)}
              </div>
              <p className="text-[12px] text-zinc-500 mt-0.5">
                Total completed wallet top-ups in this period
              </p>
            </div>
          </div>

          <div className="rounded-[8px] border border-zinc-100/80 bg-zinc-50/80 p-4">
            <div className="flex justify-between items-center mb-2 text-[11.5px]">
              <span className="font-semibold text-zinc-700">Activity Trend</span>
              <span className="text-[10.5px] font-bold text-primary">
                {overview.statuses.succeeded ?? 0} deposits
              </span>
            </div>

            {/* Mini Bar Chart matching Jobly Africa */}
            <div className="h-12 w-full flex items-end gap-1.5 pt-2">
              {(overview.chart.length
                ? overview.chart
                : Array.from({ length: 7 }, (_, i) => ({ label: `D${i + 1}`, value: [30, 45, 60, 40, 80, 70, 95][i] }))
              ).map((point, index) => {
                const heightPercent = overview.chart.length
                  ? Math.max(12, (point.value / maxChartValue) * 100)
                  : point.value;
                return (
                  <div key={index} className="flex-1 flex flex-col items-center gap-1 group">
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className="w-full rounded-t-[3px] bg-primary/70 group-hover:bg-primary transition-colors"
                      title={`${point.label}: ${money(point.value)}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: 3 Metric Cards */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-[8px] border border-slate-200/70 bg-white p-5 flex flex-col justify-between shadow-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Wallet Float
              </span>
              <div className="text-[22px] font-semibold tracking-tight text-zinc-900 mt-2">
                {money(overview.metrics.walletFloat)}
              </div>
            </div>
            <p className="text-[11px] text-zinc-400 mt-4 border-t border-zinc-100 pt-2">
              Across customer accounts
            </p>
          </div>

          <div className="rounded-[8px] border border-slate-200/70 bg-white p-5 flex flex-col justify-between shadow-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Funding Success
              </span>
              <div className="text-[22px] font-semibold tracking-tight text-zinc-900 mt-2">
                {overview.metrics.successRate.toFixed(1)}%
              </div>
            </div>
            <p
              className={cn(
                "text-[11px] font-medium mt-4 border-t border-zinc-100 pt-2",
                overview.metrics.successRate >= 95 ? "text-emerald-700" : "text-amber-700",
              )}
            >
              {overview.metrics.successRate >= 95 ? "● Healthy rate" : "▲ Needs attention"}
            </p>
          </div>

          <div className="rounded-[8px] border border-slate-200/70 bg-white p-5 flex flex-col justify-between shadow-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Registered Users
              </span>
              <div className="text-[22px] font-semibold tracking-tight text-zinc-900 mt-2">
                {overview.metrics.registeredUsers.toLocaleString("en-NG")}
              </div>
            </div>
            <p className="text-[11px] text-zinc-400 mt-4 border-t border-zinc-100 pt-2">
              All-time customers
            </p>
          </div>

          {/* Attention Alerts Strip */}
          <div className="sm:col-span-3 rounded-[8px] border border-slate-200/70 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3 border-b border-zinc-100 pb-2">
              <h2 className="text-[13px] font-semibold text-zinc-900">Needs Attention</h2>
              <Link href="/admin/operations/live" className="text-[11px] font-bold text-primary hover:underline">
                View All →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {overview.alerts.map((alert) => (
                <Link
                  key={alert.title}
                  href={alert.href}
                  className="flex items-center justify-between rounded-[6px] border border-zinc-100 bg-zinc-50/60 p-2.5 hover:bg-zinc-100/80 transition-colors group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full shrink-0",
                        alert.tone === "critical"
                          ? "bg-rose-500"
                          : alert.tone === "warning"
                          ? "bg-amber-500"
                          : "bg-blue-500",
                      )}
                    />
                    <div className="min-w-0">
                      <strong className="block text-[12px] font-semibold text-zinc-800 truncate">
                        {alert.title}
                      </strong>
                      <small className="block text-[10.5px] text-zinc-400 truncate">
                        {alert.detail}
                      </small>
                    </div>
                  </div>
                  <span className="text-zinc-400 group-hover:text-primary text-[12px]">→</span>
                </Link>
              ))}
              <Link
                href="/admin/money/reconciliation"
                className="flex items-center justify-between rounded-[6px] border border-zinc-100 bg-zinc-50/60 p-2.5 hover:bg-zinc-100/80 transition-colors group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2 w-2 rounded-full bg-zinc-400 shrink-0" />
                  <div className="min-w-0">
                    <strong className="block text-[12px] font-semibold text-zinc-800 truncate">
                      {money(overview.metrics.pendingValue)} awaiting final status
                    </strong>
                    <small className="block text-[10.5px] text-zinc-400 truncate">
                      Unresolved items
                    </small>
                  </div>
                </div>
                <span className="text-zinc-400 group-hover:text-primary text-[12px]">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Lower Row: Recent Activity Table + Provider Pulse */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Activity Table Card (Jobly Africa exact table styling) */}
        <div className="lg:col-span-8 rounded-[8px] border border-slate-200/70 bg-white overflow-hidden shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-semibold tracking-tight text-slate-950">
                Recent Activity
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9.5px] font-bold text-emerald-700 border border-emerald-200/50">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            </div>
            <Link
              href="/admin/transactions"
              className="text-[11.5px] font-semibold text-primary hover:underline"
            >
              All transactions →
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200/70 bg-[#fafafa]">
                  <th className="h-9.5 px-4 text-[10px] font-bold uppercase tracking-[0.11em] text-slate-600">
                    Customer
                  </th>
                  <th className="h-9.5 px-4 text-[10px] font-bold uppercase tracking-[0.11em] text-slate-600">
                    Reference
                  </th>
                  <th className="h-9.5 px-4 text-[10px] font-bold uppercase tracking-[0.11em] text-slate-600">
                    Provider
                  </th>
                  <th className="h-9.5 px-4 text-[10px] font-bold uppercase tracking-[0.11em] text-slate-600">
                    Amount
                  </th>
                  <th className="h-9.5 px-4 text-[10px] font-bold uppercase tracking-[0.11em] text-slate-600">
                    Status
                  </th>
                  <th className="h-9.5 px-4 pr-5 text-right text-[10px] font-bold uppercase tracking-[0.11em] text-slate-600">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {overview.recent.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="h-40 text-center text-slate-400 text-[12.5px]">
                      No funding activity yet in this period.
                    </td>
                  </tr>
                ) : (
                  overview.recent.slice(0, 7).map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-slate-200/65 hover:bg-slate-50/55 transition-colors"
                    >
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                            {row.customer.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="text-[12.5px] font-bold text-slate-900 truncate max-w-[140px]">
                            {row.customer}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-[11px] font-mono text-slate-600">
                        {row.reference}
                      </td>
                      <td className="py-2.5 px-4 text-[12px] font-medium text-slate-800">
                        {row.provider}
                      </td>
                      <td className="py-2.5 px-4 text-[12.5px] font-bold text-slate-900">
                        {money(row.amount)}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold",
                            row.status === "succeeded"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200/50"
                              : row.status === "pending"
                              ? "bg-amber-50 text-amber-700 border border-amber-200/50"
                              : "bg-rose-50 text-rose-700 border border-rose-200/50",
                          )}
                        >
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 pr-5 text-right text-[11.5px] text-slate-400">
                        {timeAgo(row.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Provider Pulse Card */}
        <div className="lg:col-span-4 rounded-[8px] border border-slate-200/70 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-zinc-100 pb-2">
              <h2 className="text-[14px] font-semibold text-slate-950">Provider Pulse</h2>
              <Link href="/admin/products/providers" className="text-[11.5px] font-semibold text-primary hover:underline">
                Manage →
              </Link>
            </div>

            <div className="space-y-2">
              {[
                { name: "Bachs", desc: "Wallet Funding", state: overview.connected ? "Operational" : "Checking", tone: "good", mark: "B" },
                { name: "VTPass", desc: "Bills & Utilities", state: "Standby", tone: "standby", mark: "V" },
                { name: "SMEPlug", desc: "Data & Airtime", state: "Standby", tone: "standby", mark: "S" },
                { name: "Pairgate", desc: "VTU Fallback", state: "Test Mode", tone: "standby", mark: "P" },
              ].map((provider) => (
                <Link
                  key={provider.name}
                  href="/admin/products/providers"
                  className="flex items-center justify-between rounded-[7px] border border-zinc-100 bg-zinc-50/50 p-2.5 hover:bg-zinc-100/70 transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-primary/10 text-primary font-bold text-xs">
                      {provider.mark}
                    </span>
                    <div>
                      <strong className="block text-[12.5px] font-semibold text-zinc-900 group-hover:text-primary">
                        {provider.name}
                      </strong>
                      <small className="block text-[10.5px] text-zinc-400">
                        {provider.desc}
                      </small>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      provider.tone === "good"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200/50"
                        : "bg-zinc-100 text-zinc-600 border border-zinc-200/60",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        provider.tone === "good" ? "bg-emerald-500" : "bg-zinc-400",
                      )}
                    />
                    {provider.state}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <Link
            href="/admin/products/providers"
            className="mt-4 flex items-center justify-between rounded-[7px] border border-primary/20 bg-primary/[0.04] p-3 text-[12px] font-semibold text-primary hover:bg-primary/[0.08] transition-colors"
          >
            <div className="flex items-center gap-2">
              <AdminIcon name="wallet" className="h-4 w-4" />
              <span>Provider Thresholds &amp; Balances</span>
            </div>
            <span>→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
