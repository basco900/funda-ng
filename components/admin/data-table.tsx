import Link from "next/link";
import type { ReactNode } from "react";
import AdminIcon from "@/app/admin/(console)/admin-icon";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./kit";

/** Jobly's list table: quiet 11.5px headers, 12.5px cells, a bold first column, hairline rows. */

export type DataColumn = { key: string; label: string; align?: "right"; kind?: "status" | "code" | "text" };
export type DataRow = { id: string; href?: string; cells: Record<string, ReactNode> };

const STATUS_KEYS = new Set(["status", "risk", "severity", "priority", "outcome", "account", "wallet"]);
const CODE_KEYS = new Set(["reference", "request", "code", "key", "slug", "id", "entityId", "event"]);

export function columnKind(column: DataColumn) {
  return column.kind ?? (STATUS_KEYS.has(column.key) ? "status" : CODE_KEYS.has(column.key) ? "code" : "text");
}

export function DataTable({ columns, rows, empty, minWidth = 760 }: { columns: DataColumn[]; rows: DataRow[]; empty: ReactNode; minWidth?: number }) {
  const linked = rows.some((row) => row.href);
  return (
    <div className="overflow-x-auto rounded-[8px] border border-a-line bg-a-surface">
      <table className="w-full border-collapse" style={{ minWidth }}>
        <thead className="border-b border-a-line bg-a-head">
          <tr>
            {columns.map((column, index) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "px-3 py-3 text-left text-[12.5px] font-semibold whitespace-nowrap text-zinc-600",
                  index === 0 && "pl-5",
                  index === columns.length - 1 && !linked && "pr-5",
                  column.align === "right" && "text-right",
                )}
              >
                {column.label}
              </th>
            ))}
            {linked ? <th scope="col" className="w-12 pr-5" aria-label="Open" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (linked ? 1 : 0)} className="p-4">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={row.id} className={cn("a-in group border-b border-a-line transition-colors last:border-b-0 hover:bg-zinc-50/70", row.href && "relative cursor-pointer")} style={{ animationDelay: `${Math.min(rowIndex, 12) * 18}ms` }}>
                {columns.map((column, index) => {
                  const value = row.cells[column.key];
                  const kind = columnKind(column);
                  const text = typeof value === "string" ? value : null;
                  const content =
                    index === 0 ? (
                      <span className="block max-w-[320px] truncate text-[13.5px] font-semibold text-zinc-900 group-hover:text-primary">{value ?? "—"}</span>
                    ) : kind === "status" && text && text !== "—" ? (
                      <StatusBadge value={text} />
                    ) : kind === "code" && text && text !== "—" ? (
                      <code className="rounded-[5px] bg-zinc-100 px-1.5 py-0.5 text-[11.5px] text-zinc-600">{text}</code>
                    ) : (
                      value ?? "—"
                    );
                  return (
                    <td
                      key={column.key}
                      className={cn(
                        "px-3 py-3 text-[12.5px] whitespace-nowrap text-zinc-600 tabular-nums",
                        index === 0 && "pl-5",
                        index === columns.length - 1 && !linked && "pr-5",
                        column.align === "right" && "text-right font-medium text-zinc-800",
                        (value === "—" || value === null || value === undefined) && "text-zinc-300",
                      )}
                    >
                      {index === 0 && row.href ? (
                        <Link href={row.href} className="after:absolute after:inset-0">
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </td>
                  );
                })}
                {linked ? (
                  <td className="py-3 pr-5 text-right">
                    {row.href ? <AdminIcon name="arrowRight" className="ml-auto size-4 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" /> : null}
                  </td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
