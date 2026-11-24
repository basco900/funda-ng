import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPermission } from "../../../../lib/admin/auth";
import { findAdminNavItem, permissionForAdminPath } from "../../../../lib/admin/navigation";
import { ADMIN_PAGE_SIZE, loadAdminWorkspace, parseAdminListQuery } from "../../../../lib/admin/repository";
import { DataTable } from "../../../../components/admin/data-table";
import { DistributionBand, EmptyNote, PageHeader, StatBand, button } from "../../../../components/admin/kit";
import { UrlFilterBar, UrlList, UrlPager } from "../../../../components/admin/list-controls";
import AdminIcon from "../admin-icon";
import ExportAction from "../export-action";

type Params = Record<string, string | string[] | undefined>;

export default async function AdminWorkspacePage({ params, searchParams }: { params: Promise<{ segments: string[] }>; searchParams: Promise<Params> }) {
  const [{ segments }, search] = await Promise.all([params, searchParams]);
  const pathname = `/admin/${segments.join("/")}`;
  const item = findAdminNavItem(pathname);
  if (!item) notFound();

  await requireAdminPermission(permissionForAdminPath(pathname));
  const query = parseAdminListQuery(search);
  const data = await loadAdminWorkspace(pathname, query);
  const values = { status: query.status, facet: query.facet, q: query.q, range: query.range, page: query.page > 1 ? String(query.page) : "" };
  const filtering = Boolean(query.status || query.facet || query.q || query.range);

  const hrefWith = (next: Record<string, string>) => {
    const merged = new URLSearchParams(Object.entries({ ...values, page: "", ...next }).filter(([, value]) => value));
    const qs = merged.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  if (!data.connected) {
    return (
      <div className="space-y-6 pb-10">
        <PageHeader title={item.label} />
        <EmptyNote
          icon={item.icon}
          title={`${item.label} Isn't Connected Yet`}
          action={
            <Link href="/admin/platform/health" className={button.secondary}>
              System Health
            </Link>
          }
        />
      </div>
    );
  }

  const status = data.filters.status;

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title={item.label}
        actions={
          <>
            <ExportAction source={data.source} />
            <Link href={`${pathname}?create=1`} className={button.primary}>
              <AdminIcon name="plus" />
              Add New
            </Link>
          </>
        }
      />

      {status && status.options.length > 0 ? (
        <DistributionBand
          value={data.all.toLocaleString("en-NG")}
          label={data.all === 1 ? "record" : "records"}
          segments={status.options.map((option) => ({ key: option.value, label: option.label, count: option.count ?? 0, href: hrefWith({ status: query.status === option.value ? "" : option.value }), active: query.status === option.value }))}
        />
      ) : (
        <StatBand
          stats={[
            { label: data.all === 1 ? "Record" : "Records", value: data.all.toLocaleString("en-NG"), icon: item.icon, tone: "primary" },
            ...(filtering ? [{ label: "Matching filters", value: data.total.toLocaleString("en-NG"), icon: "filter", tone: "neutral" as const }] : []),
            ...data.metrics.map((metric) => ({ label: metric.label, value: metric.value, icon: "wallet", tone: "accent" as const })),
          ]}
        />
      )}

      <UrlList values={values}>
        <div className="space-y-5">
          <UrlFilterBar spec={{ status: status ? { total: status.total, options: status.options } : undefined, facet: data.filters.facet, search: data.filters.search, range: data.filters.range }} />
          <DataTable
            columns={data.columns}
            rows={data.rows.map((row) => ({ id: row.id, href: row.href, cells: row.cells }))}
            empty={<EmptyNote icon={item.icon} title={filtering ? "Nothing Matches These Filters" : `No ${item.label} Yet`} />}
          />
          <UrlPager page={query.page} pageSize={ADMIN_PAGE_SIZE} total={data.total} />
        </div>
      </UrlList>
    </div>
  );
}
