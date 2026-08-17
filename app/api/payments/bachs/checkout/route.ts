import { randomUUID } from "node:crypto";
import { createBachsCheckout } from "@/lib/payments/bachs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
    if (!user.email) return Response.json({ error: "Add a verified email address before funding your wallet." }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 1_000 || amount > 500_000 || Math.round(amount * 100) !== amount * 100) {
      return Response.json({ error: "Funding amount must be between ₦1,000 and ₦500,000." }, { status: 400 });
    }

    const amountText = amount.toFixed(2);
    const internalId = randomUUID();
    const reference = `funda_wallet_${internalId}`;
    const idempotencyKey = `bachs_checkout_${internalId}`;
    const appUrl = process.env.APP_URL?.trim() || new URL(request.url).origin;
    if (process.env.NODE_ENV === "production" && !appUrl.startsWith("https://")) {
      throw new Error("APP_URL must be a public HTTPS URL in production.");
    }
    const admin = createAdminClient();

    const { error: insertError } = await admin.from("wallet_funding_transactions").insert({
      id: internalId,
      user_id: user.id,
      merchant_reference: reference,
      idempotency_key: idempotencyKey,
      amount: amountText,
      currency: "NGN",
      status: "initializing",
    });
    if (insertError) throw new Error("Wallet payment tables are not ready. Apply the Bachs migration first.");

    try {
      const checkout = await createBachsCheckout({
        amount: amountText,
        email: user.email,
        name: String(user.user_metadata?.full_name || "Funda customer"),
        phone: user.phone,
        reference,
        idempotencyKey,
        successUrl: `${appUrl}/dashboard?funding=return`,
        cancelUrl: `${appUrl}/dashboard?funding=cancelled`,
        userId: user.id,
      });

      const { error: updateError } = await admin.from("wallet_funding_transactions").update({
        checkout_id: checkout.checkout_id,
        checkout_url: checkout.checkout_url,
        status: "pending",
        provider_payload: checkout,
      }).eq("id", internalId).eq("status", "initializing");
      if (updateError) throw new Error("Could not persist the Bachs checkout.");
      return Response.json({ checkoutUrl: checkout.checkout_url, checkoutId: checkout.checkout_id }, { status: 201 });
    } catch (error) {
      await admin.from("wallet_funding_transactions").update({
        status: "failed",
        failure_reason: error instanceof Error ? error.message.slice(0, 500) : "Checkout initialization failed",
      }).eq("id", internalId);
      throw error;
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to start wallet funding." }, { status: 500 });
  }
}
