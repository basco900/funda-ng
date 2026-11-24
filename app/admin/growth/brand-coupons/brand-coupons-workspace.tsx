"use client";

import { useMemo, useState, useTransition } from "react";
import { AdminPageHeader } from "@/components/admin/page-pattern";
import { FilterChips, FilterPicker, statusOptionsFrom } from "@/components/admin/list-controls";
import AdminIcon from "../../(console)/admin-icon";
import AdminSelect from "../../(console)/admin-select";
import { AdminFeedback, AdminModal } from "../../(console)/admin-ui";
import styles from "../../admin.module.css";
import { BRAND_CATEGORIES, CATEGORY_LABELS, KIND_LABELS, type OfferKind } from "@/lib/coupons/types";
import { dismissCouponRequest, moderateCouponOffer, queueCouponRefresh, saveCouponBrand, setCouponBrandStatus, type CouponActionResult } from "./actions";

export type AdminBrandRow = {
  id: string;
  slug: string;
  name: string;
  domain: string;
  category: string;
  tier: "hot" | "regular" | "long_tail";
  status: "active" | "paused";
  country_scope: "ng" | "global";
  aliases: string[];
  promo_urls: string[];
  last_refreshed_at: string | null;
  next_refresh_at: string;
  last_refresh_status: string | null;
  search_count: number;
};

export type AdminOfferRow = {
  id: string;
  brand_id: string;
  kind: OfferKind;
  code: string | null;
  title: string;
  conditions: string | null;
  discount_text: string | null;
  source_type: string;
  source_url: string | null;
  status: string;
  expires_at: string | null;
  last_seen_at: string;
  worked_count: number;
  failed_count: number;
  copy_count: number;
  created_at: string;
};

