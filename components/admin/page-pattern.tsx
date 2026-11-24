import type { ReactNode } from "react";
import { PageHeader, StatBand, type Stat } from "./kit";

export type AdminPageStat = {
  label: string;
  value: ReactNode;
  /** Kept for callers; the band shows figures without captions. */
  note?: ReactNode;
  icon?: string;
  tone?: "slate" | "emerald" | "amber" | "primary" | "rose" | "default" | "success" | "warning";
  ring?: number;
};

const TONE: Record<NonNullable<AdminPageStat["tone"]>, Stat["tone"]> = {
  slate: "neutral",
  default: "neutral",
  emerald: "emerald",
  success: "emerald",
  amber: "amber",
  warning: "amber",
  primary: "primary",
  rose: "rose",
};

/** Page title row, then the page's numbers as one even band. */
export function AdminPageHeader({ title, actions, stats }: { title: ReactNode; actions?: ReactNode; stats?: AdminPageStat[] }) {
  return (
    <>
      <PageHeader title={title} actions={actions} />
      {stats?.length ? <StatBand stats={stats.map((stat) => ({ label: stat.label, value: stat.value, icon: stat.icon ?? "grid", tone: TONE[stat.tone ?? "slate"], ring: stat.ring }))} /> : null}
    </>
  );
}
