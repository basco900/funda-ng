import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { postAuthPathFor } from "../../../lib/auth/onboarding";
import { getRequestOrigin } from "../../../lib/http/origin";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = getRequestOrigin(request);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const requestedNext = url.searchParams.get("next");
  const fallbackNext = type === "recovery" ? "/auth/reset-password" : "/dashboard";
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : fallbackNext;

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const destination = next === "/dashboard" ? postAuthPathFor(data.user) : next;
      return NextResponse.redirect(new URL(destination, origin));
    }
  } else if (tokenHash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error && data.user) {
      const destination = next === "/dashboard" ? postAuthPathFor(data.user) : next;
      return NextResponse.redirect(new URL(destination, origin));
    }
  }

  return NextResponse.redirect(new URL("/login?auth_error=link", origin));
}
