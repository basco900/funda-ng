import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { onboardingStepFor } from "./lib/auth/onboarding";
import { supabasePublishableKey, supabaseUrl } from "./lib/supabase/config";

export async function proxy(request: NextRequest) {
  if (!supabaseUrl || !supabasePublishableKey) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const isAccountPage = ["/login", "/register"].includes(request.nextUrl.pathname);

  if (isDashboard && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && onboardingStepFor(user) !== "complete") {
    if (isDashboard || request.nextUrl.pathname === "/login") {
      return NextResponse.redirect(new URL("/register?resume=1", request.url));
    }
    return response;
  }

  if (user && isAccountPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register", "/auth/:path*"],
};
