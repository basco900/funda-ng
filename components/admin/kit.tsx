import Link from "next/link";
import type { ReactNode } from "react";
import AdminIcon from "@/app/admin/(console)/admin-icon";
import { cn } from "@/lib/utils";

/**
 * The admin console's building blocks, taken from Jobly Africa's member dashboard
 * (app/dashboard, components/applications, components/my-jobs) with the values it
 * renders: 8px cards and controls, 7px badges, hairline borders, no shadows.
 * Colours come from app/admin/admin-theme.css, so every piece works in both themes.
 */

export const button = {
  primary:
    "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-primary px-4 text-[13px] font-semibold text-white transition-colors hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4",
  secondary:
    "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-a-line bg-a-surface px-3.5 text-[13px] font-semibold text-zinc-700 transition-colors hover:border-primary/30 hover:text-primary active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4",
  ghost:
    "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] px-3 text-[13px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4",
  soft:
    "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[8px] bg-primary/[0.07] px-3 text-[12.5px] font-semibold text-primary transition-colors hover:bg-primary/[0.12] disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5",
} as const;

export const card = "rounded-[8px] border border-a-line bg-a-surface";

/** Title row: 24px/26px, tight tracking, actions below on mobile and on the right on sm+. */
export function PageHeader({ title, actions, size = "default" }: { title: ReactNode; actions?: ReactNode; size?: "default" | "hero" }) {
  return (
    <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end sm:gap-4">
      <h1
        className={cn(
          "font-semibold text-zinc-950",
          size === "hero" ? "text-[24px] tracking-[-0.04em] sm:text-[30px]" : "text-[24px] leading-none tracking-[-0.045em] sm:text-[26px]",
        )}
      >
        {title}
      </h1>
      {actions ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div> : null}
    </header>
  );
}

export type Stat = {
  label: string;
  value: ReactNode;
  icon?: string;
  tone?: "neutral" | "primary" | "emerald" | "amber" | "rose" | "accent";
  /** 0–100: draws a progress ring instead of the icon. */
  ring?: number;
  href?: string;
};

const STAT_TONES: Record<NonNullable<Stat["tone"]>, string> = {
  neutral: "bg-zinc-100 text-zinc-600",
  primary: "bg-a-primary-soft text-primary",
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  rose: "bg-rose-50 text-rose-700",
  accent: "bg-a-accent-soft text-a-accent-ink",
};

/**
 * The page's numbers in one band of equal columns split by hairlines (Jobly's Insights
 * rates band): a round tinted glyph or a ring, the figure, its label. Never separate boxes.
 */
export function StatBand({ stats }: { stats: Stat[] }) {
  if (!stats.length) return null;
  return (
    <section
      aria-label="Summary"
      className={cn(
        "a-in grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-a-line bg-[color:var(--a-border)]",
        stats.length > 2 && "lg:grid-cols-[repeat(var(--stat-count),minmax(0,1fr))]",
      )}
      style={{ ["--stat-count" as string]: stats.length }}
    >
      {stats.map((stat, index) => {
        const body = (
          <>
            {stat.ring !== undefined ? (
              <ProgressRing value={stat.ring} size={42} />
            ) : stat.icon ? (
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-full sm:size-11", STAT_TONES[stat.tone ?? "neutral"])}>
                <AdminIcon name={stat.icon} className="size-[17px] sm:size-[19px]" />
              </span>
            ) : null}
            <span className="min-w-0">
              <span className="block truncate text-[19px] leading-none font-semibold tracking-[-0.04em] text-zinc-950 tabular-nums sm:text-[22px]">{stat.value}</span>
              <span className="mt-1.5 block truncate text-[12px] font-medium text-zinc-500 sm:text-[12.5px]">{stat.label}</span>
            </span>
          </>
        );
        const cell = "flex min-w-0 items-center gap-2.5 bg-a-surface px-3.5 py-3.5 sm:gap-3.5 sm:px-6 sm:py-[18px]";
        const span = stats.length % 2 === 1 && index === stats.length - 1 ? "max-lg:col-span-2" : "";
        return stat.href ? (
          <Link key={`${stat.label}-${index}`} href={stat.href} className={cn(cell, span, "transition-colors hover:bg-zinc-50")}>
            {body}
          </Link>
        ) : (
          <div key={`${stat.label}-${index}`} className={cn(cell, span)}>
            {body}
          </div>
        );
      })}
    </section>
  );
}

