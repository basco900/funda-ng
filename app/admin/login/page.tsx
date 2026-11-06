import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "../../../lib/admin/auth";
import AdminLoginForm from "./login-form";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin login · Funda",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  const admin = await getAdminSession();
  if (admin) redirect("/admin/dashboard");

  return (
    <main className={styles.loginPage}>
      <div className={styles.authFrame}>
        <aside className={styles.authBrandPanel} aria-label="Funda administration">
          <Link className={styles.authWordmark} href="/" aria-label="Funda home">
            funda<span>.</span>
          </Link>
          <div className={styles.authBrandMessage}>
            <h2>Keep every payment moving.</h2>
            <p>Customers, money and providers in one focused place.</p>
          </div>
          <div className={styles.authArt} aria-hidden="true">
            <span className={`${styles.authOrbit} ${styles.authOrbitOne}`} />
            <span className={`${styles.authOrbit} ${styles.authOrbitTwo}`} />
          </div>
        </aside>

        <section className={styles.authFormPanel} aria-label="Admin login">
          <div className={styles.authFormInner}>
            <div className={styles.loginHeading}>
              <h1>Admin login</h1>
              <p>Continue to your Funda workspace.</p>
            </div>
            <AdminLoginForm />
          </div>
        </section>
      </div>
    </main>
  );
}
