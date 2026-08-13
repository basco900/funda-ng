import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "./config";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Funda authentication is not configured yet.");
  }

  browserClient ??= createBrowserClient(supabaseUrl, supabasePublishableKey);
  return browserClient;
}

