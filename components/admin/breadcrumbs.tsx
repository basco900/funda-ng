"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Fragment, Suspense } from "react";
import AdminIcon from "@/app/admin/(console)/admin-icon";
import { cn } from "@/lib/utils";

const ROUTE_NAME_MAP: Record<string, string> = {
  admin: "Dashboard",
  dashboard: "Platform Overview",
  transactions: "Transactions",
  users: "Customers",
  money: "Money",
  products: "Products",
  growth: "Growth",
  coupons: "Coupons & Discounts",
  airtime: "Airtime",
  electricity: "Electricity",
  tv: "Cable TV",
  education: "Education PINs",
  "data-bundles": "Data Bundles",
  providers: "Providers",
  operations: "Operations",
  analytics: "Analytics",
  settings: "Settings",
  audit: "Audit Logs",
  health: "System Health",
  security: "Security",
};

function BreadcrumbsContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!pathname) return null;

  const segments = pathname.split("/").filter(Boolean);

  const breadcrumbs = segments.map((segment, index) => {
    const path = `/${segments.slice(0, index + 1).join("/")}`;
    const isLast = index === segments.length - 1;

    let label = ROUTE_NAME_MAP[segment] || segment;
    if (!ROUTE_NAME_MAP[segment]) {
      label = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
    }

    return {
      href: path,
      label,
      isLast,
      isRoot: segment === "admin",
    };
  });

  const tab = searchParams.get("tab");
  if (tab) {
    const last = breadcrumbs[breadcrumbs.length - 1];
    if (last) last.isLast = false;

    breadcrumbs.push({
      href: `${pathname}?tab=${tab}`,
      label: tab.charAt(0).toUpperCase() + tab.slice(1),
      isLast: true,
      isRoot: false,
    });
  }

  return (
    <nav className="flex items-center text-sm text-zinc-400" aria-label="Admin breadcrumbs">
      {breadcrumbs.map((item, index) => (
        <Fragment key={item.href}>
          {index > 0 && (
            <AdminIcon name="chevron" className="w-3.5 h-3.5 mx-1.5 text-zinc-300 shrink-0" />
          )}

          <Link
            href={item.href}
            className={cn(
              "flex items-center gap-1.5 text-[12px] font-medium transition-colors hover:text-zinc-800",
              item.isLast && "font-semibold text-zinc-900 pointer-events-none",
            )}
          >
            {item.isRoot && <AdminIcon name="grid" className="w-3.5 h-3.5 mr-0.5" />}
            <span>{item.isRoot ? "" : item.label}</span>
          </Link>
        </Fragment>
      ))}
    </nav>
  );
}

export function AdminBreadcrumbs() {
  return (
    <Suspense fallback={<div className="h-4" />}>
      <BreadcrumbsContent />
    </Suspense>
  );
}

