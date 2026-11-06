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

  useEffect(() => {
    if (activeGroup) setOpenGroups((open) => (open[activeGroup] ? open : { ...open, [activeGroup]: true }));
    setMobileOpen(false);
  }, [activeGroup, pathname]);

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
  const showLabels = !collapsed || mobileOpen;
  const [overview, ...collapsibleGroups] = groups;

  return (
    <div
      data-admin-shell
      className="flex min-h-[100svh] w-full overflow-visible bg-[#f7f6fb] font-sans lg:h-dvh lg:min-h-0 lg:overflow-hidden text-zinc-900"
    >
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs lg:hidden animate-in fade-in duration-200"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar (Jobly Africa exact styling) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex min-h-0 flex-col border-r border-zinc-200/80 bg-white font-sans shadow-lg transition-all duration-300 ease-in-out lg:relative lg:inset-y-auto lg:h-full lg:translate-x-0 lg:shadow-none",
          collapsed ? "lg:w-[72px]" : "lg:w-[240px]",
          "w-[min(280px,calc(100vw-2.5rem))]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Sidebar Header */}
        <div
          className={cn(
            "flex h-16 items-center flex-shrink-0",
            collapsed ? "justify-center px-1.5" : "justify-between px-3.5",
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7.5 w-7.5 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-primary text-white font-bold text-xs tracking-tight">
              f.
            </div>
            {showLabels && (
              <div className="flex flex-col overflow-hidden">
                <h1 className="text-[14px] font-bold tracking-tight text-zinc-900 leading-none truncate">
                  Funda Admin
                </h1>
              </div>
            )}
          </div>

          {/* Desktop Collapse Button */}
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              aria-label="Collapse admin navigation"
              className="hidden lg:flex h-7 w-7 items-center justify-center rounded-[7px] border border-primary/20 bg-primary/[0.07] text-primary transition-colors hover:border-primary/35 hover:bg-primary/[0.13]"
            >
              <AdminIcon name="chevronsLeft" className="h-4 w-4" />
            </button>
          )}

          {/* Mobile Close Button */}
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            className="lg:hidden flex h-7 w-7 items-center justify-center rounded-[6px] text-zinc-400 hover:bg-zinc-100"
          >
            <AdminIcon name="close" className="h-4 w-4" />
          </button>
        </div>

        {/* Desktop Expand Trigger when collapsed */}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            aria-label="Expand admin navigation"
            className="absolute -right-3.5 top-[4.25rem] z-50 hidden h-7 w-7 items-center justify-center rounded-[7px] border border-primary/25 bg-primary text-white shadow-[0_4px_12px_rgba(102,0,51,0.2)] transition hover:bg-primary/90 lg:flex"
          >
            <AdminIcon name="chevronsRight" className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Nav list */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-1" aria-label="Admin navigation">
          {overview?.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-2 rounded-[8px] font-medium transition-all outline-hidden px-2.5 py-2 text-[13px]",
                isActivePath(pathname, item.href)
                  ? "bg-primary/[0.08] text-primary font-bold"
                  : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
                collapsed && !mobileOpen && "justify-center px-1",
              )}
              aria-label={collapsed && !mobileOpen ? item.label : undefined}
            >
              <AdminIcon
                name={item.icon}
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  isActivePath(pathname, item.href) ? "text-primary" : "text-zinc-400 group-hover:text-zinc-700",
                )}
              />
              {showLabels && <span className="truncate">{item.label}</span>}
            </Link>
          ))}

          {collapsibleGroups.map((group) => {
            const groupActive = group.label === activeGroup;
            const open = Boolean(openGroups[group.label]) && showLabels;

            return (
              <div key={group.label} className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    if (!showLabels) {
                      setCollapsed(false);
                      setOpenGroups((state) => ({ ...state, [group.label]: true }));
                      return;
                    }
                    setOpenGroups((state) => ({ ...state, [group.label]: !state[group.label] }));
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-[8px] px-2.5 py-2 text-[13px] font-medium transition-all outline-hidden group",
                    groupActive ? "bg-primary/[0.08] text-primary font-bold" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
                    collapsed && !mobileOpen && "justify-center px-1.5",
                  )}
                  aria-label={collapsed && !mobileOpen ? group.label : undefined}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <AdminIcon
                      name={GROUP_ICONS[group.label] ?? group.items[0]?.icon ?? "grid"}
                      className={cn(
                        "h-4 w-4 shrink-0 transition-colors",
                        groupActive ? "text-primary" : "text-zinc-400 group-hover:text-zinc-700",
                      )}
                    />
                    {showLabels && <span className="truncate">{group.label}</span>}
                  </div>
                  {showLabels && (
                    <AdminIcon
                      name={open ? "chevronUp" : "chevronDown"}
                      className="h-3.5 w-3.5 opacity-50 shrink-0"
                    />
                  )}
                </button>

                {open && (
                  <div className="relative ml-3 mt-0.5 mb-0.5 flex flex-col gap-1 border-l border-zinc-200/60 pl-3">
                    {group.items.map((item) => {
                      const itemActive = isActivePath(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "group flex items-center justify-between rounded-[8px] px-2 py-1.5 text-[12px] font-medium transition-all outline-hidden",
                            itemActive
                              ? "bg-primary/[0.08] text-primary font-bold"
                              : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900",
                          )}
                        >
                          <span className="truncate">{item.label}</span>
                          {item.badge && (
                            <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.2 text-[9.5px] font-bold text-primary">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-2 border-t border-zinc-200/80">
          <Link
            href="/admin/settings"
            className={cn(
              "group flex items-center gap-2 rounded-[8px] px-2.5 py-2 text-[13px] font-medium transition-all text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
              collapsed && !mobileOpen && "justify-center px-1",
            )}
            aria-label={collapsed && !mobileOpen ? "Settings" : undefined}
          >
            <AdminIcon name="settings" className="h-4 w-4 text-zinc-400 group-hover:text-zinc-700 shrink-0" />
            {showLabels && <span className="truncate">Settings</span>}
          </Link>
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex min-h-[100svh] min-w-0 flex-1 flex-col overflow-visible lg:h-full lg:min-h-0 lg:overflow-hidden">
        {/* Top Header (Jobly Africa exact styling) */}
        <header
          ref={headerRef}
          className="sticky top-0 z-30 flex h-14 min-h-14 w-full flex-none items-center justify-between border-b border-zinc-200/80 bg-white/95 px-3.5 font-sans shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] backdrop-blur-md transition-all sm:px-6 lg:bg-white/80"
        >
          {/* Left: Mobile Toggle & Breadcrumbs */}
          <div className="flex items-center gap-4 w-auto min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open admin navigation"
              className="!flex h-8 w-8 items-center justify-center rounded-[9px] border border-primary/25 bg-primary/[0.08] text-primary transition-all hover:border-primary/40 hover:bg-primary/[0.14] active:scale-95 lg:!hidden"
            >
              <AdminIcon name="chevronsRight" className="h-4 w-4" />
            </button>

            <div className="hidden lg:block">
              <AdminBreadcrumbs />
            </div>
          </div>

          {/* Center: Add to site button + dropdown */}
          <div className="absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2">
            <button
              type="button"
              onClick={() => setCreateOpen((open) => !open)}
              aria-label="Create item"
              aria-expanded={createOpen}
              className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-primary text-white shadow-xs transition hover:bg-primary/90 active:scale-95"
            >
              <AdminIcon name="plus" className="h-4 w-4" />
            </button>

            {createOpen && (
              <div className="absolute left-1/2 top-full z-50 mt-2 w-[190px] -translate-x-1/2 rounded-[10px] border border-zinc-200 bg-white p-1.5 shadow-[0_14px_35px_rgba(31,18,46,0.14)] animate-in fade-in zoom-in-95 duration-150">
                {CREATE_LINKS.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={() => setCreateOpen(false)}
                    className="flex items-center rounded-[7px] px-3 py-2 text-[12px] font-semibold text-zinc-700 transition hover:bg-primary/[0.06] hover:text-primary"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Center-Right: Search Input */}
          <div className="hidden flex-1 justify-end px-4 ml-auto mr-3 lg:flex lg:max-w-xl">
            <div
              className="hidden lg:block relative w-full max-w-[240px] group transition-all focus-within:max-w-[320px] cursor-pointer"
              onClick={() => setPaletteOpen(true)}
            >
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-zinc-400 group-focus-within:text-primary transition-colors">
                <AdminIcon name="search" className="h-3.5 w-3.5" />
              </div>
              <input
                readOnly
                className="w-full h-8 pl-8 pr-12 rounded-[6px] border border-zinc-200/80 bg-zinc-50/70 text-[11px] font-medium placeholder:text-zinc-400 focus:ring-2 focus:ring-primary/15 focus:border-primary/30 focus:bg-white transition-all outline-hidden cursor-pointer"
                placeholder="Search resources..."
                type="text"
              />
            </div>
          </div>

          {/* Right: Actions, Theme, and User Avatar */}
          <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              aria-label="View site"
              className="hidden h-9 w-9 items-center justify-center rounded-[9px] border border-zinc-200 bg-white text-zinc-500 transition hover:border-primary/25 hover:bg-primary/[0.05] hover:text-primary lg:flex"
            >
              <AdminIcon name="external" className="h-4 w-4" />
            </a>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle color mode"
              className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-zinc-200 bg-white text-zinc-500 transition hover:border-primary/25 hover:bg-primary/[0.05] hover:text-primary"
            >
              <AdminIcon name={resolved === "dark" ? "sun" : "moon"} className="h-4 w-4" />
            </button>

            {/* Alerts Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setAlertsOpen((open) => !open)}
                aria-label="Alerts"
                className="relative flex h-9 w-9 items-center justify-center rounded-[9px] border border-zinc-200 bg-white text-zinc-500 transition hover:border-primary/25 hover:bg-primary/[0.05] hover:text-primary"
              >
                <AdminIcon name="bell" className="h-4 w-4" />
                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-rose-500" />
              </button>

              {alertsOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 rounded-[10px] bg-white p-2 border border-zinc-200/80 shadow-[0_14px_35px_rgba(31,18,46,0.14)] z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100">
                    <strong className="text-[13px] font-bold text-zinc-900">Alerts</strong>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">3 new</span>
                  </div>
                  <div className="py-1">
                    <Link
                      href="/admin/operations/pending"
                      onClick={() => setAlertsOpen(false)}
                      className="flex items-center justify-between px-3 py-2 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50 rounded-[6px]"
                    >
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-amber-500" /> Payments awaiting review
                      </span>
                      <small className="text-zinc-400">Now</small>
                    </Link>
                    <Link
                      href="/admin/products/providers"
                      onClick={() => setAlertsOpen(false)}
                      className="flex items-center justify-between px-3 py-2 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50 rounded-[6px]"
                    >
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-rose-500" /> Provider balance low
                      </span>
                      <small className="text-zinc-400">8m</small>
                    </Link>
                    <Link
                      href="/admin/settings/security"
                      onClick={() => setAlertsOpen(false)}
                      className="flex items-center justify-between px-3 py-2 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50 rounded-[6px]"
                    >
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" /> Security scan passed
                      </span>
                      <small className="text-zinc-400">42m</small>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* User Dropdown */}
            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-[9px] hover:bg-zinc-100 transition-colors"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white text-[10px] font-bold">
                  {firstName.slice(0, 2).toUpperCase()}
                </div>
                <span className="hidden sm:inline text-[13px] font-bold text-zinc-800">
                  {firstName}
                </span>
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 rounded-[10px] bg-white p-1.5 border border-zinc-200/80 shadow-[0_14px_35px_rgba(31,18,46,0.14)] z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-2">
                    <p className="text-[13px] font-bold text-zinc-900 truncate">
                      {admin.fullName}
                    </p>
                    <p className="text-[11px] text-zinc-400 font-medium truncate mt-0.5">
                      {admin.email}
                    </p>
                  </div>
                  <div className="h-px bg-zinc-100 my-1" />
                  <Link
                    href="/admin/settings"
                    onClick={() => setProfileOpen(false)}
                    className="flex w-full items-center gap-2 rounded-[7px] px-3 py-2 text-[13px] font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
                  >
                    <AdminIcon name="settings" className="h-3.5 w-3.5 text-zinc-400" />
                    Settings
                  </Link>
                  <Link
                    href="/admin/settings/security"
                    onClick={() => setProfileOpen(false)}
                    className="flex w-full items-center gap-2 rounded-[7px] px-3 py-2 text-[13px] font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
                  >
                    <AdminIcon name="lock" className="h-3.5 w-3.5 text-zinc-400" />
                    Security
                  </Link>
                  <form action={signOutAdmin}>
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2 rounded-[7px] px-3 py-2 text-[13px] font-medium text-rose-600 transition-colors hover:bg-rose-50"
                    >
                      <AdminIcon name="logout" className="h-3.5 w-3.5" />
                      Sign out
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Area (Jobly Africa exact padding and scroll container) */}
        <main className="min-h-0 min-w-0 flex-1 overflow-visible overscroll-contain bg-[#f7f6fb] px-3.5 pb-8 pt-3.5 sm:px-5 sm:pb-10 sm:pt-5 md:px-10 md:pt-10 lg:overflow-x-hidden lg:overflow-y-auto lg:p-10">
          {children}
        </main>
      </div>

      {/* Global Command Palette */}
      {paletteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-xs p-4 pt-[12vh] animate-in fade-in duration-150"
          role="presentation"
          onMouseDown={() => setPaletteOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-[12px] border border-zinc-200 bg-white shadow-[0_20px_50px_rgba(0,0,0,0.18)] overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 border-b border-zinc-200 px-4 py-3">
              <AdminIcon name="search" className="h-4 w-4 text-zinc-400 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search pages and records…"
                className="w-full text-[13px] font-medium text-zinc-900 placeholder:text-zinc-400 outline-hidden bg-transparent"
              />
              <kbd className="rounded-[4px] border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400">
                Esc
              </kbd>
            </div>
            <div className="max-h-[360px] overflow-y-auto p-2">
              <span className="block px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                {query ? "Results" : "Jump to"}
              </span>
              {recordResults.map((item) => (
                <button
                  type="button"
                  key={`${item.type}:${item.id}`}
                  onClick={() => openResult(item.href)}
                  className="flex w-full items-center justify-between gap-3 rounded-[7px] px-2.5 py-2 text-left hover:bg-primary/[0.06] hover:text-primary transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-zinc-100 text-zinc-500 group-hover:bg-primary/10 group-hover:text-primary">
                      <AdminIcon name={item.type === "customer" ? "users" : item.type === "transaction" ? "transactions" : item.type === "provider" ? "provider" : "catalogue"} className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <strong className="block text-[12.5px] font-semibold text-zinc-900 group-hover:text-primary truncate">{item.title}</strong>
                      <small className="block text-[11px] text-zinc-400 truncate">{item.detail}</small>
                    </div>
                  </div>
                  <span className="text-zinc-400 group-hover:text-primary text-[12px]">↗</span>
                </button>
              ))}
              {results.length || recordResults.length ? (
                results.map((item) => (
                  <button
                    type="button"
                    key={item.href}
                    onClick={() => openResult(item.href)}
                    className="flex w-full items-center justify-between gap-3 rounded-[7px] px-2.5 py-2 text-left hover:bg-primary/[0.06] hover:text-primary transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-zinc-100 text-zinc-500 group-hover:bg-primary/10 group-hover:text-primary">
                        <AdminIcon name={item.icon} className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <strong className="block text-[12.5px] font-semibold text-zinc-900 group-hover:text-primary truncate">{item.label}</strong>
                        <small className="block text-[11px] text-zinc-400 truncate">{item.description}</small>
                      </div>
                    </div>
                    <span className="text-zinc-400 group-hover:text-primary text-[12px]">↗</span>
                  </button>
                ))
              ) : (
                <div className="p-6 text-center text-[12px] text-zinc-400">No results for “{query}”.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
