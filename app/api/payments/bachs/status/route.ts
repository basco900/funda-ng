import { reconcileBachsCheckout } from "@/lib/payments/bachs";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });

  const url = new URL(request.url);
  const checkoutId = url.searchParams.get("checkout_id");
  if (!checkoutId?.startsWith("chk_")) {
    return Response.json({ error: "Invalid checkout ID." }, { status: 400 });
  }

  const load = () =>
    supabase
      .from("wallet_funding_transactions")
      .select("status, amount, currency, credited_at, created_at")
      .eq("user_id", user.id)
      .eq("checkout_id", checkoutId)
      .maybeSingle();

  let { data, error } = await load();
  if (error || !data) {
    return Response.json({ error: "Funding transaction not found." }, { status: 404 });
  }

  const reconcileParam = url.searchParams.get("reconcile") === "true";
  const ageMs = Date.now() - Date.parse(data.created_at);

  // If status is still pending, check Bachs directly if requested or after 5 seconds
  if (data.status === "pending" && (reconcileParam || ageMs > 5_000)) {
    const outcome = await reconcileBachsCheckout(checkoutId).catch((err) => {
      console.warn("Checkout status reconciliation check:", err);
      return null;
    });
    if (outcome && outcome !== "pending") {
      ({ data, error } = await load());
    }
    if (error || !data) {
      return Response.json({ error: "Funding transaction not found." }, { status: 404 });
    }
  }

  const { data: wallet } = await supabase
    .from("wallets")
    .select("available_balance")
    .eq("user_id", user.id)
    .maybeSingle();

  const gross = Number(data.amount || 0);
  const fee = gross > 10 ? 10 : 0;
  const netCredited = Math.max(0, gross - fee);

  return Response.json(
    {
      status: data.status,
      amount: netCredited,
      grossAmount: gross,
      fee,
      currency: data.currency,
      creditedAt: data.credited_at,
      balance: wallet?.available_balance ?? "0.00",
      credited: data.status === "succeeded",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
