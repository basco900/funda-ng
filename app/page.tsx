import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "../lib/supabase/config";
import { createClient } from "../lib/supabase/server";
import FundaExperience from "./onboarding/funda-experience";
import { stories } from "./onboarding/stories";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Life, funded",
  description: "Buy data, airtime and everyday essentials simply with Funda.",
};

export default async function HomePage() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      redirect("/dashboard");
    }
  }

  return <FundaExperience stories={stories} />;
}
