import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SupabaseRuntimeConfig from "../components/supabase-runtime-config";
import { getSupabaseConfig, isSupabaseConfigured } from "../lib/supabase/config";
import { createClient } from "../lib/supabase/server";
import FundaExperience from "./onboarding/funda-experience";
import { stories } from "./onboarding/stories";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Life, funded",
  description: "Buy data, airtime and everyday essentials simply with Funda.",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const code = typeof params.code === "string" ? params.code : null;
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : null;
  const type = typeof params.type === "string" ? params.type : null;

  if (code) {
    const query = new URLSearchParams({ code });
    if (type) query.set("type", type);
    redirect(`/auth/callback?${query.toString()}`);
  }
  if (tokenHash && type) {
    const query = new URLSearchParams({ token_hash: tokenHash, type });
    redirect(`/auth/confirm?${query.toString()}`);
  }

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
