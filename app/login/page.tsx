import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SupabaseRuntimeConfig from "../../components/supabase-runtime-config";
import { getSupabaseConfig, isSupabaseConfigured } from "../../lib/supabase/config";
import { createClient } from "../../lib/supabase/server";
import FundaExperience from "../onboarding/funda-experience";
import { stories } from "../onboarding/stories";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in securely with your email, phone, password or a one-time code.",
};

export default async function LoginPage() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      redirect("/dashboard");
    }
  }

  const supabaseConfig = getSupabaseConfig();
  return (
    <>
      <SupabaseRuntimeConfig url={supabaseConfig.url} publishableKey={supabaseConfig.publishableKey} />
      <FundaExperience stories={stories} />
    </>
  );
}
