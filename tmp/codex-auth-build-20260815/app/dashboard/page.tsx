import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../lib/supabase/server";
import { onboardingStepFor, profileNameFor } from "../../lib/auth/onboarding";
import { signOut } from "./actions";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  if (onboardingStepFor(user, profile?.full_name) !== "complete") redirect("/register?resume=1");
  const fullName = profileNameFor(user, profile?.full_name) || "Funda friend";
  const firstName = fullName.split(/\s+/)[0];

  return <main className={styles.page}>
    <header><Link href="/" className={styles.brand}>funda.</Link><form action={signOut}><button>Log out</button></form></header>
    <section className={styles.hero}><span>Dashboard</span><h1>Hey, {firstName}.</h1><p>Your everyday payments are about to get much less dramatic.</p></section>
    <section className={styles.balance}><div><span>Funda balance</span><strong>₦0.00</strong></div><button>Fund wallet</button></section>
    <section className={styles.grid}>
      <article><span>01</span><h2>Buy data</h2><p>Good bundles. No long story.</p></article>
      <article><span>02</span><h2>Buy airtime</h2><p>Top up and keep moving.</p></article>
      <article><span>03</span><h2>Pay electricity</h2><p>Lights on, stress elsewhere.</p></article>
    </section>
    <section className={styles.empty}><span>Recent activity</span><p>Quiet in here. Your first transaction will show up when it happens.</p></section>
  </main>;
}
