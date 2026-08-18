import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPermission } from "../../../../lib/admin/auth";
import { findAdminNavItem, permissionForAdminPath } from "../../../../lib/admin/navigation";
import { loadAdminWorkspace } from "../../../../lib/admin/repository";
import styles from "../../admin.module.css";
import AdminIcon from "../admin-icon";
import ExportAction from "../export-action";

const moduleCapabilities: Record<string, string[]> = {
  Customers: ["Powerful customer search", "Saved audience views", "Controlled account actions", "Internal notes and history"],
  Money: ["Immutable ledger trails", "Approval-aware adjustments", "Provider reconciliation", "Filter-preserving exports"],
  Services: ["Availability controls", "Provider priority routing", "Maintenance messaging", "Purchase limits"],
  Products: ["No-deploy catalogue edits", "Margin-aware pricing", "Bulk updates and imports", "Publishing controls"],
  Operations: ["Ageing queues", "Safe provider requery", "Resolution timelines", "Assigned ownership"],
  Growth: ["Targeted audiences", "Budget guardrails", "Multi-channel delivery", "Conversion reporting"],
  "Risk & compliance": ["Risk scoring", "Device and IP signals", "KYC review trails", "Tier-based limits"],
  Analytics: ["Period comparison", "Segment breakdowns", "Scheduled exports", "Operational leaderboards"],
  Platform: ["Runtime feature controls", "Redacted technical logs", "Webhook replay safety", "Service health"],
  Administration: ["Granular permissions", "Two-factor enforcement", "Immutable audit logs", "Session control"],
};

function groupFor(segment: string) {
  if (["customers", "users"].includes(segment)) return "Customers";
  if (["money", "transactions"].includes(segment)) return "Money";
  if (segment === "risk") return "Risk & compliance";
  if (segment === "settings") return "Administration";
  return `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`;
}

export default async function AdminWorkspacePage({ params }: { params: Promise<{ segments: string[] }> }) {
  const { segments } = await params;
  const pathname = `/admin/${segments.join("/")}`;
  const item = findAdminNavItem(pathname);
  if (!item) notFound();

  await requireAdminPermission(permissionForAdminPath(pathname));
  const data = await loadAdminWorkspace(pathname);
  const groupName = groupFor(segments[0] ?? "platform");
  const capabilities = moduleCapabilities[groupName] ?? moduleCapabilities.Platform;

  return (
    <div className={styles.workspacePage}>
      <section className={styles.pageHeading}>
        <div>
          <span className={styles.pageEyebrow}>{groupName}</span>
          <h1>{item.label}</h1>
          <p>{item.description}. Built for fast, controlled operational work.</p>
        </div>
        <div className={styles.pageHeadingActions}>
          <ExportAction source={data.source} />
          <Link className={styles.primaryButton} href={`${pathname}?create=1`}><span>＋</span>Create new</Link>
        </div>
      </section>

      <section className={styles.workspaceMetrics}>
        {data.metrics.map((metric) => <article key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></article>)}
      </section>

      <section className={styles.workspacePanel}>
        <div className={styles.workspaceToolbar}>
          <label><AdminIcon name="search" /><input name="q" placeholder={`Search ${item.label.toLowerCase()}…`} /></label>
          <div><button type="button">Status <span>⌄</span></button><button type="button">Date <span>⌄</span></button><button type="button"><AdminIcon name="sliders" />Filters</button></div>
        </div>

        {data.columns.length ? (
          <div className={styles.workspaceTableWrap}>
            <table className={styles.workspaceTable}>
              <thead><tr>{data.columns.map((column) => <th key={column.key} data-align={column.align}>{column.label}</th>)}<th aria-label="Actions" /></tr></thead>
              <tbody>{data.rows.length ? data.rows.map((row, rowIndex) => (
                <tr key={`${data.source}:${rowIndex}`}>{data.columns.map((column) => {
                  const value = row[column.key];
                  const statusCell = column.key === "status" || column.key === "risk" || column.key === "severity" || column.key === "priority";
                  return <td key={column.key} data-align={column.align}>{statusCell ? <span className={styles.statusPill} data-status={String(value).toLowerCase()}>{value}</span> : column.key === "reference" || column.key === "request" ? <code>{value}</code> : String(value ?? "—")}</td>;
                })}<td><button type="button" aria-label="Open row actions">•••</button></td></tr>
              )) : <tr><td colSpan={data.columns.length + 1}><div className={styles.tableEmpty}><AdminIcon name={item.icon} /><strong>Nothing here yet</strong><span>New records will land in this operational view automatically.</span></div></td></tr>}</tbody>
            </table>
          </div>
        ) : (
          <div className={styles.moduleFoundation}>
            <div className={styles.moduleFoundationIntro}>
              <span className={styles.moduleLargeIcon}><AdminIcon name={item.icon} /></span>
              <span className={styles.sectionEyebrow}>Control plane ready</span>
              <h2>{item.label} is ready for operations.</h2>
              <p>This workspace is secured, navigable and audit-aware. Apply the latest Supabase migration to activate its live records.</p>
              <Link href="/admin/platform/config">Review configuration <span>→</span></Link>
            </div>
            <div className={styles.capabilityGrid}>
              {capabilities.map((capability, index) => <div key={capability}><span>0{index + 1}</span><strong>{capability}</strong><small>Designed into this module</small></div>)}
            </div>
          </div>
        )}

        <footer className={styles.workspaceFooter}><span>{data.rows.length} visible records</span><div><button type="button" disabled>←</button><span>Page 1 of 1</span><button type="button" disabled>→</button></div></footer>
      </section>
    </div>
  );
}
