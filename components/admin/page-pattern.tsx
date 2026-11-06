import type { ReactNode } from "react";
import AdminIcon from "../../app/admin/(console)/admin-icon";
import styles from "../../app/admin/admin.module.css";

export type AdminPageStat = {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon?: string;
  tone?: "slate" | "emerald" | "amber" | "primary" | "default" | "success" | "warning";
};

const TONE_ALIAS: Record<string, string> = { default: "slate", success: "emerald", warning: "amber" };

/** Page title row (with actions) followed by a white stats card, as in the reference admin. */
export function AdminPageHeader({
  title,
  actions,
  stats,
}: {
  title: ReactNode;
  actions?: ReactNode;
  stats?: AdminPageStat[];
}) {
  return (
    <>
      <header className={styles.pageHeading}>
        <div>
          <h1>{title}</h1>
        </div>
        {actions ? <div className={styles.pageHeadingActions}>{actions}</div> : null}
      </header>

      {stats && stats.length > 0 ? (
        <section className={styles.workspaceMetrics} aria-label="Page statistics">
          {stats.map((stat, index) => (
            <article key={`${stat.label}-${index}`} data-has-icon={stat.icon ? "true" : undefined}>
              {stat.icon ? (
                <i className={styles.metricIcon} data-tone={TONE_ALIAS[stat.tone ?? "slate"] ?? stat.tone ?? "slate"}>
                  <AdminIcon name={stat.icon} />
                </i>
              ) : null}
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
              {stat.note ? <small>{stat.note}</small> : null}
            </article>
          ))}
        </section>
      ) : null}
    </>
  );
}
