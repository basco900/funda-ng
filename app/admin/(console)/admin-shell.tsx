"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { AdminSession } from "../../../lib/admin/auth";
import { adminNavigation, adminNavItems, permissionForAdminPath } from "../../../lib/admin/navigation";
import type { AdminSearchResult } from "../../../lib/admin/repository";
import { useTheme } from "../../../lib/theme";
import { signOutAdmin } from "../actions";
import styles from "../admin.module.css";
import AdminIcon from "./admin-icon";

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
  const [query, setQuery] = useState("");
  const [recordResults, setRecordResults] = useState<AdminSearchResult[]>([]);
  const can = (permission: string) => admin.permissions.includes("*") || admin.permissions.includes(permission);

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
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/search?q=${encodeURIComponent(needle)}`, { signal: controller.signal, cache: "no-store" });
        const body = await response.json() as { results?: AdminSearchResult[] };
        if (response.ok) setRecordResults(body.results ?? []);
      } catch {
        if (!controller.signal.aborted) setRecordResults([]);
      }
    }, 220);
    return () => { controller.abort(); window.clearTimeout(timer); };
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

  return (
    <div className={`${styles.adminApp} ${collapsed ? styles.adminAppCollapsed : ""}`}>
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarMobileOpen : ""}`}>
        <div className={styles.sidebarHeader}>
          <Link href="/admin/dashboard" className={styles.adminWordmark} aria-label="Funda Admin home">
            <span className={styles.brandGlyph}>f.</span>
            <span className={styles.brandCopy}>funda<span>.</span><small>admin</small></span>
          </Link>
          <button className={styles.mobileClose} type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
            <AdminIcon name="close" />
          </button>
        </div>

        <div className={styles.sidebarEnvironment}>
          <span className={styles.environmentDot} />
          <span>Production</span>
          <small>All systems live</small>
        </div>

        <nav className={styles.sidebarNav} aria-label="Admin navigation">
          {adminNavigation.map((group) => ({ ...group, items: group.items.filter((item) => can(permissionForAdminPath(item.href))) })).filter((group) => group.items.length).map((group) => (
            <div className={styles.navGroup} key={group.label}>
              <span className={styles.navGroupLabel}>{group.label}</span>
              <div className={styles.navGroupItems}>
                {group.items.map((item) => {
                  const active = isActivePath(pathname, item.href);
                  return (
                    <Link
                      href={item.href}
                      key={item.href}
                      className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                      title={collapsed ? item.label : undefined}
                      onClick={() => setMobileOpen(false)}
                    >
                      <AdminIcon name={item.icon} />
                      <span>{item.label}</span>
                      {item.badge ? <small>{item.badge}</small> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <button type="button" className={styles.collapseButton} onClick={() => setCollapsed((value) => !value)}>
            <AdminIcon name="chevron" />
            <span>{collapsed ? "Expand" : "Collapse sidebar"}</span>
          </button>
        </div>
      </aside>

      {mobileOpen ? <button className={styles.mobileScrim} type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation" /> : null}

      <div className={styles.adminStage}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button className={styles.mobileMenuButton} type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <AdminIcon name="menu" />
            </button>
            <button className={styles.globalSearch} type="button" onClick={() => setPaletteOpen(true)}>
              <AdminIcon name="search" />
              <span>Search users, transactions, products…</span>
              <kbd>Ctrl K</kbd>
            </button>
          </div>

          <div className={styles.topbarActions}>
            <div className={styles.systemStatus}>
              <span />
              <strong>Systems healthy</strong>
            </div>
            <button className={styles.topbarIconButton} type="button" onClick={toggleTheme} aria-label="Toggle colour mode">
              <span aria-hidden="true">{resolved === "light" ? "◐" : "☀"}</span>
            </button>
            <div className={styles.popoverAnchor}>
              <button className={styles.topbarIconButton} type="button" onClick={() => setAlertsOpen((open) => !open)} aria-label="Open operational alerts">
                <AdminIcon name="bell" />
                <i className={styles.notificationDot} />
              </button>
              {alertsOpen ? (
                <div className={styles.topbarPopover}>
                  <div className={styles.popoverHeading}><strong>Operational alerts</strong><span>3 new</span></div>
                  <Link href="/admin/operations/pending" onClick={() => setAlertsOpen(false)}><i data-tone="amber" />Pending payments need review<small>Just now</small></Link>
                  <Link href="/admin/products/providers" onClick={() => setAlertsOpen(false)}><i data-tone="red" />Provider balance threshold reached<small>8m</small></Link>
                  <Link href="/admin/settings/security" onClick={() => setAlertsOpen(false)}><i data-tone="green" />Security scan completed<small>42m</small></Link>
                  <Link className={styles.popoverFooterLink} href="/admin/operations/live" onClick={() => setAlertsOpen(false)}>View operations centre</Link>
                </div>
              ) : null}
            </div>
            <div className={styles.popoverAnchor}>
              <button className={styles.adminIdentity} type="button" onClick={() => setProfileOpen((open) => !open)}>
                <span className={styles.adminAvatar}>{admin.initials}</span>
                <span className={styles.adminIdentityCopy}><strong>{admin.fullName}</strong><small>{admin.role}</small></span>
                <span aria-hidden="true">⌄</span>
              </button>
              {profileOpen ? (
                <div className={`${styles.topbarPopover} ${styles.profilePopover}`}>
                  <div className={styles.profileSummary}><span>{admin.initials}</span><div><strong>{admin.fullName}</strong><small>{admin.email}</small></div></div>
                  <Link href="/admin/settings" onClick={() => setProfileOpen(false)}><AdminIcon name="settings" />Admin preferences</Link>
                  <Link href="/admin/settings/security" onClick={() => setProfileOpen(false)}><AdminIcon name="lock" />Security & sessions</Link>
                  <form action={signOutAdmin}><button type="submit"><span>Sign out</span><span aria-hidden="true">→</span></button></form>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className={styles.adminMain}>{children}</main>
      </div>

      {paletteOpen ? (
        <div className={styles.commandBackdrop} role="presentation" onMouseDown={() => setPaletteOpen(false)}>
          <div className={styles.commandPalette} role="dialog" aria-modal="true" aria-label="Admin command palette" onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.commandInputWrap}>
              <AdminIcon name="search" />
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the whole control centre…" />
              <kbd>Esc</kbd>
            </div>
            <div className={styles.commandContent}>
              <span className={styles.commandLabel}>{query ? "Best matches" : "Quick jump"}</span>
              {recordResults.map((item) => (
                <button type="button" key={`${item.type}:${item.id}`} onClick={() => openResult(item.href)}>
                  <span className={styles.commandIcon}><AdminIcon name={item.type === "customer" ? "users" : item.type === "transaction" ? "transactions" : item.type === "provider" ? "provider" : "catalogue"} /></span>
                  <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                  <span className={styles.commandArrow}>↗</span>
                </button>
              ))}
              {results.length || recordResults.length ? results.map((item) => (
                <button type="button" key={item.href} onClick={() => openResult(item.href)}>
                  <span className={styles.commandIcon}><AdminIcon name={item.icon} /></span>
                  <span><strong>{item.label}</strong><small>{item.description}</small></span>
                  <span className={styles.commandArrow}>↗</span>
                </button>
              )) : <div className={styles.commandEmpty}>No control-centre destination matches “{query}”.</div>}
            </div>
            <div className={styles.commandFooter}><span>Navigate <kbd>↑</kbd><kbd>↓</kbd></span><span>Open <kbd>↵</kbd></span><span>Close <kbd>Esc</kbd></span></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
