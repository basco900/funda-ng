function normalizeUrl(value?: string) {
  return (value ?? "").trim().replace(/\/+$/, "");
}

function normalizeKey(value?: string) {
  return (value ?? "").trim();
}

export const supabaseUrl = normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
export const supabasePublishableKey = normalizeKey(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

let runtimeSupabaseUrl = "";
let runtimeSupabasePublishableKey = "";

/** Hydrates public Supabase credentials provided by the server at runtime when not baked in at build time. */
export function hydrateSupabaseConfig(url?: string, publishableKey?: string) {
  const nextUrl = normalizeUrl(url);
  const nextKey = normalizeKey(publishableKey);
  if (nextUrl) runtimeSupabaseUrl = nextUrl;
  if (nextKey) runtimeSupabasePublishableKey = nextKey;
}

export function getSupabaseConfig() {
  if (typeof window === "undefined") {
    return {
      url: normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) || supabaseUrl,
      publishableKey: normalizeKey(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) || supabasePublishableKey,
    };
  }
  return {
    url: supabaseUrl || runtimeSupabaseUrl,
    publishableKey: supabasePublishableKey || runtimeSupabasePublishableKey,
  };
}

export function isSupabaseConfigured() {
  const { url, publishableKey } = getSupabaseConfig();
  return Boolean(url && publishableKey);
}
