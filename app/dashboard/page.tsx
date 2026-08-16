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

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

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
        firstName,
        initials,
      }}
    />
  );
}
