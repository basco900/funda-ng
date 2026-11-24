"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AdminSession } from "../../../lib/admin/auth";
import { adminNavigation, adminNavItems, permissionForAdminPath } from "../../../lib/admin/navigation";
import type { AdminSearchResult } from "../../../lib/admin/repository";
import { useTheme } from "../../../lib/theme";
import { cn } from "../../../lib/utils";
import { AdminBreadcrumbs } from "../../../components/admin/breadcrumbs";
import { signOutAdmin } from "../actions";
import AdminIcon from "./admin-icon";
import "../admin-theme.css";

const GROUP_ICONS: Record<string, string> = {
  Products: "catalogue",
  Customers: "users",
  Money: "wallet",
  Operations: "pulse",
  Growth: "campaign",
  "Risk & Compliance": "shield",
  Analytics: "chart",
  Platform: "plug",
  Administration: "admin",
};

const CREATE_LINKS = [
  { label: "Airtime Rule", href: "/admin/products/airtime" },
  { label: "Cable TV Bouquet", href: "/admin/products/tv" },
  { label: "Electricity Config", href: "/admin/products/electricity" },
  { label: "Education Pin", href: "/admin/products/education" },
  { label: "Discount Coupon", href: "/admin/growth/coupons" },
  { label: "API Provider", href: "/admin/products/providers" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/admin/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminShell({ admin, children }: { admin: AdminSession; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolved, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recordResults, setRecordResults] = useState<AdminSearchResult[]>([]);
  const headerRef = useRef<HTMLElement>(null);
  const can = (permission: string) => admin.permissions.includes("*") || admin.permissions.includes(permission);

  const groups = useMemo(
    () =>
      adminNavigation
        .map((group) => ({ ...group, items: group.items.filter((item) => can(permissionForAdminPath(item.href))) }))
        .filter((group) => group.items.length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [admin.permissions],
  );

  const activeGroup = groups.find((group) => group.items.some((item) => isActivePath(pathname, item.href)))?.label;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => (activeGroup ? { [activeGroup]: true } : {}));

  // On navigation: open the active group and close the mobile drawer (state adjusted during render).
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setMobileOpen(false);
    if (activeGroup && !openGroups[activeGroup]) setOpenGroups((open) => ({ ...open, [activeGroup]: true }));
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setPaletteOpen(false);
        setAlertsOpen(false);
        setProfileOpen(false);
        setCreateOpen(false);
        setMobileOpen(false);
      }
    };
    const handleClick = (event: MouseEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) {
        setAlertsOpen(false);
        setProfileOpen(false);
        setCreateOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClick);
    };
  }, []);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/search?q=${encodeURIComponent(needle)}`, { signal: controller.signal, cache: "no-store" });
        const body = (await response.json()) as { results?: AdminSearchResult[] };
        if (response.ok) setRecordResults(body.results ?? []);
      } catch {
        if (!controller.signal.aborted) setRecordResults([]);
      }
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return adminNavItems.slice(0, 8);
    return adminNavItems
      .filter((item) => `${item.label} ${item.description}`.toLowerCase().includes(needle))
      .slice(0, 10);
  }, [query]);

  const openResult = (href: string) => {
    setPaletteOpen(false);
    setQuery("");
    setRecordResults([]);
    router.push(href);
  };

  const firstName = admin.fullName.split(/\s+/)[0] || "Admin";
  const [overview, ...collapsibleGroups] = groups;

  const compact = collapsed && !mobileOpen;
  const iconButton =
    "flex h-9 w-9 items-center justify-center rounded-[9px] border border-a-line bg-a-surface text-zinc-500 transition hover:border-primary/25 hover:bg-primary/[0.05] hover:text-primary";

  return (
    <div data-admin-shell className="flex h-dvh w-full overflow-hidden bg-a-paper text-zinc-900">
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />}

      <aside
        data-font="sans"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex min-h-0 flex-col border-r border-a-line bg-a-surface transition-all duration-300 ease-in-out lg:relative lg:inset-y-auto lg:h-full lg:translate-x-0",
          collapsed ? "lg:w-[64px]" : "lg:w-[220px]",
          "w-[min(280px,calc(100vw-2.5rem))]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className={cn("flex h-16 flex-shrink-0 items-center", compact ? "justify-center px-1.5" : "justify-between px-3.5")}>
          <Link href="/admin/dashboard" className="flex min-w-0 items-center gap-2" aria-label="Funda Admin">
            <span className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-[8px] bg-primary text-[12px] font-semibold tracking-tight text-white">f.</span>
            {!compact && <span className="truncate text-[14px] leading-none font-semibold tracking-tight text-zinc-900">Funda Admin</span>}
          </Link>

          {!collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse navigation"
              title="Collapse navigation"
              className="hidden h-7 w-7 items-center justify-center rounded-[7px] border border-primary/20 bg-primary/[0.07] text-primary transition-colors hover:border-primary/35 hover:bg-primary/[0.13] lg:flex"
            >
              <AdminIcon name="chevronsLeft" className="h-4 w-4" strokeWidth={1.8} />
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-zinc-400 hover:bg-zinc-100 lg:hidden"
          >
            <AdminIcon name="close" className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        {collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand navigation"
            title="Expand navigation"
            className="absolute top-[4.25rem] -right-3.5 z-50 hidden h-7 w-7 items-center justify-center rounded-[7px] border border-primary/20 bg-a-primary-soft text-primary transition hover:bg-primary/[0.14] lg:flex"
          >
            <AdminIcon name="chevronsRight" className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
        )}

        <nav aria-label="Admin navigation" className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
          {overview?.items.map((item) => (
            <NavItem key={item.href} href={item.href} icon={item.icon} label={item.label} badge={item.badge} compact={compact} active={isActivePath(pathname, item.href)} />
          ))}

          {collapsibleGroups.map((group) => {
            const groupActive = group.label === activeGroup;
            const open = Boolean(openGroups[group.label]) && !compact;
            const icon = GROUP_ICONS[group.label] ?? group.items[0]?.icon ?? "grid";

            return (
              <div key={group.label} className="flex flex-col gap-0.5">
                {compact ? (
                  <button
                    type="button"
                    title={group.label}
                    aria-label={group.label}
                    onClick={() => {
                      setCollapsed(false);
                      setOpenGroups((state) => ({ ...state, [group.label]: true }));
                    }}
                    className={navItemClass({ active: groupActive, compact: true })}
                  >
                    <AdminIcon name={icon} className={navIconClass({ active: groupActive, compact: true })} strokeWidth={1.5} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenGroups((state) => ({ ...state, [group.label]: !state[group.label] }))}
                    aria-expanded={open}
                    className={cn(navItemClass({ active: groupActive }), "justify-between")}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <AdminIcon name={icon} className={navIconClass({ active: groupActive })} strokeWidth={1.5} />
                      <span className="truncate">{group.label}</span>
                    </span>
                    <AdminIcon name={open ? "chevronUp" : "chevronDown"} className="h-3.5 w-3.5 shrink-0 opacity-50" strokeWidth={1.5} />
                  </button>
                )}

                {open && (
                  <div className="relative mt-0.5 mb-0.5 ml-3.5 flex flex-col gap-0.5 border-l border-zinc-200/70 pl-3">
                    {group.items.map((item) => {
                      const hasMoreSpecificSibling = group.items.some(
                        (other) =>
                          other.href !== item.href &&
                          other.href.startsWith(`${item.href}/`) &&
                          isActivePath(pathname, other.href),
                      );
                      return (
                        <NavItem
                          key={item.href}
                          href={item.href}
                          label={item.label}
                          badge={item.badge}
                          size="sm"
                          active={!hasMoreSpecificSibling && isActivePath(pathname, item.href)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="mt-auto space-y-0.5 p-2">
          <NavItem href="/admin/settings" icon="settings" label="Settings" compact={compact} active={pathname === "/admin/settings"} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header
          ref={headerRef}
          data-font="sans"
          className="sticky top-0 z-30 flex h-14 min-h-14 w-full flex-none items-center justify-between border-b border-a-line bg-a-surface/95 px-3.5 backdrop-blur-md sm:px-6 lg:bg-a-surface/80"
        >
          <div className="flex w-auto min-w-0 items-center gap-4">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-primary/25 bg-primary/[0.08] text-primary transition-all hover:border-primary/40 hover:bg-primary/[0.14] active:scale-95 lg:hidden"
            >
              <AdminIcon name="chevronsRight" className="h-4 w-4" strokeWidth={1.8} />
            </button>
            <div className="hidden lg:block">
              <AdminBreadcrumbs />
            </div>
          </div>

          <div className="absolute top-1/2 left-1/2 z-30 -translate-x-1/2 -translate-y-1/2">
            <button
              type="button"
              onClick={() => setCreateOpen((open) => !open)}
              aria-label="Create"
              aria-expanded={createOpen}
              title="Create"
              className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-primary text-white transition hover:bg-primary/90 active:scale-95"
            >
              <AdminIcon name="plus" className="h-4 w-4" strokeWidth={2.1} />
            </button>
            {createOpen && (
              <div role="menu" className="a-menu absolute top-full left-1/2 z-50 mt-2 w-[190px] -translate-x-1/2 rounded-[8px] border border-a-line bg-a-surface p-1.5">
                {CREATE_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    role="menuitem"
                    onClick={() => setCreateOpen(false)}
                    className="flex items-center rounded-[7px] px-3 py-2 text-[12px] font-semibold text-zinc-700 transition hover:bg-primary/[0.06] hover:text-primary"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="mr-1 hidden h-9 w-[240px] items-center gap-2.5 rounded-[8px] border border-a-line bg-a-surface pr-1.5 pl-3 text-left text-[13px] text-zinc-400 transition-colors hover:border-zinc-300 xl:flex"
            >
              <AdminIcon name="search" className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 truncate">Search</span>
              <kbd className="rounded-[5px] border border-a-line bg-zinc-50 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400">⌘K</kbd>
            </button>
            <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Search" className={cn(iconButton, "xl:hidden")}>
              <AdminIcon name="search" className="h-4 w-4" strokeWidth={1.8} />
            </button>

            <a href="/" target="_blank" rel="noreferrer" aria-label="View site" title="View site" className={cn(iconButton, "hidden lg:flex")}>
              <AdminIcon name="external" className="h-4 w-4" strokeWidth={1.8} />
            </a>

            <button type="button" onClick={toggleTheme} aria-label={resolved === "dark" ? "Light mode" : "Dark mode"} title={resolved === "dark" ? "Light mode" : "Dark mode"} className={cn(iconButton, "hidden sm:flex")}>
              <AdminIcon name={resolved === "dark" ? "sun" : "moon"} className="h-4 w-4" strokeWidth={1.8} />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setAlertsOpen((open) => !open)}
                aria-label={`Alerts, ${ALERTS.length} new`}
                aria-expanded={alertsOpen}
                className={cn(
                  "relative flex h-9 w-9 items-center justify-center rounded-[9px] border bg-a-surface transition",
                  alertsOpen ? "border-primary/30 bg-primary/[0.06] text-primary" : "border-a-line text-zinc-500 hover:border-primary/25 hover:bg-primary/[0.05] hover:text-primary",
                )}
              >
                <AdminIcon name="bell" className="h-4 w-4" strokeWidth={1.8} />
                <span className="absolute -top-1.5 -right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-white tabular-nums">
                  {ALERTS.length}
                </span>
              </button>

              {alertsOpen && (
                <div className="a-menu absolute top-full right-0 z-50 mt-2 flex w-[min(360px,calc(100vw-24px))] flex-col overflow-hidden rounded-[8px] border border-a-line bg-a-surface">
                  <div className="flex items-center gap-2 px-4 pt-4 pb-3">
                    <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-zinc-950">Alerts</h2>
                    <span className="rounded-[6px] bg-primary/[0.08] px-1.5 text-[11px] leading-5 font-semibold text-primary tabular-nums">{ALERTS.length} New</span>
                  </div>
                  <div className="border-t border-a-line px-1.5 py-2">
                    {ALERTS.map((alert) => (
                      <Link
                        key={alert.href}
                        href={alert.href}
                        onClick={() => setAlertsOpen(false)}
                        className="flex items-center gap-3 rounded-[8px] px-2.5 py-2.5 transition-colors hover:bg-zinc-50"
                      >
                        <span className={cn("size-2 shrink-0 rounded-full", alert.dot)} />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-800">{alert.title}</span>
                        <span className="shrink-0 text-[11.5px] font-medium text-zinc-400 tabular-nums">{alert.time}</span>
                      </Link>
                    ))}
                  </div>
                  <Link
                    href="/admin/operations/live"
                    onClick={() => setAlertsOpen(false)}
                    className="flex h-11 shrink-0 items-center justify-center gap-1.5 border-t border-a-line text-[12.5px] font-semibold text-primary transition-colors hover:bg-primary/[0.04]"
                  >
                    Live Operations
                    <AdminIcon name="arrowRight" className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                aria-label="Account menu"
                aria-expanded={profileOpen}
                className="flex items-center gap-2 rounded-[9px] py-1 pr-1 pl-2 transition-colors hover:bg-zinc-100"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-white">{initials(admin.fullName || admin.email)}</span>
                <span className="hidden text-[13px] font-semibold text-zinc-800 sm:inline">{firstName}</span>
              </button>

              {profileOpen && (
                <div role="menu" className="a-menu absolute top-full right-0 z-50 mt-2 w-56 rounded-[8px] border border-a-line bg-a-surface p-1.5">
                  <div className="px-3 py-2">
                    <p className="truncate text-[13px] font-semibold text-zinc-900">{admin.fullName}</p>
                    <p className="mt-0.5 truncate text-[11px] font-medium text-zinc-400">{admin.email}</p>
                  </div>
                  <div className="my-1 h-px bg-zinc-100" />
                  <Link href="/admin/settings" role="menuitem" onClick={() => setProfileOpen(false)} className={menuRowClass}>
                    <AdminIcon name="settings" className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.5} />
                    Settings
                  </Link>
                  <button type="button" role="menuitem" onClick={toggleTheme} className={cn(menuRowClass, "sm:hidden")}>
                    <AdminIcon name={resolved === "dark" ? "sun" : "moon"} className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.5} />
                    {resolved === "dark" ? "Light Mode" : "Dark Mode"}
                  </button>
                  <Link href="/admin/settings/security" role="menuitem" onClick={() => setProfileOpen(false)} className={menuRowClass}>
                    <AdminIcon name="lock" className="h-3.5 w-3.5 text-zinc-400" strokeWidth={1.5} />
                    Security
                  </Link>
                  <form action={signOutAdmin}>
                    <button type="submit" role="menuitem" className="flex w-full items-center gap-2 rounded-[7px] px-3 py-2 text-[13px] font-medium text-rose-600 transition-colors hover:bg-rose-50">
                      <AdminIcon name="logout" className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Sign Out
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-4 pb-24 sm:px-6 sm:pt-6 sm:pb-24 lg:p-10">
          <div className="mx-auto w-full max-w-[1500px]">{children}</div>
        </main>
      </div>

      {paletteOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[12vh] backdrop-blur-[2px]" role="presentation" onMouseDown={() => setPaletteOpen(false)}>
          <div
            className="a-menu w-full max-w-lg overflow-hidden rounded-[8px] border border-a-line bg-a-surface"
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 border-b border-a-line px-4 py-3">
              <AdminIcon name="search" className="h-4 w-4 shrink-0 text-zinc-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search pages and records"
                aria-label="Search pages and records"
                className="w-full bg-transparent text-[14px] text-zinc-900 outline-none placeholder:text-zinc-400"
              />
              <kbd className="rounded-[5px] border border-a-line bg-zinc-50 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400">Esc</kbd>
            </div>
            <div className="max-h-[360px] overflow-y-auto p-1.5">
              {[...recordResults.map((item) => ({ key: `${item.type}:${item.id}`, href: item.href, title: item.title, detail: item.detail, icon: RECORD_ICONS[item.type] })), ...results.map((item) => ({ key: item.href, href: item.href, title: item.label, detail: item.description, icon: item.icon }))].map((item) => (
                <button
                  type="button"
                  key={item.key}
                  onClick={() => openResult(item.href)}
                  className="group flex w-full items-center gap-3 rounded-[8px] px-2.5 py-2 text-left transition-colors hover:bg-primary/[0.06]"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-500 group-hover:bg-primary/10 group-hover:text-primary">
                    <AdminIcon name={item.icon} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-zinc-900 group-hover:text-primary">{item.title}</span>
                    <span className="block truncate text-[12px] text-zinc-500">{item.detail}</span>
                  </span>
                  <AdminIcon name="arrowRight" className="h-3.5 w-3.5 shrink-0 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
              ))}
              {!results.length && !recordResults.length && <p className="px-4 py-8 text-center text-[13px] text-zinc-400">No Results for “{query}”</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ALERTS = [
  { title: "Payments awaiting review", href: "/admin/operations/pending", time: "Now", dot: "bg-amber-500" },
  { title: "Provider balance low", href: "/admin/products/providers", time: "8m", dot: "bg-rose-500" },
  { title: "Security scan passed", href: "/admin/settings/security", time: "42m", dot: "bg-emerald-500" },
];

const RECORD_ICONS: Record<AdminSearchResult["type"], string> = { customer: "users", transaction: "transactions", provider: "provider", product: "catalogue" };

const menuRowClass =
  "flex w-full items-center gap-2 rounded-[7px] px-3 py-2 text-[13px] font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900";

function initials(value: string) {
  const parts = value.trim().split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

/* Jobly's shared rail styles (components/ui/sidebar-nav.ts), one source for every row. */
function navItemClass({ active, compact, size = "default" }: { active?: boolean; compact?: boolean; size?: "default" | "sm" }) {
  if (compact) {
    return cn(
      "group relative mx-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-200",
      active
        ? "text-primary after:absolute after:bottom-0.5 after:left-1/2 after:h-[2px] after:w-4 after:-translate-x-1/2 after:rounded-full after:bg-primary"
        : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
    );
  }
  if (size === "sm") return "group flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 leading-snug transition-colors hover:bg-zinc-50";
  return cn(
    "group flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[14.5px] font-medium transition-all",
    active ? "bg-primary/[0.08] font-semibold text-primary" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
  );
}

function navIconClass({ active, compact }: { active?: boolean; compact?: boolean }) {
  return cn(
    "shrink-0 transition-colors",
    compact ? "h-[18px] w-[18px]" : "h-[17px] w-[17px]",
    active ? "text-primary" : compact ? "text-current" : "text-zinc-400 group-hover:text-zinc-700",
  );
}

function NavItem({ href, icon, label, badge, compact, active, size = "default" }: { href: string; icon?: string; label: string; badge?: string; compact?: boolean; active?: boolean; size?: "default" | "sm" }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} title={compact ? label : undefined} aria-label={compact ? label : undefined} className={navItemClass({ active, compact, size })}>
      {icon && <AdminIcon name={icon} className={navIconClass({ active, compact })} strokeWidth={1.5} />}
      {!compact && (
        <span
          className={cn(
            "truncate",
            size === "sm" &&
              cn(
                "pb-[2px] text-[14px] transition-colors",
                active
                  ? "border-b border-primary/80 font-semibold text-primary"
                  : "border-b border-transparent font-medium text-zinc-600 group-hover:text-zinc-900",
              ),
          )}
        >
          {label}
        </span>
      )}
      {!compact && badge && (
        <span title={badge} aria-label={badge} className="relative ml-auto grid size-4 shrink-0 place-items-center">
          <span className="absolute size-2 animate-ping rounded-full bg-a-accent/50 [animation-duration:2.4s]" />
          <span className="size-1.5 rounded-full bg-a-accent" />
        </span>
      )}
    </Link>
  );
}
