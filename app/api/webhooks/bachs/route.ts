import { verifyBachsWebhook } from "@/lib/payments/bachs";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type BachsEvent = {
  id: string;
  type: string;
  created_at: string;
  organization_id: string;
  data: {
    checkout_id?: string;
    charge_id?: string;
    amount?: string;
    currency?: string;
    status?: string;
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyBachsWebhook(rawBody, request.headers.get("x-bachs-timestamp"), request.headers.get("x-bachs-signature"))) {
    return Response.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let event: BachsEvent;
  try {
    event = JSON.parse(rawBody) as BachsEvent;
  } catch {
    return Response.json({ error: "Invalid JSON payload." }, { status: 400 });
  }
  if (!event.id || !event.type || !event.data) return Response.json({ error: "Invalid event envelope." }, { status: 400 });

  const admin = createAdminClient();
  if (event.type === "collection.succeeded") {
    const { checkout_id, charge_id, amount, currency } = event.data;
    if (!checkout_id || !charge_id || !amount || !currency || !/^\d+(\.\d{1,2})?$/.test(amount)) {
      return Response.json({ error: "Invalid collection payload." }, { status: 400 });
    }
    const { error } = await admin.rpc("credit_bachs_wallet", {
      p_event_id: event.id,
      p_checkout_id: checkout_id,
      p_charge_id: charge_id,
      p_amount: amount,
      p_currency: currency,
      p_payload: event,
    });
    if (error) return Response.json({ error: "Payment could not be reconciled." }, { status: 409 });
    return Response.json({ received: true });
  }

  const statusMap: Record<string, "failed" | "underpaid" | "expired"> = {
    "collection.failed": "failed",
    "collection.underpaid": "underpaid",
    "checkout.expired": "expired",
  };
  const nextStatus = statusMap[event.type];
  if (nextStatus && event.data.checkout_id) {
    await admin.from("payment_webhook_events").insert({ event_id: event.id, event_type: event.type, payload: event });
    await admin.from("wallet_funding_transactions").update({
      status: nextStatus,
      failure_reason: event.type,
      provider_payload: event,
    }).eq("checkout_id", event.data.checkout_id).neq("status", "succeeded");
  }
  return Response.json({ received: true });
}
