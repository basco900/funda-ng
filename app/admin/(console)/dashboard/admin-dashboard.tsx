import Link from "next/link";
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
    <div className={styles.dashboardPage}>
      <section className={styles.pageHeading}>
        <div>
          <span className={styles.pageEyebrow}>Tuesday, 18 August · <i /> Live operations</span>
          <h1>Good afternoon, {firstName}.</h1>
          <p>Here’s the pulse of Funda—money, customers and providers in one place.</p>
        </div>
        <div className={styles.pageHeadingActions}>
          <Link className={styles.secondaryButton} href="/admin/analytics/reports"><AdminIcon name="report" />Export snapshot</Link>
          <Link className={styles.primaryButton} href="/admin/operations/live"><AdminIcon name="pulse" />Open live operations</Link>
        </div>
      </section>

      {!overview.connected ? (
        <div className={styles.connectionBanner}>
          <span><AdminIcon name="plug" /></span>
          <div><strong>Admin is running in foundation mode.</strong><p>Apply the control-plane migration to connect the full operational dataset.</p></div>
          <Link href="/admin/platform/health">Review setup <span>→</span></Link>
        </div>
      ) : null}

      <div className={styles.dashboardToolbar}>
        <div className={styles.periodTabs}>
          {[1, 7, 30, 90].map((days) => (
            <Link key={days} href={`/admin/dashboard?period=${days}`} data-active={overview.periodDays === days}>
              {days === 1 ? "Today" : `${days} days`}
            </Link>
          ))}
        </div>
        <span className={styles.lastUpdated}>Updated moments ago <button type="button" aria-label="Refresh dashboard">↻</button></span>
      </div>

      <section className={styles.metricsGrid} aria-label="Key business metrics">
        <article className={`${styles.metricCard} ${styles.metricCardHero}`}>
          <div className={styles.metricTop}><span>Wallet deposits</span><i data-tone="green"><AdminIcon name="funding" /></i></div>
          <strong>{money(overview.metrics.walletDeposits)}</strong>
          <div className={styles.metricFoot}><span data-positive="true">Live period total</span><small>Successful funding</small></div>
          <div className={styles.metricSparkline} aria-hidden="true"><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/></div>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.metricTop}><span>Wallet float</span><i data-tone="violet"><AdminIcon name="wallet" /></i></div>
          <strong>{money(overview.metrics.walletFloat)}</strong>
          <div className={styles.metricFoot}><span>Across customer wallets</span><small>Current balance</small></div>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.metricTop}><span>Funding success</span><i data-tone="blue"><AdminIcon name="pulse" /></i></div>
          <strong>{overview.metrics.successRate.toFixed(1)}%</strong>
          <div className={styles.metricFoot}><span data-positive={overview.metrics.successRate >= 95}>{overview.metrics.successRate >= 95 ? "Healthy" : "Needs attention"}</span><small>Completed attempts</small></div>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.metricTop}><span>Registered users</span><i data-tone="amber"><AdminIcon name="users" /></i></div>
          <strong>{overview.metrics.registeredUsers.toLocaleString("en-NG")}</strong>
          <div className={styles.metricFoot}><span>All-time customers</span><small>Profiles created</small></div>
        </article>
      </section>

      <section className={styles.attentionSection}>
        <div className={styles.sectionHeadingRow}>
          <div><span className={styles.sectionEyebrow}>Action queue</span><h2>Needs attention</h2></div>
          <Link href="/admin/operations/live">View all <span>→</span></Link>
        </div>
        <div className={styles.attentionGrid}>
          {overview.alerts.map((alert) => (
            <Link href={alert.href} className={styles.attentionCard} data-tone={alert.tone} key={alert.title}>
              <span className={styles.attentionIcon}><AdminIcon name={alert.tone === "critical" ? "alert" : alert.tone === "warning" ? "clock" : "pulse"} /></span>
              <span><strong>{alert.title}</strong><small>{alert.detail}</small></span>
              <span className={styles.attentionArrow}>→</span>
            </Link>
          ))}
          <Link href="/admin/money/reconciliation" className={styles.attentionCard} data-tone="neutral">
            <span className={styles.attentionIcon}><AdminIcon name="reconcile" /></span>
            <span><strong>{money(overview.metrics.pendingValue)} awaiting final status</strong><small>Review records before manual intervention.</small></span>
            <span className={styles.attentionArrow}>→</span>
          </Link>
        </div>
      </section>

      <section className={styles.dashboardCoreGrid}>
        <article className={`${styles.panel} ${styles.volumePanel}`}>
          <div className={styles.panelHeader}>
            <div><span className={styles.sectionEyebrow}>Money movement</span><h2>Deposit volume</h2></div>
            <div className={styles.panelLegend}><i /> Successful funding</div>
          </div>
          <div className={styles.chartSummary}>
            <strong>{money(overview.metrics.walletDeposits)}</strong>
            <span>{overview.statuses.succeeded ?? 0} completed deposits</span>
          </div>
          <div className={styles.barChart} aria-label="Deposit volume chart">
            {overview.chart.length ? overview.chart.map((point, index) => (
              <div className={styles.barColumn} key={`${point.label}-${index}`} title={`${point.label}: ${money(point.value)}`}>
                <div className={styles.barTrack}><span style={{ height: `${Math.max(5, (point.value / maxChartValue) * 100)}%` }} /></div>
                <small>{point.label}</small>
              </div>
            )) : Array.from({ length: 7 }, (_, index) => (
              <div className={styles.barColumn} key={index}><div className={styles.barTrack}><span style={{ height: `${[20, 34, 26, 48, 39, 62, 45][index]}%` }} /></div><small>—</small></div>
            ))}
          </div>
        </article>

        <article className={`${styles.panel} ${styles.healthPanel}`}>
          <div className={styles.panelHeader}><div><span className={styles.sectionEyebrow}>Quality</span><h2>Transaction health</h2></div><Link href="/admin/analytics/transactions">Details</Link></div>
          <div className={styles.healthScore}>
            <div className={styles.healthRing} style={{ "--score": `${Math.max(overview.metrics.successRate, 2) * 3.6}deg` } as React.CSSProperties}>
              <span><strong>{overview.metrics.successRate.toFixed(1)}%</strong><small>Success</small></span>
            </div>
            <div className={styles.healthCopy}><strong>{overview.metrics.successRate >= 95 ? "Looking healthy" : "Worth a closer look"}</strong><p>Final funding outcomes for this period.</p></div>
          </div>
          <div className={styles.statusBreakdown}>
            {statusSegments.map((segment) => {
              const count = overview.statuses[segment.key] ?? 0;
              const percentage = totalStatuses ? (count / totalStatuses) * 100 : 0;
              return <div key={segment.key}><span><i data-tone={segment.tone}/>{segment.label}<small>{count}</small></span><div><i data-tone={segment.tone} style={{ width: `${percentage}%` }}/></div></div>;
            })}
          </div>
        </article>
      </section>

      <section className={styles.dashboardLowerGrid}>
        <article className={`${styles.panel} ${styles.activityPanel}`}>
          <div className={styles.panelHeader}><div><span className={styles.sectionEyebrow}>Right now</span><h2>Live activity</h2></div><span className={styles.liveChip}><i/>Live</span></div>
          <div className={styles.activityTableWrap}>
            <table className={styles.activityTable}>
              <thead><tr><th>Customer</th><th>Reference</th><th>Provider</th><th>Amount</th><th>Status</th><th>Time</th></tr></thead>
              <tbody>
                {overview.recent.length ? overview.recent.map((row) => (
                  <tr key={row.id}>
                    <td><span className={styles.tableAvatar}>{row.customer.slice(0, 2).toUpperCase()}</span><strong>{row.customer}</strong></td>
                    <td><code>{row.reference}</code></td>
                    <td>{row.provider}</td>
                    <td><strong>{money(row.amount)}</strong></td>
                    <td><span className={styles.statusPill} data-status={row.status}>{statusLabel(row.status)}</span></td>
                    <td>{timeAgo(row.createdAt)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={6}><div className={styles.tableEmpty}><AdminIcon name="pulse"/><strong>No funding activity yet</strong><span>New transactions will appear here as they happen.</span></div></td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Link className={styles.panelFooterLink} href="/admin/transactions">Open transaction explorer <span>→</span></Link>
        </article>

        <article className={`${styles.panel} ${styles.providerPanel}`}>
          <div className={styles.panelHeader}><div><span className={styles.sectionEyebrow}>Connections</span><h2>Provider pulse</h2></div><Link href="/admin/products/providers">Manage</Link></div>
          <div className={styles.providerList}>
            <div><span className={styles.providerLogo}>B</span><span><strong>Bachs</strong><small>Wallet funding</small></span><span className={styles.providerState} data-state={overview.connected ? "operational" : "unknown"}><i/>{overview.connected ? "Operational" : "Checking"}</span></div>
            <div><span className={styles.providerLogo}>V</span><span><strong>VTPass</strong><small>Bills & utilities</small></span><span className={styles.providerState} data-state="standby"><i/>Standby</span></div>
            <div><span className={styles.providerLogo}>S</span><span><strong>SMEPlug</strong><small>Data & airtime</small></span><span className={styles.providerState} data-state="standby"><i/>Standby</span></div>
            <div><span className={styles.providerLogo}>P</span><span><strong>Pairgate</strong><small>VTU fallback</small></span><span className={styles.providerState} data-state="standby"><i/>Test mode</span></div>
          </div>
          <Link className={styles.providerBalanceLink} href="/admin/products/providers"><AdminIcon name="wallet"/><span><strong>Provider balances</strong><small>Set low-balance thresholds</small></span><span>→</span></Link>
        </article>
      </section>
    </div>
  );
}
