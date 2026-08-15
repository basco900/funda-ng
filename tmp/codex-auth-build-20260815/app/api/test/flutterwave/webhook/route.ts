import { creditWallet } from "@/lib/test-engine/wallet";
import { verifyPayment, verifyWebhook } from "@/lib/test-engine/flutterwave";

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyWebhook(rawBody, request.headers.get("flutterwave-signature"))) {
    return new Response("Invalid signature", { status: 401 });
  }
  const event = JSON.parse(rawBody);
  if (event.type === "charge.completed" && ["successful", "succeeded"].includes(event.data?.status) && event.data?.id) {
    const payment = await verifyPayment(String(event.data.id)).catch(() => null);
    if (payment?.status === "successful" && payment.currency === "NGN" && payment.meta?.purpose === "wallet_funding") {
      const expected = Number(payment.meta.expected_amount);
      if (Number.isFinite(expected) && Number(payment.amount) >= expected) creditWallet(String(payment.tx_ref), expected);
    }
  }
  return new Response("OK");
}
