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

  const [{ data: profile }, { data: settings }, { data: wallet }] = await Promise.all([
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
  ]);

  if (onboardingStepFor(user, profile?.full_name) !== "complete") {
    redirect("/register?resume=1");
  }

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
    />
  );
}
