import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

export function isSupabaseAdminConfigured() {
  const { url } = getSupabaseConfig();
  return Boolean(url && process.env.SUPABASE_SECRET_KEY?.trim());
}

export function createAdminClient() {
  const { url } = getSupabaseConfig();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret) throw new Error("Supabase server credentials are not configured.");
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