export type AdminRunRow = {
  id: string;
  brand_id: string | null;
  trigger: string;
  status: string;
  provider: string | null;
  pages_checked: number;
  found: number;
  added: number;
  updated: number;
  retired: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

type Tab = "brands" | "review" | "offers" | "runs" | "requests";
const TIER_LABELS = { hot: "Hot", regular: "Regular", long_tail: "Long tail" } as const;

const when = (value: string | null) => (value ? new Date(value).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");

export default function BrandCouponsWorkspace({
  connected,
  brands,
  offers,
  runs,
  requests,
  providers,
}: {
  connected: boolean;
  brands: AdminBrandRow[];
  offers: AdminOfferRow[];
  runs: AdminRunRow[];
  requests: Array<{ query: string; search_count: number; last_searched_at: string }>;
  providers: { search: string | null; extract: string | null };
}) {
  const [tab, setTab] = useState<Tab>("brands");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Partial<AdminBrandRow> | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [offerStatus, setOfferStatus] = useState("active");

  const brandName = useMemo(() => new Map(brands.map((brand) => [brand.id, brand.name])), [brands]);
  const offerCounts = useMemo(() => {
    const counts = new Map<string, { live: number; codes: number }>();
    for (const offer of offers) {
      if (offer.status !== "active") continue;
      const entry = counts.get(offer.brand_id) ?? { live: 0, codes: 0 };
      entry.live += 1;
      if (offer.kind === "code") entry.codes += 1;
      counts.set(offer.brand_id, entry);
    }
    return counts;
  }, [offers]);

  const review = offers.filter((offer) => offer.status === "pending");
  const live = offers.filter((offer) => offer.status === "active");
  const visibleBrands = brands.filter((brand) => {
    if (category && brand.category !== category) return false;
    const needle = query.trim().toLowerCase();
    return !needle || `${brand.name} ${brand.domain} ${brand.aliases.join(" ")}`.toLowerCase().includes(needle);
  });
  const visibleOffers = offers.filter((offer) => offer.status !== "pending" && (!offerStatus || offer.status === offerStatus));

  const run = (action: () => Promise<CouponActionResult>, after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      setFeedback({ type: result.ok ? "success" : "error", text: result.message });
      if (result.ok) after?.();
    });

  const tabs: Array<{ id: Tab; label: string; icon: string; count?: number }> = [
    { id: "brands", label: "Brands", icon: "catalogue", count: brands.length },
    { id: "review", label: "Review", icon: "check", count: review.length },
    { id: "offers", label: "Offers", icon: "pricing", count: live.length },
    { id: "runs", label: "Runs", icon: "refresh", count: runs.length },
    { id: "requests", label: "Requests", icon: "search", count: requests.length },
  ];

  return (
    <div className={styles.workspacePage}>
      <AdminPageHeader
        title="Brand Coupons"
        actions={
          <>
            <a href="/coupons" target="_blank" rel="noreferrer" className={styles.secondaryButton}>
              <AdminIcon name="external" />
              View site
            </a>
            <button type="button" className={styles.primaryButton} onClick={() => setEditing({ tier: "regular", country_scope: "global", category: "shopping" })}>
              <AdminIcon name="plus" />
              Add brand
            </button>
          </>
        }
        stats={[
          { icon: "catalogue", tone: "primary", value: brands.filter((brand) => brand.status === "active").length.toLocaleString("en-NG"), label: "Active brands" },
          { icon: "pricing", tone: "emerald", value: live.length.toLocaleString("en-NG"), label: "Live offers" },
          { icon: "coupon", tone: "slate", value: live.filter((offer) => offer.kind === "code").length.toLocaleString("en-NG"), label: "Codes" },
          { icon: "clock", tone: review.length ? "amber" : "slate", value: review.length, label: "Awaiting review" },
        ]}
      />

      {!connected ? <AdminFeedback tone="error" text="Apply the coupon finder migration to start." onClose={() => null} /> : null}
      {!providers.extract ? <p className={styles.productNotice}>Automatic refresh is off. Add OPENAI_API_KEY (and optionally BRAVE_SEARCH_API_KEY) to turn it on.</p> : null}
      {feedback ? <AdminFeedback tone={feedback.type} text={feedback.text} onClose={() => setFeedback(null)} /> : null}

      <section className={styles.workspacePanel}>
        <div className={styles.directoryHeader} data-tabbed>
          <nav className={styles.segmentedTabs} aria-label="Coupon sections">
            {tabs.map((item) => (
              <button key={item.id} type="button" className={styles.networkUnderlineTab} data-active={tab === item.id} onClick={() => setTab(item.id)}>
                <AdminIcon name={item.icon} />
                {item.label}
                {item.count !== undefined ? <span className={styles.countPill}>{item.count}</span> : null}
              </button>
            ))}
          </nav>
          {tab === "brands" ? (
            <div className={styles.directoryTools}>
              <label className={styles.directorySearch}>
                <AdminIcon name="search" />
                <input placeholder="Search brands" value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
              <FilterPicker value={category} onChange={setCategory} allLabel="All categories" options={statusOptionsFrom(brands, (brand) => brand.category).map((option) => ({ ...option, label: CATEGORY_LABELS[option.value] ?? option.label }))} />
            </div>
          ) : null}
          {tab === "offers" ? <FilterChips options={statusOptionsFrom(offers.filter((offer) => offer.status !== "pending"), (offer) => offer.status)} value={offerStatus} onChange={setOfferStatus} total={offers.length - review.length} /> : null}
        </div>

        {tab === "brands" ? (
          <div className={styles.workspaceTableWrap}>
            <table className={styles.workspaceTable}>
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Category</th>
                  <th>Tier</th>
                  <th data-align="right">Live</th>
                  <th data-align="right">Searches</th>
                  <th>Last check</th>
                  <th>Status</th>
                  <th data-align="right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleBrands.length ? (
                  visibleBrands.map((brand) => {
                    const counts = offerCounts.get(brand.id);
                    return (
                      <tr key={brand.id}>
                        <td>
                          <div className={styles.cellTitle}>
                            <strong>{brand.name}</strong>
                            <small>{brand.domain}{brand.country_scope === "ng" ? " · Nigeria" : ""}</small>
                          </div>
                        </td>
                        <td className={styles.cellPlain}>{CATEGORY_LABELS[brand.category] ?? brand.category}</td>
                        <td className={styles.cellPlain}>{TIER_LABELS[brand.tier]}</td>
                        <td data-align="right">
                          <div className={styles.cellValue}>
                            <strong>{counts?.live ?? 0}</strong>
                            <small>{counts?.codes ?? 0} codes</small>
                          </div>
                        </td>
                        <td data-align="right" className={styles.cellPlain}>{brand.search_count.toLocaleString("en-NG")}</td>
                        <td>
                          <div className={styles.cellValue}>
                            <strong>{when(brand.last_refreshed_at)}</strong>
                            <small>{brand.last_refresh_status ? `${brand.last_refresh_status} · next ${when(brand.next_refresh_at)}` : `Next ${when(brand.next_refresh_at)}`}</small>
                          </div>
                        </td>
                        <td>
                          <button type="button" className={`${styles.statusPill} ${styles.statusToggle}`} data-status={brand.status === "active" ? "active" : "paused"} disabled={pending} onClick={() => run(() => setCouponBrandStatus({ id: brand.id, status: brand.status === "active" ? "paused" : "active" }))}>
                            {brand.status === "active" ? "Active" : "Paused"}
                          </button>
                        </td>
                        <td data-align="right">
                          <div className={styles.rowActions}>
                            <a href={`/coupons/${brand.slug}`} target="_blank" rel="noreferrer" className={styles.iconAction} aria-label="Open public page" data-tip="Open page">
                              <AdminIcon name="external" />
                            </a>
                            <button type="button" className={styles.iconAction} aria-label="Refresh now" data-tip="Refresh" disabled={pending || !providers.extract} onClick={() => run(() => queueCouponRefresh({ id: brand.id }))}>
                              <AdminIcon name="refresh" />
                            </button>
                            <button type="button" className={styles.iconAction} aria-label="Edit brand" data-tip="Edit" onClick={() => setEditing(brand)}>
                              <AdminIcon name="pencil" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8}>
                      <div className={styles.tableEmpty}>
                        <AdminIcon name="catalogue" />
                        <strong>No Brands Match</strong>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === "review" || tab === "offers" ? (
          <div className={styles.workspaceTableWrap}>
            <table className={styles.workspaceTable}>
              <thead>
                <tr>
                  <th>Offer</th>
                  <th>Brand</th>
                  <th>Source</th>
                  <th data-align="right">Votes</th>
                  <th>Seen</th>
                  <th>Status</th>
                  <th data-align="right">Action</th>
                </tr>
              </thead>
              <tbody>
                {(tab === "review" ? review : visibleOffers).length ? (
                  (tab === "review" ? review : visibleOffers).slice(0, 300).map((offer) => (
                    <tr key={offer.id}>
                      <td>
                        <div className={styles.cellTitle}>
                          <strong>{offer.code ?? offer.discount_text ?? KIND_LABELS[offer.kind]}</strong>
                          <small>{offer.title}</small>
                        </div>
                      </td>
                      <td className={styles.cellPlain}>{brandName.get(offer.brand_id) ?? "—"}</td>
                      <td>
                        {offer.source_url ? (
                          <a className={styles.textAction} href={offer.source_url} target="_blank" rel="noreferrer">
                            {offer.source_type}
                          </a>
                        ) : (
                          <span className={styles.cellPlain}>{offer.source_type}</span>
                        )}
                      </td>
                      <td data-align="right">
                        <div className={styles.cellValue}>
                          <strong>{offer.worked_count} / {offer.failed_count}</strong>
                          <small>{offer.copy_count} copies</small>
                        </div>
                      </td>
                      <td className={styles.cellPlain}>{when(offer.last_seen_at)}</td>
                      <td>
                        <span className={styles.statusPill} data-status={offer.status}>{offer.status}</span>
                      </td>
                      <td data-align="right">
                        <div className={styles.rowActions}>
                          {offer.status !== "active" ? (
                            <button type="button" className={styles.iconAction} aria-label="Approve" data-tip="Make live" disabled={pending} onClick={() => run(() => moderateCouponOffer({ id: offer.id, status: "active" }))}>
                              <AdminIcon name="check" />
                            </button>
                          ) : null}
                          {offer.status === "active" ? (
                            <button type="button" className={styles.iconAction} aria-label="Mark expired" data-tip="Expire" disabled={pending} onClick={() => run(() => moderateCouponOffer({ id: offer.id, status: "expired" }))}>
                              <AdminIcon name="clock" />
                            </button>
                          ) : null}
                          {offer.status !== "rejected" ? (
                            <button type="button" className={`${styles.iconAction} ${styles.iconActionDanger}`} aria-label="Reject" data-tip="Reject" disabled={pending} onClick={() => run(() => moderateCouponOffer({ id: offer.id, status: "rejected" }))}>
                              <AdminIcon name="close" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7}>
                      <div className={styles.tableEmpty}>
                        <AdminIcon name={tab === "review" ? "check" : "pricing"} />
                        <strong>{tab === "review" ? "Nothing to Review" : "No Offers Here"}</strong>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === "runs" ? (
          <div className={styles.workspaceTableWrap}>
            <table className={styles.workspaceTable}>
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Trigger</th>
                  <th data-align="right">Pages</th>
                  <th data-align="right">Found</th>
                  <th data-align="right">Added · Updated · Retired</th>
                  <th>Started</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {runs.length ? (
                  runs.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className={styles.cellTitle}>
                          <strong>{item.brand_id ? brandName.get(item.brand_id) ?? "Removed brand" : "—"}</strong>
                          <small>{item.error ?? item.provider ?? ""}</small>
                        </div>
                      </td>
                      <td className={styles.cellPlain}>{item.trigger}</td>
                      <td data-align="right" className={styles.cellPlain}>{item.pages_checked}</td>
                      <td data-align="right" className={styles.cellPlain}>{item.found}</td>
                      <td data-align="right" className={styles.cellPlain}>{item.added} · {item.updated} · {item.retired}</td>
                      <td className={styles.cellPlain}>{when(item.started_at)}</td>
                      <td>
                        <span className={styles.statusPill} data-status={item.status === "succeeded" ? "successful" : item.status === "empty" ? "standby" : item.status === "running" ? "processing" : "failed"}>{item.status}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7}>
                      <div className={styles.tableEmpty}>
                        <AdminIcon name="refresh" />
                        <strong>No Runs Yet</strong>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === "requests" ? (
          <div className={styles.workspaceTableWrap}>
            <table className={styles.workspaceTable}>
              <thead>
                <tr>
                  <th>Searched for</th>
                  <th data-align="right">Searches</th>
                  <th>Last searched</th>
                  <th data-align="right">Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.length ? (
                  requests.map((request) => (
                    <tr key={request.query}>
                      <td>
                        <div className={styles.cellTitle}>
                          <strong>{request.query}</strong>
                        </div>
                      </td>
                      <td data-align="right" className={styles.cellPlain}>{request.search_count}</td>
                      <td className={styles.cellPlain}>{when(request.last_searched_at)}</td>
                      <td data-align="right">
                        <div className={styles.rowActions}>
                          <button type="button" className={styles.iconAction} aria-label="Add as brand" data-tip="Add brand" onClick={() => setEditing({ name: request.query.replace(/\b\w/g, (letter) => letter.toUpperCase()), tier: "long_tail", country_scope: "global", category: "shopping" })}>
                            <AdminIcon name="plus" />
                          </button>
                          <button type="button" className={`${styles.iconAction} ${styles.iconActionDanger}`} aria-label="Dismiss" data-tip="Dismiss" disabled={pending} onClick={() => run(() => dismissCouponRequest({ query: request.query }))}>
                            <AdminIcon name="close" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>
                      <div className={styles.tableEmpty}>
                        <AdminIcon name="search" />
                        <strong>No Requests Yet</strong>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {editing ? (
        <AdminModal
          eyebrow="Brand"
          title={editing.id ? editing.name ?? "Edit brand" : "New brand"}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button type="button" className={styles.secondaryButton} onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" form="coupon-brand-form" className={styles.primaryButton} disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <form
            id="coupon-brand-form"
            className={styles.modalForm}
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              run(
                () =>
                  saveCouponBrand({
                    id: editing.id,
                    name: form.get("name"),
                    domain: form.get("domain"),
                    category: form.get("category"),
                    tier: form.get("tier"),
                    countryScope: form.get("countryScope"),
                    aliases: form.get("aliases"),
                    promoUrls: form.get("promoUrls"),
                  }),
                () => setEditing(null),
              );
            }}
          >
            <div className={styles.formGrid}>
              <label className={styles.fieldGroup}>
                <span>Name</span>
                <input name="name" required defaultValue={editing.name ?? ""} placeholder="Jumia" />
              </label>
              <label className={styles.fieldGroup}>
                <span>Website</span>
                <input name="domain" required defaultValue={editing.domain ?? ""} placeholder="jumia.com.ng" />
              </label>
              <div className={styles.fieldGroup}>
                <span>Category</span>
                <AdminSelect name="category" defaultValue={editing.category ?? "shopping"} options={BRAND_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] ?? value }))} />
              </div>
              <div className={styles.fieldGroup}>
                <span>Refresh tier</span>
                <AdminSelect name="tier" defaultValue={editing.tier ?? "regular"} options={[{ value: "hot", label: "Hot", description: "every 2 days" }, { value: "regular", label: "Regular", description: "weekly" }, { value: "long_tail", label: "Long tail", description: "every 3 weeks" }]} />
              </div>
              <div className={styles.fieldGroup}>
                <span>Market</span>
                <AdminSelect name="countryScope" defaultValue={editing.country_scope ?? "global"} options={[{ value: "ng", label: "Nigeria" }, { value: "global", label: "Global" }]} />
              </div>
              <label className={styles.fieldGroup}>
                <span>Also known as</span>
                <input name="aliases" defaultValue={editing.aliases?.join(", ") ?? ""} placeholder="Jumia Nigeria, Jumia NG" />
              </label>
              <label className={`${styles.fieldGroup} ${styles.formSpan}`}>
                <span>Promo pages</span>
                <textarea name="promoUrls" rows={3} defaultValue={editing.promo_urls?.join("\n") ?? ""} placeholder="https://www.jumia.com.ng/vouchers/" />
              </label>
            </div>
          </form>
        </AdminModal>
      ) : null}
    </div>
  );
}
