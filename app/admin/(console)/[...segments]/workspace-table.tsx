"use client";

import { useMemo, useState, type ReactNode } from "react";
import { cn } from "../../../../lib/utils";
import AdminIcon from "../admin-icon";
import AdminSelect from "../admin-select";

type Column = { key: string; label: string; align?: "right" };
type Row = Record<string, unknown>;
type Tone = "emerald" | "amber" | "rose" | "sky" | "violet" | "slate";

const PAGE_SIZE = 20;
const STATUS_KEYS = ["status", "risk", "severity", "priority"];
const FACET_KEYS = ["service", "provider", "type", "network", "category", "channel", "tier", "scope", "entity", "rule"];

const TONE_WORDS: Record<Exclude<Tone, "slate">, string[]> = {
  emerald: ["succeeded", "successful", "success", "completed", "complete", "active", "paid", "credited", "approved", "resolved", "enabled", "live", "healthy", "operational", "online", "low", "delivered", "sent"],
  amber: ["pending", "processing", "initiated", "queued", "review", "in review", "held", "scheduled", "draft", "paused", "medium", "standby", "degraded", "open"],
  rose: ["failed", "failure", "error", "rejected", "declined", "blocked", "suspended", "disabled", "cancelled", "canceled", "expired", "offline", "down", "critical", "high"],
  sky: ["refunded", "reversed", "partially refunded"],
  violet: ["info", "escalated", "investigating"],
};

const TONE_CLASS: Record<Tone, { pill: string; dot: string }> = {
  emerald: { pill: "bg-emerald-50 text-emerald-700 border-emerald-200/70", dot: "bg-emerald-500" },
  amber: { pill: "bg-amber-50 text-amber-700 border-amber-200/70", dot: "bg-amber-500" },
  rose: { pill: "bg-rose-50 text-rose-700 border-rose-200/70", dot: "bg-rose-500" },
  sky: { pill: "bg-sky-50 text-sky-700 border-sky-200/70", dot: "bg-sky-500" },
  violet: { pill: "bg-violet-50 text-violet-700 border-violet-200/70", dot: "bg-violet-500" },
  slate: { pill: "bg-slate-50 text-slate-600 border-slate-200/70", dot: "bg-slate-400" },
};

function toneFor(value: string): Tone {
  const word = value.trim().toLowerCase().replaceAll("_", " ");
  for (const [tone, words] of Object.entries(TONE_WORDS)) {
    if (words.includes(word)) return tone as Tone;
  }
  return "slate";
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function StatusBadge({ value }: { value: string }) {
  const tone = TONE_CLASS[toneFor(value)];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-semibold capitalize", tone.pill)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {value || "—"}
    </span>
  );
}

