import { redirect } from "next/navigation";
import { onboardingStepFor, profileNameFor } from "../../lib/auth/onboarding";
import { createClient } from "../../lib/supabase/server";
import DashboardClient from "./dashboard-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard · Funda",
  description: "Your Funda wallet, everyday services, and recent activity in one pro iOS space.",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: profile },
    { data: settings },
    { data: wallet },
    { data: transactionsData },
    { data: notificationsData },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, display_name, date_of_birth, country_code, state, city, created_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("user_settings")
      .select("email_notifications, sms_notifications, push_notifications, marketing_notifications, transaction_alerts, security_alerts, preferred_language, timezone")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("wallets").select("available_balance").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("service_transactions")
      .select("id, internal_reference, service_type, destination, amount, cashback_amount, status, metadata, created_at, provider_reference")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("user_notifications")
      .select("id, title, body, kind, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  if (onboardingStepFor(user, profile?.full_name) !== "complete") {
    redirect("/register?resume=1");
  }

  const initialTransactions = (transactionsData || []).map((tx) => {
    const d = new Date(tx.created_at);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const isYesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
    const dateStr = isToday ? "Today" : isYesterday ? "Yesterday" : d.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
    const timeStr = new Date(tx.created_at).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit", hour12: true });

    return {
      id: tx.id,
      title: (tx.metadata as { productName?: string } | null)?.productName || `${tx.service_type?.toUpperCase()} Purchase`,
      category: (tx.service_type || "data") as "data" | "electricity" | "airtime" | "tv" | "funding" | "internet",
      type: "debit" as const,
      amount: Number(tx.amount || 0),
      date: dateStr,
      time: timeStr,
      status: tx.status === "successful" ? "completed" as const : tx.status === "failed" ? "failed" as const : "processing" as const,
      meta: tx.destination || "",
      reference: tx.internal_reference,
      cashback: tx.cashback_amount && tx.cashback_amount > 0 ? `+₦${tx.cashback_amount} cashback` : undefined,
    };
  });

  const fullName = profileNameFor(user, profile?.full_name) || "Funda friend";
  const firstName = fullName.split(/\s+/)[0];
  const initials = fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <DashboardClient
      user={{
        id: user.id,
        email: user.email,
        phone: user.phone,
        fullName,
        displayName: profile?.display_name,
        firstName,
        initials,
        dateOfBirth: profile?.date_of_birth,
        countryCode: profile?.country_code || "NG",
        state: profile?.state,
        city: profile?.city,
        createdAt: profile?.created_at || user.created_at,
        lastSignInAt: user.last_sign_in_at,
        emailConfirmed: Boolean(user.email_confirmed_at),
        phoneConfirmed: Boolean(user.phone_confirmed_at),
      }}
      settings={{
        emailNotifications: settings?.email_notifications ?? true,
        smsNotifications: settings?.sms_notifications ?? true,
        pushNotifications: settings?.push_notifications ?? true,
        marketingNotifications: settings?.marketing_notifications ?? false,
        transactionAlerts: settings?.transaction_alerts ?? true,
        securityAlerts: settings?.security_alerts ?? true,
        preferredLanguage: "en",
        timezone: settings?.timezone || "Africa/Lagos",
      }}
      initialWalletBalance={Number(wallet?.available_balance ?? 0)}
      initialTransactions={initialTransactions}
      initialNotifications={notificationsData ?? []}
    />
  );
}
