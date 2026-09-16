import Link from "next/link";
import type { CSSProperties } from "react";
import type { AdminSession } from "../../../../lib/admin/auth";
import type { AdminOverview } from "../../../../lib/admin/overview";
import styles from "../../admin.module.css";
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
  const firstName = admin.fullName.split(/\s+/)[0];
  const maxChartValue = Math.max(...overview.chart.map((point) => point.value), 1);
  const totalStatuses = Object.values(overview.statuses).reduce((sum, count) => sum + count, 0);
  const statusSegments = [
    { key: "succeeded", label: "Successful", tone: "green" },
    { key: "pending", label: "Pending", tone: "amber" },
    { key: "initializing", label: "Initiated", tone: "blue" },
    { key: "failed", label: "Failed", tone: "red" },
  ];

  return (
    <div className={`${styles.dashboardPage} ${styles.controlCentre}`}>
      <header className={styles.controlHeader}>
        <div>
          <span className={styles.pageEyebrow}>Live Operations <i /></span>
          <h1>Good afternoon, {firstName}.</h1>
          <p>Money, customers and provider health—clearly in view.</p>
        </div>
        <div className={styles.controlHeaderActions}>
          <Link className={styles.secondaryButton} href="/admin/analytics/reports"><AdminIcon name="report" />Export Snapshot</Link>
          <Link className={styles.primaryButton} href="/admin/operations/live"><AdminIcon name="pulse" />Live Operations</Link>
        </div>
      </header>

      {!overview.connected ? (
        <div className={styles.connectionBanner}>
          <span><AdminIcon name="plug" /></span>
          <div><strong>Connect the operational dataset</strong><p>Apply the control-plane migration to unlock live reporting.</p></div>
          <Link href="/admin/platform/health">Review Setup →</Link>
        </div>
      ) : null}

      <div className={styles.controlPeriod}>
        <div>
          <span>View Period</span>
          <small>Updated moments ago</small>
        </div>
        <nav aria-label="Dashboard period">
          {[1, 7, 30, 90].map((days) => (
            <Link key={days} href={`/admin/dashboard?period=${days}`} data-active={overview.periodDays === days}>
              {days === 1 ? "Today" : `${days} Days`}
            </Link>
          ))}
        </nav>
      </div>

      <section className={styles.controlOverview} aria-label="Business overview">
        <div className={styles.controlBalance}>
          <div className={styles.controlBalanceTop}>
            <span>Wallet Deposits</span>
            <AdminIcon name="funding" />
          </div>
          <strong>{money(overview.metrics.walletDeposits)}</strong>
          <p>Successful funding in this period</p>
          <div className={styles.controlSparkline} aria-hidden="true">
            {overview.chart.length ? overview.chart.map((point, index) => (
              <i key={`${point.label}-${index}`} style={{ height: `${Math.max(12, (point.value / maxChartValue) * 100)}%` }} />
            )) : [28, 46, 34, 66, 48, 82, 58].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
          </div>
        </div>

        <div className={styles.controlMetrics}>
          <article><span>Wallet Float</span><strong>{money(overview.metrics.walletFloat)}</strong><small>Across customer wallets</small></article>
          <article><span>Funding Success</span><strong>{overview.metrics.successRate.toFixed(1)}%</strong><small data-tone={overview.metrics.successRate >= 95 ? "good" : "warn"}>{overview.metrics.successRate >= 95 ? "Healthy performance" : "Needs attention"}</small></article>
          <article><span>Registered Users</span><strong>{overview.metrics.registeredUsers.toLocaleString("en-NG")}</strong><small>All-time customers</small></article>
        </div>

      </section>

      <section className={styles.controlAttention}>
        <div className={styles.controlSectionHeading}>
          <div><span className={styles.sectionEyebrow}>Action Queue</span><h2>Needs Attention</h2></div>
          <Link href="/admin/operations/live">View All →</Link>
        </div>
        <div className={styles.controlAttentionList}>
          {overview.alerts.map((alert) => (
            <Link href={alert.href} data-tone={alert.tone} key={alert.title}>
              <span><AdminIcon name={alert.tone === "critical" ? "alert" : alert.tone === "warning" ? "clock" : "pulse"} /></span>
              <span><strong>{alert.title}</strong><small>{alert.detail}</small></span>
              <b>→</b>
            </Link>
          ))}
          <Link href="/admin/money/reconciliation" data-tone="neutral">
            <span><AdminIcon name="reconcile" /></span>
            <span><strong>{money(overview.metrics.pendingValue)} awaiting final status</strong><small>Review unresolved records before intervening.</small></span>
            <b>→</b>
          </Link>
        </div>
      </section>

      <section className={styles.controlAnalytics}>
        <article className={styles.controlVolume}>
          <div className={styles.controlSectionHeading}>
            <div><span className={styles.sectionEyebrow}>Money Movement</span><h2>Deposit Volume</h2></div>
            <span className={styles.controlLegend}><i />Successful Funding</span>
          </div>
          <div className={styles.controlChartSummary}><strong>{money(overview.metrics.walletDeposits)}</strong><span>{overview.statuses.succeeded ?? 0} completed deposits</span></div>
          <div className={styles.controlBars} aria-label="Deposit volume chart">
            {(overview.chart.length ? overview.chart : Array.from({ length: 7 }, (_, index) => ({ label: "—", value: [20, 34, 26, 48, 39, 62, 45][index], count: 0 }))).map((point, index) => (
              <div key={`${point.label}-${index}`} title={`${point.label}: ${money(point.value)}`}>
                <span><i style={{ height: `${overview.chart.length ? Math.max(5, (point.value / maxChartValue) * 100) : point.value}%` }} /></span>
                <small>{point.label}</small>
              </div>
            ))}
          </div>
        </article>

        <article className={styles.controlHealth}>
          <div className={styles.controlSectionHeading}>
            <div><span className={styles.sectionEyebrow}>Quality</span><h2>Transaction Health</h2></div>
            <Link href="/admin/analytics/transactions">Details</Link>
          </div>
          <div className={styles.controlHealthLead}>
            <div className={styles.healthRing} style={{ "--score": `${Math.max(overview.metrics.successRate, 2) * 3.6}deg` } as CSSProperties}>
              <span><strong>{overview.metrics.successRate.toFixed(1)}%</strong><small>Success</small></span>
            </div>
            <div><strong>{overview.metrics.successRate >= 95 ? "Looking healthy" : "Worth a closer look"}</strong><p>Final outcomes in this period.</p></div>
          </div>
          <div className={styles.controlStatusList}>
            {statusSegments.map((segment) => {
              const count = overview.statuses[segment.key] ?? 0;
              const percentage = totalStatuses ? (count / totalStatuses) * 100 : 0;
              return <div key={segment.key}><span><i data-tone={segment.tone}/>{segment.label}<small>{count}</small></span><b><i data-tone={segment.tone} style={{ width: `${percentage}%` }}/></b></div>;
            })}
          </div>
        </article>
      </section>

      <section className={styles.controlLower}>
        <article className={styles.controlActivity}>
          <div className={styles.controlSectionHeading}>
            <div><span className={styles.sectionEyebrow}>Right Now</span><h2>Recent Activity</h2></div>
            <span className={styles.liveChip}><i />Live</span>
          </div>
          <div className={styles.activityStream}>
            <table className={styles.controlActivityTable}>
              <thead><tr><th>Customer</th><th>Reference</th><th>Provider</th><th>Amount</th><th>Status</th><th>Time</th></tr></thead>
              <tbody>
                {overview.recent.length ? overview.recent.slice(0, 8).map((row) => (
                  <tr key={row.id}>
                    <td><span className={styles.activityCustomer}><span className={styles.tableAvatar}>{row.customer.slice(0, 2).toUpperCase()}</span><strong>{row.customer}</strong></span></td>
                    <td><code>{row.reference}</code></td>
                    <td><strong>{row.provider}</strong></td>
                    <td><strong>{money(row.amount)}</strong></td>
                    <td><span className={styles.statusPill} data-status={row.status}>{statusLabel(row.status)}</span></td>
                    <td><time dateTime={row.createdAt}>{timeAgo(row.createdAt)}</time></td>
                  </tr>
                )) : <tr><td colSpan={6}><div className={styles.tableEmpty}><AdminIcon name="pulse"/><strong>No Funding Activity Yet</strong><span>New transactions will appear here as they happen.</span></div></td></tr>}
              </tbody>
            </table>
          </div>
          <Link className={styles.controlFooterLink} href="/admin/transactions">Open Transaction Explorer <span>→</span></Link>
        </article>

        <aside className={styles.controlProviders}>
          <div className={styles.controlSectionHeading}>
            <div><span className={styles.sectionEyebrow}>Connections</span><h2>Provider Pulse</h2></div>
            <Link href="/admin/products/providers">Manage</Link>
          </div>
          <div className={styles.providerList}>
            <Link className={styles.providerPulseItem} href="/admin/products/providers">
              <span className={styles.providerLogo}>B</span>
              <span className={styles.providerIdentity}><strong>Bachs</strong><small>Wallet Funding</small></span>
              <span className={styles.providerState} data-state={overview.connected ? "operational" : "checking"}><i/>{overview.connected ? "Operational" : "Checking"}</span>
              <span className={styles.providerPulseArrow} aria-hidden="true">→</span>
            </Link>
            <Link className={styles.providerPulseItem} href="/admin/products/providers">
              <span className={styles.providerLogo}>V</span>
              <span className={styles.providerIdentity}><strong>VTPass</strong><small>Bills &amp; Utilities</small></span>
              <span className={styles.providerState} data-state="standby"><i/>Standby</span>
              <span className={styles.providerPulseArrow} aria-hidden="true">→</span>
            </Link>
            <Link className={styles.providerPulseItem} href="/admin/products/providers">
              <span className={styles.providerLogo}>S</span>
              <span className={styles.providerIdentity}><strong>SMEPlug</strong><small>Data &amp; Airtime</small></span>
              <span className={styles.providerState} data-state="standby"><i/>Standby</span>
              <span className={styles.providerPulseArrow} aria-hidden="true">→</span>
            </Link>
            <Link className={styles.providerPulseItem} href="/admin/products/providers">
              <span className={styles.providerLogo}>P</span>
              <span className={styles.providerIdentity}><strong>Pairgate</strong><small>VTU Fallback</small></span>
              <span className={styles.providerState} data-state="standby"><i/>Test Mode</span>
              <span className={styles.providerPulseArrow} aria-hidden="true">→</span>
            </Link>
          </div>
          <Link className={styles.providerBalanceLink} href="/admin/products/providers"><AdminIcon name="wallet"/><span><strong>Provider Balances</strong><small>Review thresholds and available float</small></span><span>→</span></Link>
        </aside>
      </section>
    </div>
  );
}