/** A total and how it splits by state: the figure on top, the ribbon across the full width. */
export function DistributionBand({ value, label, segments }: { value: ReactNode; label: string; segments: RibbonSegment[] }) {
  return (
    <section aria-label="Summary" className={cn("a-in px-4 py-4 sm:px-6 sm:py-5", card)}>
      <p className="flex items-baseline gap-2">
        <span className="text-[20px] leading-none font-semibold tracking-[-0.04em] text-zinc-950 tabular-nums sm:text-[22px]">{value}</span>
        <span className="text-[12.5px] font-medium text-zinc-500">{label}</span>
      </p>
      {segments.length ? (
        <div className="mt-4">
          <Ribbon segments={segments} />
        </div>
      ) : null}
    </section>
  );
}

export type RibbonSegment = { key: string; label: string; count: number; href?: string; active?: boolean };

/** Proportion and count per state in one segmented bar (Jobly's pipeline ribbon). */
export function Ribbon({ segments }: { segments: RibbonSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-zinc-100">
        {segments.map((segment, index) =>
          segment.count ? (
            <span
              key={segment.key}
              className="a-grow h-full first:rounded-l-full last:rounded-r-full"
              style={{ width: `${(segment.count / total) * 100}%`, background: TONES[toneFor(segment.key)].bar, animationDelay: `${index * 60}ms` }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 sm:gap-x-6">
        {segments.map((segment) => {
          const body = (
            <>
              <span className={cn("size-2 translate-y-[-1px] self-center rounded-full", TONES[toneFor(segment.key)].dot)} />
              <span className="text-[17px] font-semibold tracking-[-0.03em] text-zinc-950 tabular-nums">{segment.count.toLocaleString("en-NG")}</span>
              <span className={cn("text-[12.5px] font-medium", segment.active ? "text-zinc-950 underline decoration-primary decoration-[1.5px] underline-offset-[5px]" : "text-zinc-500 group-hover:text-zinc-900")}>
                {segment.label}
              </span>
            </>
          );
          return segment.href ? (
            <Link key={segment.key} href={segment.href} scroll={false} className="group flex items-baseline gap-1.5">
              {body}
            </Link>
          ) : (
            <span key={segment.key} className="flex items-baseline gap-1.5">
              {body}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export type Tone = "emerald" | "amber" | "rose" | "sky" | "primary" | "violet" | "slate";

const TONE_WORDS: Record<Exclude<Tone, "slate">, string[]> = {
  emerald: ["succeeded", "successful", "success", "completed", "complete", "active", "paid", "credited", "approved", "resolved", "enabled", "live", "healthy", "operational", "online", "low", "delivered", "sent", "published", "verified", "matched"],
  amber: ["pending", "initiated", "initializing", "queued", "review", "held", "scheduled", "draft", "paused", "medium", "standby", "degraded", "open", "underpaid", "warning", "test mode"],
  primary: ["processing", "in review", "in progress", "investigating", "escalated", "running"],
  rose: ["failed", "failure", "error", "rejected", "declined", "blocked", "suspended", "disabled", "cancelled", "canceled", "expired", "offline", "down", "critical", "high", "closed", "mismatch"],
  sky: ["refunded", "reversed", "partially refunded", "info"],
  violet: ["archived"],
};

export const TONES: Record<Tone, { badge: string; dot: string; bar: string }> = {
  emerald: { badge: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500", bar: "#10B981" },
  amber: { badge: "bg-amber-50 text-amber-700", dot: "bg-amber-500", bar: "#F59E0B" },
  primary: { badge: "bg-primary/[0.08] text-primary", dot: "bg-primary", bar: "var(--a-primary)" },
  rose: { badge: "bg-rose-50 text-rose-700", dot: "bg-rose-500", bar: "#F43F5E" },
  sky: { badge: "bg-sky-50 text-sky-700", dot: "bg-sky-500", bar: "#0EA5E9" },
  violet: { badge: "bg-zinc-100 text-zinc-500", dot: "bg-zinc-300", bar: "#D4D4D8" },
  slate: { badge: "bg-zinc-100 text-zinc-600", dot: "bg-zinc-400", bar: "#A1A1AA" },
};

export function toneFor(value: string): Tone {
  const word = value.trim().toLowerCase().replaceAll("_", " ");
  for (const [tone, words] of Object.entries(TONE_WORDS)) if (words.includes(word)) return tone as Tone;
  return "slate";
}

/** Jobly's stage badge: 7px corners, a dot, the state's own tint. */
/** `value` picks the tint; `label` overrides the text when the state needs context. */
export function StatusBadge({ value, label, size = "md" }: { value: string; label?: string; size?: "sm" | "md" }) {
  const tone = TONES[toneFor(value)];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-[7px] font-semibold whitespace-nowrap capitalize", tone.badge, size === "sm" ? "h-5 px-1.5 text-[11.5px]" : "h-6 px-2 text-[12px]")}>
      <span className={cn("size-1.5 rounded-full", tone.dot)} />
      {label ?? (value.replaceAll("_", " ") || "—")}
    </span>
  );
}

/** Small count beside a title or tab. */
export function CountChip({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <span className={cn("rounded-[5px] px-1.5 text-[11px] leading-[18px] font-semibold tabular-nums", active ? "bg-primary/[0.09] text-primary" : "bg-zinc-100 text-zinc-500")}>{children}</span>
  );
}

/** Card title row: 17px title, optional count and a link on the right. */
export function SectionTitle({ title, count, action }: { title: ReactNode; count?: number; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="truncate text-[17px] font-semibold tracking-[-0.02em] text-zinc-900">{title}</h2>
        {count !== undefined ? <CountChip>{count.toLocaleString("en-NG")}</CountChip> : null}
      </div>
      {action}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-primary hover:underline">
      {children}
      <AdminIcon name="arrowRight" className="size-3.5" />
    </Link>
  );
}

export function EmptyNote({ icon, title, action }: { icon: string; title: string; action?: ReactNode }) {
  return (
    <div className="a-in flex flex-col items-center rounded-[8px] border border-dashed border-zinc-200 bg-a-surface/60 px-6 py-12 text-center">
      <span className="grid size-[84px] place-items-center rounded-full bg-primary/[0.04]">
        <span className="grid size-[60px] place-items-center rounded-full bg-primary/[0.08]">
          <span className="grid size-11 place-items-center rounded-full bg-primary text-white shadow-[0_8px_20px_-6px_color-mix(in_srgb,var(--a-primary)_45%,transparent)]">
            <AdminIcon name={icon} className="size-5" />
          </span>
        </span>
      </span>
      <p className="mt-4 text-[15px] font-semibold tracking-[-0.02em] text-zinc-900">{title}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Progress toward a target as a ring that fills in. */
export function ProgressRing({ value, target = 100, size = 52, children }: { value: number; target?: number; size?: number; children?: ReactNode }) {
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const share = Math.min(1, target ? value / target : 0);
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(share * 100)}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" className="text-primary/10" strokeWidth={stroke} />
        <circle
          className="a-ring text-primary"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ ["--a-ring-from" as string]: circumference, strokeDashoffset: circumference * (1 - share) }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center">{children}</span>
    </span>
  );
}

/** Hover tooltip above a chart mark. */
export function Tip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      role="tooltip"
      className={cn(
        "pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 rounded-[7px] bg-a-tooltip px-2.5 py-1.5 text-[11.5px] font-medium whitespace-nowrap text-a-surface opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
        className,
      )}
    >
      {children}
    </span>
  );
}

const NAIRA_FORMATTER = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });

/** Displays large hero NGN amounts with a smaller, lighter ₦ prefix and bolder, darker numerals. */
export function NairaAmount({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const sign = value < 0 ? "-" : "";
  const formatted = NAIRA_FORMATTER.format(Math.abs(value));
  return (
    <span data-font="sans" className={cn("inline-flex items-baseline gap-1 leading-none tabular-nums", className)}>
      {sign ? <span data-font="sans" className="text-[34px] font-semibold tracking-[-0.055em] text-zinc-950 sm:text-[50px]">{sign}</span> : null}
      <span data-font="sans" className="text-[18px] font-normal text-zinc-400 sm:text-[25px]" aria-hidden="true">₦</span>
      <span data-font="sans" className="text-[34px] font-semibold tracking-[-0.055em] text-zinc-950 sm:text-[50px]">
        <span className="sr-only">₦</span>
        {formatted}
      </span>
    </span>
  );
}
