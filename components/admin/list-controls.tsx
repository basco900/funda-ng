"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import AdminIcon, { type AdminIconName } from "@/app/admin/(console)/admin-icon";
import AdminSelect, { type AdminSelectOption } from "@/app/admin/(console)/admin-select";
import { cn } from "@/lib/utils";

/**
 * List controls, styled after Jobly's My Applications and My Jobs pages:
 * underline tabs with a sliding bar, filter chips, a search field, pickers and a pager.
 *
 * `UrlList` keeps filters in the URL (server-side lists): it receives the current
 * params from the server page, so links can be shared and nothing waits on
 * useSearchParams. The controls also work stand-alone with value/onChange.
 */

export type FilterOption = { value: string; label: string; count?: number; icon?: AdminIconName };

const STATUS_ICON_MAP: Array<[readonly string[], AdminIconName]> = [
  [["active", "succeeded", "successful", "success", "completed", "complete", "live", "operational", "online", "enabled", "verified", "healthy", "published", "approved", "resolved", "paid", "delivered", "low"], "checkCircle"],
  [["pending", "processing", "initializing", "initiated", "queued", "standby", "scheduled", "paused", "draft", "underpaid", "review"], "clock"],
  [["failed", "failure", "error", "down", "offline", "blocked", "suspended", "disabled", "expired", "cancelled", "canceled", "rejected", "declined", "critical", "high"], "xCircle"],
  [["refunded", "reversed"], "refund"],
  [["warning", "degraded", "test_mode", "test mode", "medium"], "alert"],
  [["data"], "wifi"],
  [["airtime"], "phone"],
  [["electricity"], "bolt"],
  [["cable", "tv"], "tv"],
  [["education"], "education"],
];

export function statusIconFor(value: string): AdminIconName {
  if (!value) return "grid";
  const normalized = value.trim().toLowerCase().replaceAll("_", " ");
  for (const [keys, icon] of STATUS_ICON_MAP) {
    if (keys.includes(normalized)) return icon;
  }
  return "sliders";
}

type UrlListValue = {
  values: Record<string, string>;
  set: (next: Record<string, string | null>, options?: { keepPage?: boolean }) => void;
  pending: boolean;
};

const UrlListContext = createContext<UrlListValue | null>(null);

export function UrlList({ values, pageParam = "page", children }: { values: Record<string, string>; pageParam?: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const set: UrlListValue["set"] = (next, options) => {
    const params = new URLSearchParams(Object.entries(values).filter(([, value]) => value));
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (!options?.keepPage) params.delete(pageParam);
    const query = params.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  };

  return (
    <UrlListContext.Provider value={{ values, set, pending }}>
      <div className={cn("transition-opacity duration-200", pending && "pointer-events-none opacity-55")} aria-busy={pending || undefined}>
        {children}
      </div>
    </UrlListContext.Provider>
  );
}

function useUrlList() {
  const context = useContext(UrlListContext);
  if (!context) throw new Error("URL list controls must sit inside <UrlList>.");
  return context;
}

/* ─── Status tabs ─────────────────────────────────────────────────────────── */

export function StatusTabs({ options, value, onChange, allLabel = "All", total, label = "Filter by status" }: { options: FilterOption[]; value: string; onChange: (value: string) => void; allLabel?: string; total?: number; label?: string }) {
  const items: FilterOption[] = [{ value: "", label: allLabel, count: total }, ...options];
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const node = refs.current.get(value) ?? refs.current.get("");
      if (node) setBar({ left: node.offsetLeft, width: node.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value, options.length]);

  return (
    <div role="tablist" aria-label={label} className="relative flex gap-1 overflow-x-auto border-b border-a-line [scrollbar-width:none]">
      {items.map((option) => {
        const active = option.value === value;
        const icon = option.icon ?? statusIconFor(option.value);
        return (
          <button
            key={option.value || "all"}
            ref={(node) => {
              if (node) refs.current.set(option.value, node);
            }}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn("group flex h-11 shrink-0 items-center gap-2 px-2.5 text-[13px] capitalize transition-colors sm:px-3", active ? "font-semibold text-zinc-950" : "font-medium text-zinc-500 hover:text-zinc-900")}
          >
            <AdminIcon
              name={icon}
              className={cn("size-[15px] shrink-0 transition-colors", active ? "text-primary" : "text-zinc-400 group-hover:text-zinc-700")}
            />
            {option.label}
            {option.count !== undefined ? (
              <span className={cn("rounded-[5px] px-1.5 text-[11px] leading-[18px] font-semibold tabular-nums", active ? "bg-primary/[0.09] text-primary" : "bg-zinc-100 text-zinc-500")}>
                {option.count.toLocaleString("en-NG")}
              </span>
            ) : null}
          </button>
        );
      })}
      {bar ? (
        <span aria-hidden="true" className="absolute bottom-0 h-[2px] rounded-full bg-primary transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]" style={{ left: bar.left, width: bar.width }} />
      ) : null}
    </div>
  );
}

