import { redirect } from "next/navigation";
import { getAdminSession } from "../../../lib/admin/auth";
import AdminLoginForm from "./login-form";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin access · Funda",
  description: "Secure access to the Funda operations control centre.",
};

export default async function AdminLoginPage() {
  const admin = await getAdminSession();
  if (admin) redirect("/admin/dashboard");

  return (
    <main className={styles.loginPage}>
      <section className={styles.loginStory} aria-label="Funda Admin introduction">
        <div className={styles.loginBrand}>funda<span>.</span></div>
        <div className={styles.loginStoryCopy}>
          <span className={styles.loginKicker}>Operations, without the noise.</span>
          <h1>The room where Funda stays sharp.</h1>
          <p>
            Customers, money, providers and platform health—one calm view of everything that matters.
          </p>
        </div>
        <div className={styles.loginSignalGrid} aria-hidden="true">
          <div><span>Success rate</span><strong>Live</strong></div>
          <div><span>Provider health</span><strong>Watched</strong></div>
          <div><span>Audit trail</span><strong>Always on</strong></div>
        </div>
      </section>

      <section className={styles.loginPanel}>
        <div className={styles.loginPanelInner}>
          <div className={styles.secureMark} aria-hidden="true">⌁</div>
          <span className={styles.loginEyebrow}>Restricted access</span>
          <h2>Welcome to Admin.</h2>
          <p className={styles.loginIntro}>Use the Funda account approved for administrative access.</p>
          <AdminLoginForm />
          <div className={styles.loginSecurityNote}>
            <span aria-hidden="true">●</span>
            Protected by server-side access checks and an immutable audit trail.
          </div>
        </div>
      </section>
    </main>
  );
}
