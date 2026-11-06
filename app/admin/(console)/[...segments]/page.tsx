import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPermission } from "../../../../lib/admin/auth";
import { findAdminNavItem, permissionForAdminPath } from "../../../../lib/admin/navigation";
import { loadAdminWorkspace } from "../../../../lib/admin/repository";
import { AdminPageHeader } from "../../../../components/admin/page-pattern";
import AdminIcon from "../admin-icon";
import ExportAction from "../export-action";
import WorkspaceTable from "./workspace-table";

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

  const headerStats = data.metrics.map((metric) => ({
    label: metric.label,
    value: metric.value,
  }));

  return (
    <div className="w-full space-y-6 pb-16 font-sans text-slate-900">
      {/* Top Header: Jobly Africa AdminPageHeader with vertical stat dividers */}
      <AdminPageHeader title={item.label} stats={headerStats} />

      {data.columns.length ? (
        <WorkspaceTable
          title={item.label}
          icon={item.icon}
          columns={data.columns}
          rows={data.rows}
          actions={
            <>
              <ExportAction source={data.source} />
              <Link
                href={`${pathname}?create=1`}
                className="inline-flex h-9 items-center gap-1.5 rounded-[6px] bg-primary px-3.5 text-[12px] font-semibold text-white shadow-xs transition-colors hover:bg-primary/90"
              >
                <AdminIcon name="plus" className="h-3.5 w-3.5" />
                Add New
              </Link>
            </>
          }
        />
      ) : (
        <section className="overflow-hidden rounded-[8px] border border-slate-200/70 bg-white p-8 text-center shadow-xs sm:p-12">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
            <AdminIcon name={item.icon} className="h-7 w-7" />
          </div>
          <span className="mb-2 inline-block rounded-full border border-amber-200/60 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
            Setup Required
          </span>
          <h3 className="text-lg font-bold text-slate-900">{item.label} Module</h3>
          <p className="mx-auto mb-6 mt-1 max-w-sm text-[12.5px] text-slate-500">
            Run database migrations or connect active service tables to view live records.
          </p>
          <div className="mx-auto grid max-w-2xl grid-cols-1 gap-3 text-left sm:grid-cols-2 md:grid-cols-4">
            {capabilities.map((cap, i) => (
              <div key={cap} className="rounded-[8px] border border-slate-200/70 bg-zinc-50/60 p-3">
                <span className="block text-[10px] font-bold text-primary">0{i + 1}</span>
                <strong className="mt-0.5 block text-[12px] font-semibold text-slate-800">{cap}</strong>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