/* ─── Filter chips (Jobly's notification panel filters) ───────────────────── */

export function FilterChips({ options, value, onChange, allLabel = "All", total, label = "Filter" }: { options: FilterOption[]; value: string; onChange: (value: string) => void; allLabel?: string; total?: number; label?: string }) {
  const items: FilterOption[] = [{ value: "", label: allLabel, count: total }, ...options];
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((option) => {
        const active = option.value === value;
        const icon = option.icon ?? statusIconFor(option.value);
        return (
          <button
            key={option.value || "all"}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] px-2.5 text-[12px] font-semibold capitalize transition-colors",
              active ? "bg-primary text-white" : "bg-zinc-100/80 text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900",
            )}
          >
            <AdminIcon name={icon} className={cn("size-3.5 shrink-0", active ? "text-white" : "text-zinc-400")} />
            {option.label}
            {option.count !== undefined ? <span className={cn("tabular-nums", active ? "text-white/75" : "text-zinc-400")}>{option.count.toLocaleString("en-NG")}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Search ──────────────────────────────────────────────────────────────── */

export function SearchField({ value, onChange, placeholder = "Search", className, debounce = 0 }: { value: string; onChange: (value: string) => void; placeholder?: string; className?: string; debounce?: number }) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }

  useEffect(() => {
    if (!debounce || draft.trim() === value) return;
    const timer = setTimeout(() => onChange(draft.trim()), debounce);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const update = (next: string) => {
    setDraft(next);
    if (!debounce) onChange(next);
  };

  return (
    <div className={cn("relative w-full sm:w-[280px]", className)}>
      <AdminIcon name="search" className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-zinc-400" />
      <input
        type="search"
        value={draft}
        onChange={(event) => update(event.target.value.slice(0, 80))}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-[8px] border border-a-line bg-a-surface pr-8 pl-9 text-[13px] text-zinc-900 transition outline-none placeholder:text-zinc-400 hover:border-zinc-300 focus:border-primary/40 focus:shadow-[0_0_0_1px_color-mix(in_srgb,var(--a-primary)_24%,transparent)] [&::-webkit-search-cancel-button]:hidden"
      />
      {draft ? (
        <button type="button" onClick={() => update("")} aria-label="Clear search" className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
          <AdminIcon name="close" className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/* ─── Pickers ─────────────────────────────────────────────────────────────── */

export function FilterPicker({ value, onChange, options, allLabel, width = 170, leadingIcon }: { value: string; onChange: (value: string) => void; options: FilterOption[]; allLabel: string; width?: number; leadingIcon?: AdminIconName }) {
  return (
    <div className="min-w-0 flex-1 sm:flex-none sm:min-w-[var(--picker-w)]" style={{ ["--picker-w" as string]: `${width}px` }}>
      <AdminSelect leadingIcon={leadingIcon} value={value || "__all"} onValueChange={(next) => onChange(next === "__all" ? "" : next)} options={[{ value: "__all", label: allLabel }, ...options.map((option) => ({ value: option.value, label: option.label, description: option.count === undefined ? undefined : option.count.toLocaleString("en-NG") }))]} />
    </div>
  );
}

/** State options with counts, for lists filtered in the browser (all rows already loaded). */
export function statusOptionsFrom<T>(rows: readonly T[], statusOf: (row: T) => string | null | undefined): FilterOption[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const status = statusOf(row);
    if (status) counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, label: value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase()), count }));
}

export const RANGE_OPTIONS: FilterOption[] = [
  { value: "1", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

/* ─── URL-bound bar ───────────────────────────────────────────────────────── */

export type UrlFilterSpec = {
  status?: { total: number; options: FilterOption[] };
  facet?: { label: string; options: FilterOption[] };
  search?: string;
  range?: boolean;
  /** Tabs above the bar (page-level lists) or chips inside it (lists within a page). */
  statusStyle?: "tabs" | "chips";
};

export function UrlFilterBar({ spec, params = { status: "status", facet: "facet", q: "q", range: "range" }, trailing }: { spec: UrlFilterSpec; params?: { status: string; facet: string; q: string; range: string }; trailing?: ReactNode }) {
  const { values, set } = useUrlList();
  const filtering = Boolean(values[params.status] || values[params.facet] || values[params.q] || values[params.range]);
  const statusStyle = spec.statusStyle ?? "tabs";
  const hasRow = Boolean(spec.search || spec.facet || spec.range || trailing || (spec.status && statusStyle === "chips"));

  return (
    <div className="space-y-5">
      {spec.status && statusStyle === "tabs" && spec.status.options.length > 0 ? (
        <StatusTabs options={spec.status.options} total={spec.status.total} value={values[params.status] ?? ""} onChange={(value) => set({ [params.status]: value })} />
      ) : null}
      {hasRow ? (
        <div className="flex flex-wrap items-center gap-2">
          {spec.status && statusStyle === "chips" && spec.status.options.length > 0 ? (
            <FilterChips options={spec.status.options} total={spec.status.total} value={values[params.status] ?? ""} onChange={(value) => set({ [params.status]: value })} />
          ) : null}
          {spec.search ? <SearchField value={values[params.q] ?? ""} onChange={(value) => set({ [params.q]: value })} placeholder={spec.search} debounce={350} /> : null}
          {spec.facet ? (
            <FilterPicker leadingIcon="filter" value={values[params.facet] ?? ""} onChange={(value) => set({ [params.facet]: value })} options={spec.facet.options} allLabel={`All ${plural(spec.facet.label)}`} />
          ) : null}
          {spec.range ? <FilterPicker leadingIcon="calendar" value={values[params.range] ?? ""} onChange={(value) => set({ [params.range]: value })} options={RANGE_OPTIONS} allLabel="All time" width={160} /> : null}
          {filtering ? (
            <button
              type="button"
              onClick={() => set({ [params.status]: null, [params.facet]: null, [params.q]: null, [params.range]: null })}
              className="inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-[12.5px] font-semibold text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
            >
              <AdminIcon name="close" className="size-3.5" />
              Clear
            </button>
          ) : null}
          {trailing ? <div className="ml-auto flex items-center gap-2">{trailing}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function plural(label: string) {
  const lower = label.toLowerCase();
  return lower.endsWith("s") ? lower : lower.endsWith("y") ? `${lower.slice(0, -1)}ies` : `${lower}s`;
}

/* ─── Pager (Jobly's My Jobs pages) ───────────────────────────────────────── */

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3">
      <span className="text-[12.5px] font-medium text-zinc-500 tabular-nums">
        {first.toLocaleString("en-NG")}–{last.toLocaleString("en-NG")} of {total.toLocaleString("en-NG")}
      </span>
      {pages > 1 ? (
        <div className="flex items-center gap-1.5">
          <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" className={pagerButton}>
            <AdminIcon name="arrowLeft" className="size-4" />
          </button>
          <span className="px-1.5 text-[12.5px] font-semibold text-zinc-700 tabular-nums">
            {page} / {pages}
          </span>
          <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page" className={pagerButton}>
            <AdminIcon name="arrowRight" className="size-4" />
          </button>
        </div>
      ) : null}
    </nav>
  );
}

const pagerButton =
  "grid size-9 place-items-center rounded-[8px] border border-a-line bg-a-surface text-zinc-600 transition-colors hover:border-primary/30 hover:text-primary disabled:pointer-events-none disabled:opacity-35";

export function UrlPager({ page, pageSize, total, param = "page" }: { page: number; pageSize: number; total: number; param?: string }) {
  const { set } = useUrlList();
  return <Pager page={page} pageSize={pageSize} total={total} onPage={(next) => set({ [param]: next > 1 ? String(next) : null }, { keepPage: true })} />;
}

/** Status tabs bound to a URL param, for lists that only filter by state. */
export function UrlStatusChips({ param, options, total }: { param: string; options: FilterOption[]; total?: number }) {
  const { values, set } = useUrlList();
  return <FilterChips options={options} total={total} value={values[param] ?? ""} onChange={(value) => set({ [param]: value })} />;
}

/* ─── Segmented control (iOS: a thumb that slides between options) ───────── */

export function Segmented({ options, value, onChange, label }: { options: FilterOption[]; value: string; onChange: (value: string) => void; label: string }) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const node = refs.current.get(value);
    if (node) setThumb({ left: node.offsetLeft, width: node.offsetWidth });
  }, [value, options.length]);

  return (
    <div role="radiogroup" aria-label={label} className="relative inline-flex h-9 items-center rounded-[8px] bg-zinc-100 p-[3px]">
      {thumb ? (
        <span
          aria-hidden="true"
          className="absolute top-[3px] bottom-[3px] rounded-[6px] border border-a-line bg-a-thumb transition-all duration-300 ease-[cubic-bezier(0.34,1.3,0.64,1)]"
          style={{ left: thumb.left, width: thumb.width }}
        />
      ) : null}
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              if (node) refs.current.set(option.value, node);
            }}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn("relative z-10 h-full rounded-[6px] px-3 text-[12.5px] font-semibold transition-colors active:scale-[0.97]", active ? "text-zinc-950" : "text-zinc-500 hover:text-zinc-900")}
          >
            {option.label}
            {option.count !== undefined ? <span className={cn("ml-1.5 tabular-nums", active ? "text-zinc-500" : "text-zinc-400")}>{option.count.toLocaleString("en-NG")}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function UrlSegmented({ param, options, fallback, label }: { param: string; options: FilterOption[]; fallback: string; label: string }) {
  const { values, set } = useUrlList();
  return <Segmented label={label} options={options} value={values[param] || fallback} onChange={(value) => set({ [param]: value === fallback ? null : value }, { keepPage: true })} />;
}

export function UrlSelect({
  param,
  options,
  fallback = "",
  leadingIcon,
  variant = "compact",
  menuAlign = "left",
  ariaLabel,
  className,
  resetParams,
}: {
  param: string;
  options: AdminSelectOption[];
  fallback?: string;
  leadingIcon?: AdminIconName;
  variant?: "default" | "compact";
  menuAlign?: "left" | "right";
  ariaLabel?: string;
  className?: string;
  resetParams?: Record<string, null>;
}) {
  const { values, set } = useUrlList();
  return (
    <AdminSelect
      value={values[param] || fallback}
      options={options}
      leadingIcon={leadingIcon}
      variant={variant}
      menuAlign={menuAlign}
      ariaLabel={ariaLabel}
      className={className}
      onValueChange={(next) =>
        set({ ...(resetParams ?? {}), [param]: next === fallback ? null : next }, { keepPage: true })
      }
    />
  );
}

export function UrlResetButton({ params, label = "Reset" }: { params: readonly string[]; label?: string }) {
  const { values, set } = useUrlList();
  if (!params.some((key) => Boolean(values[key]))) return null;
  const cleared: Record<string, null> = {};
  for (const key of params) cleared[key] = null;
  return (
    <button
      type="button"
      onClick={() => set(cleared, { keepPage: true })}
      className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-[8px] px-2.5 text-[12.5px] font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 active:scale-[0.98]"
    >
      <AdminIcon name="refresh" className="size-3.5" />
      {label}
    </button>
  );
}

/** State chips for a product page's recent purchases, kept in `?purchases=`. */
export function PurchaseStatusFilter({ filter }: { filter: { status: string; total: number; options: FilterOption[] } }) {
  return (
    <UrlList values={{ purchases: filter.status }}>
      <UrlStatusChips param="purchases" options={filter.options} total={filter.total} />
    </UrlList>
  );
}
