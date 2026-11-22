import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  const { url, publishableKey } = getSupabaseConfig();
  if (!url || !publishableKey) {
    throw new Error("Funda authentication is not configured yet.");
  }

  browserClient ??= createBrowserClient(url, publishableKey);
  return browserClient;
}
