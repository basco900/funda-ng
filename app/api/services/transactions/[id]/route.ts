import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requeryProviderTransaction } from "@/lib/admin/providers";
import { rechargePurchaseSnapshot } from "@/lib/services/recharge-cards";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";

  const { data: initial, error } = await supabase
    .from("service_transactions")
    .select("id,internal_reference,service_type,destination,amount,cashback_amount,status,provider_reference,metadata,created_at,completed_at,product:service_products(name)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !initial) return Response.json({ error: "Transaction not found." }, { status: 404 });

  if (initial.metadata?.mode === "epin") {
    try {
      const purchase = await rechargePurchaseSnapshot(user.id, id);
      return Response.json({ purchase, balance: purchase.balance, transaction: {
        ...initial, status: purchase.status, amount: purchase.amount,
        metadata: { mode: "epin", productName: purchase.productName, network: purchase.network, quantity: purchase.quantity, unitAmount: purchase.unitAmount, faceValue: purchase.faceValue, discount: purchase.discount, deliveryStatus: purchase.deliveryStatus, pinCount: purchase.pinCount, pins: purchase.pins },
      } }, { headers: { "Cache-Control": "private, no-store" } });
    } catch {
      return Response.json({ error: "Your receipt is unavailable. Try again shortly." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  }

  if (refresh && ["initiated", "processing", "pending"].includes(initial.status)) {
    try {
      await requeryProviderTransaction(id);
    } catch {
      // Non-fatal: return current DB record cleanly if provider is temporarily unreachable
    }
  }

  const [{ data: updated }, { data: wallet }] = await Promise.all([
    supabase
      .from("service_transactions")
      .select("id,internal_reference,service_type,destination,amount,cashback_amount,status,provider_reference,metadata,created_at,completed_at,product:service_products(name)")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    createAdminClient().from("wallets").select("available_balance").eq("user_id", user.id).maybeSingle(),
  ]);

  return Response.json(
    {
      transaction: updated ?? initial,
      balance: wallet ? Number(wallet.available_balance) : undefined,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
