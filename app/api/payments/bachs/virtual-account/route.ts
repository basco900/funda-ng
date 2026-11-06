import {
  PaymentCustomerError,
  provisionOrSyncUserVirtualAccount,
} from "@/lib/payments/bachs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Provider and configuration details stay in server logs, never in the response.
function failure(error: unknown, fallback: string) {
  if (error instanceof PaymentCustomerError) {
    return Response.json(
      { error: error.message },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  console.error("Virtual account request failed", error instanceof Error ? error.message : error);
  return Response.json(
    { error: fallback },
    { status: 502, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }
    if (!user.email) {
      return Response.json(
        { error: "Add a verified email address to get a funding account number." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    const fullName =
      profile?.full_name ||
      String(user.user_metadata?.full_name || "Funda Customer");

    // Read path: talks to Bachs only while the customer has no account number yet (throttled).
    const virtualAccount = await provisionOrSyncUserVirtualAccount({
      userId: user.id,
      email: user.email,
      fullName,
    });

    const admin = createAdminClient();
    const [{ data: wallet }, { data: notifications }] = await Promise.all([
      supabase
        .from("wallets")
        .select("available_balance")
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("user_notifications")
        .select("id, title, body, kind, read_at, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(35),
    ]);

    return Response.json(
      {
        virtualAccount,
        balance: Number(wallet?.available_balance ?? 0),
        notifications: notifications ?? [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error, "Could not load your funding account right now.");
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      bvn?: string;
      firstName?: string;
      lastName?: string;
      forceRefresh?: boolean;
    };

    if (!user.email) {
      return Response.json(
        { error: "Add a verified email address to get a funding account number." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (body.bvn && !/^\d{11}$/.test(body.bvn.replace(/\D/g, ""))) {
      return Response.json(
        { error: "Enter a valid 11-digit BVN." },
        { status: 400 },
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, display_name")
      .eq("id", user.id)
      .maybeSingle();

    const fullName =
      profile?.full_name ||
      String(user.user_metadata?.full_name || "Funda Customer");

    const virtualAccount = await provisionOrSyncUserVirtualAccount({
      userId: user.id,
      email: user.email,
      fullName,
      bvn: body.bvn ?? null,
      firstName: body.firstName ?? null,
      lastName: body.lastName ?? null,
      forceRefresh: Boolean(body.forceRefresh || body.bvn),
    });

    const admin = createAdminClient();

    const [
      { data: wallet },
      { data: updatedProfile },
      { data: notifications },
    ] = await Promise.all([
      supabase
        .from("wallets")
        .select("available_balance")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("full_name, display_name")
        .eq("id", user.id)
        .maybeSingle(),
      admin
        .from("user_notifications")
        .select("id, title, body, kind, read_at, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(35),
    ]);

    return Response.json(
      {
        virtualAccount,
        balance: Number(wallet?.available_balance ?? 0),
        profile: updatedProfile ?? profile ?? null,
        notifications: notifications ?? [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error, "Could not set up your funding account right now. Please try again shortly.");
  }
}
