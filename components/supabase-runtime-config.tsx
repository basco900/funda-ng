"use client";

import { useEffect } from "react";
import { hydrateSupabaseConfig } from "../lib/supabase/config";

export default function SupabaseRuntimeConfig({
  url,
  publishableKey,
}: {
  url: string;
  publishableKey: string;
}) {
  hydrateSupabaseConfig(url, publishableKey);

  useEffect(() => {
    hydrateSupabaseConfig(url, publishableKey);
  }, [url, publishableKey]);

  return null;
}
