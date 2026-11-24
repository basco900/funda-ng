"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import AdminIcon from "@/app/admin/(console)/admin-icon";
import { adminNavItems, adminNavigation } from "@/lib/admin/navigation";
import { cn } from "@/lib/utils";

/** Section names for path segments that are groups, not pages. */
const GROUP_LABELS: Record<string, string> = Object.fromEntries(
  adminNavigation.map((group) => [group.label.toLowerCase().replace(/\s*&\s*/g, "-").replace(/\s+/g, "-"), group.label]),
);
const SEGMENT_LABELS: Record<string, string> = { ...GROUP_LABELS, money: "Money", customers: "Customers", risk: "Risk & Compliance", settings: "Administration", platform: "Platform" };
const PAGE_LABELS = new Map(adminNavItems.map((item) => [item.href, item.label]));
/** Detail pages hang off these lists. */
const DETAIL_PARENTS: Record<string, string> = { "/admin/users": "Customer", "/admin/transactions": "Transaction" };

type Crumb = { href: string; label: string; page: boolean };

function crumbsFor(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean).slice(1);
  const crumbs: Crumb[] = [];
  segments.forEach((segment, index) => {
    const href = `/admin/${segments.slice(0, index + 1).join("/")}`;
    if (href === "/admin/dashboard") return;
    const parent = `/admin/${segments.slice(0, index).join("/")}`;
    const label =
      PAGE_LABELS.get(href) ??
      (DETAIL_PARENTS[parent] ? DETAIL_PARENTS[parent] : SEGMENT_LABELS[segment] ?? segment.replace(/-/g, " ").replace(/^\w/, (letter) => letter.toUpperCase()));
    crumbs.push({ href, label, page: PAGE_LABELS.has(href) || Boolean(DETAIL_PARENTS[parent]) });
  });
  return crumbs;
}

export function AdminBreadcrumbs() {
  const pathname = usePathname() ?? "/admin/dashboard";
  const crumbs = crumbsFor(pathname);

  return (
    <nav aria-label="Breadcrumb" className="flex items-center text-sm">
      <Link
        href="/admin/dashboard"
        className={cn(
          "flex items-center gap-1.5 rounded-[6px] px-1.5 py-1 font-medium transition-colors",
          crumbs.length ? "text-zinc-400 hover:text-zinc-700" : "text-zinc-900",
        )}
      >
        <AdminIcon name="grid" className="h-4 w-4" strokeWidth={1.5} />
        Control Centre
      </Link>
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1;
        const tone = last ? "text-zinc-900" : "text-zinc-400";
        return (
          <Fragment key={crumb.href}>
            <AdminIcon name="chevron" className="mx-1.5 h-4 w-4 text-zinc-300" />
            {crumb.page ? (
              <Link
                href={crumb.href}
                aria-current={last ? "page" : undefined}
                className={cn("rounded-[6px] px-1.5 py-1 font-medium transition-colors", tone, !last && "hover:text-zinc-700")}
              >
                {crumb.label}
              </Link>
            ) : (
              <span className={cn("px-1.5 py-1 font-medium", tone)}>{crumb.label}</span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