export default function WorkspaceTable({
  title,
  icon,
  columns,
  rows,
  actions,
}: {
  title: string;
  icon: string;
  columns: Column[];
  rows: Row[];
  actions?: ReactNode;
}) {
  const statusKey = columns.find((column) => column.key === "status")?.key;
  const facetColumn = columns.find((column) => {
    if (!FACET_KEYS.includes(column.key)) return false;
    const distinct = new Set(rows.map((row) => text(row[column.key])).filter((value) => value && value !== "—"));
    return distinct.size > 1 && distinct.size <= 12;
  });

  const [status, setStatus] = useState("all");
  const [facet, setFacet] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const statusTabs = useMemo(() => {
    if (!statusKey) return [];
    const counts = new Map<string, number>();
    for (const row of rows) {
      const value = text(row[statusKey]);
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows, statusKey]);

  const facetOptions = useMemo(() => {
    if (!facetColumn) return [];
    const values = [...new Set(rows.map((row) => text(row[facetColumn.key])).filter((value) => value && value !== "—"))].sort();
    const plural = facetColumn.label.toLowerCase().replace(/(?<!s)$/, "s");
    return [{ value: "all", label: `All ${plural}` }, ...values.map((value) => ({ value, label: value }))];
  }, [rows, facetColumn]);

  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusKey && status !== "all" && text(row[statusKey]) !== status) return false;
      if (facetColumn && facet !== "all" && text(row[facetColumn.key]) !== facet) return false;
      if (terms && !columns.some((column) => text(row[column.key]).toLowerCase().includes(terms))) return false;
      return true;
    });
  }, [rows, columns, statusKey, status, facetColumn, facet, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const filtering = status !== "all" || facet !== "all" || query.trim() !== "";

  const reset = (apply: () => void) => {
    apply();
    setPage(1);
  };

  return (
    <section className="overflow-hidden rounded-[8px] border border-slate-200/70 bg-white shadow-xs">
      <div className="border-b border-slate-200/70 px-4 pt-3 sm:px-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-semibold tracking-tight text-slate-950">{title} directory</h2>
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500">
              {filtered.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-[220px]">
              <AdminIcon name="search" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => reset(() => setQuery(event.target.value))}
                placeholder={`Search ${title.toLowerCase()}…`}
                className="h-9 w-full rounded-[6px] border border-slate-200 bg-white pl-8 pr-3 text-[12px] shadow-none outline-hidden placeholder:text-slate-400 focus-visible:border-primary/35 focus-visible:ring-2 focus-visible:ring-primary/10"
              />
            </div>
            {facetColumn ? (
              <div className="w-full text-[12px] sm:w-[170px]">
                <AdminSelect value={facet} options={facetOptions} onValueChange={(value) => reset(() => setFacet(value))} />
              </div>
            ) : null}
            {actions}
          </div>
        </div>

        {statusTabs.length > 1 ? (
          <div className="-mb-px mt-3 flex gap-1 overflow-x-auto" role="tablist" aria-label="Filter by status">
            {[["all", rows.length] as const, ...statusTabs].map(([value, count]) => {
              const active = status === value;
              const tone = value === "all" ? null : TONE_CLASS[toneFor(value)];
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => reset(() => setStatus(value))}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 pb-2.5 pt-1 text-[12px] font-medium capitalize transition-colors",
                    active ? "border-primary text-primary font-semibold" : "border-transparent text-slate-500 hover:text-slate-900",
                  )}
                >
                  {tone ? <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} /> : null}
                  {value === "all" ? "All" : value}
                  <span
                    className={cn(
                      "inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
                      active ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="h-3" />
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200/70 bg-[#f7f6fb] dark:bg-white/[0.03]">
              {columns.map((column, idx) => (
                <th
                  key={column.key}
                  className={cn(
                    "h-11 px-4 sm:px-[22px] text-[11px] font-bold uppercase tracking-[0.1em] text-slate-600",
                    idx === 0 && "pl-5 sm:pl-7",
                    column.align === "right" && "text-right",
                  )}
                >
                  {column.label}
                </th>
              ))}
              <th className="h-11 w-14 pr-5 sm:pr-7 text-right text-[11px] font-bold uppercase tracking-[0.1em] text-slate-600">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="h-48 text-center text-[12.5px] text-slate-400">
                  <div className="mx-auto flex max-w-xs flex-col items-center">
                    <span className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-[8px] bg-slate-100 text-slate-400">
                      <AdminIcon name={icon} className="h-5 w-5" />
                    </span>
                    <p className="font-bold text-slate-800">{filtering ? "Nothing matches" : "No records found"}</p>
                    {filtering ? (
                      <button
                        type="button"
                        onClick={() => reset(() => { setStatus("all"); setFacet("all"); setQuery(""); })}
                        className="mt-1 text-[11.5px] font-semibold text-primary hover:underline"
                      >
                        Clear filters
                      </button>
                    ) : (
                      <small className="text-[11.5px] text-slate-400">New records will appear here automatically.</small>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              visible.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-slate-200/65 transition-colors hover:bg-slate-50/55">
                  {columns.map((column, idx) => {
                    const value = text(row[column.key]);
                    return (
                      <td
                        key={column.key}
                        className={cn(
                          "px-4 sm:px-[22px] py-4 text-[12.5px] text-slate-900",
                          idx === 0 && "pl-5 font-semibold",
                          column.align === "right" && "text-right font-medium",
                        )}
                      >
                        {STATUS_KEYS.includes(column.key) ? (
                          <StatusBadge value={value} />
                        ) : column.key === "reference" || column.key === "request" ? (
                          <code className="rounded-[4px] border border-slate-200/60 bg-slate-50 px-1 py-0.5 font-mono text-[11px] text-slate-600">{value}</code>
                        ) : (
                          value || "—"
                        )}
                      </td>
                    );
                  })}
                  <td className="py-4 pr-5 text-right sm:pr-7">
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-[5px] text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800"
                      aria-label="Row actions"
                    >
                      •••
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-200/70 bg-white px-5 py-3 text-[11.5px] sm:px-7 text-slate-500">
        <span>
          Showing {visible.length} of {filtered.length}
          {filtering ? ` (filtered from ${rows.length})` : ""}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
            className="inline-flex h-7 items-center gap-1 rounded-[5px] border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <span className="px-2 text-[11px] font-medium text-slate-600">
            Page {currentPage} of {pageCount}
          </span>
          <button
            type="button"
            disabled={currentPage >= pageCount}
            onClick={() => setPage(currentPage + 1)}
            className="inline-flex h-7 items-center gap-1 rounded-[5px] border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
