import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  const checkoutId = new URL(request.url).searchParams.get("checkout_id");
  if (!checkoutId?.startsWith("chk_")) return Response.json({ error: "Invalid checkout ID." }, { status: 400 });

  const { data, error } = await supabase
    .from("wallet_funding_transactions")
    .select("status, amount, currency, credited_at")
    .eq("user_id", user.id)
    .eq("checkout_id", checkoutId)
    .maybeSingle();
  if (error || !data) return Response.json({ error: "Funding transaction not found." }, { status: 404 });

  const { data: wallet } = await supabase.from("wallets").select("available_balance").eq("user_id", user.id).maybeSingle();
  return Response.json({
    status: data.status,
    amount: data.amount,
    currency: data.currency,
    creditedAt: data.credited_at,
    balance: wallet?.available_balance ?? "0.00",
  });
}
