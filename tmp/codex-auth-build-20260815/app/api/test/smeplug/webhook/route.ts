import { testOrders } from "@/lib/test-engine/journal";
import { refundWallet } from "@/lib/test-engine/wallet";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const configuredSecret = process.env.SMEPLUG_WEBHOOK_SECRET;
  if (process.env.TRANSACTION_MODE === "live" && !configuredSecret) {
    return Response.json({ ok: false, error: "webhook secret not configured" }, { status: 503 });
  }
  if (configuredSecret && url.searchParams.get("token") !== configuredSecret) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const payload = await request.json().catch(() => null);
  const transaction = payload?.transaction;
  if (!transaction?.customer_reference) return Response.json({ ok: true });
  const order = testOrders.get(String(transaction.customer_reference));
  if (order) {
    const remoteStatus = String(transaction.status || "").toLowerCase();
    const status = ["success", "successful", "delivered"].includes(remoteStatus) ? "successful" : ["failed", "reversed"].includes(remoteStatus) ? "failed" : "pending";
    order.result = {
      status,
      reference: order.reference,
      providerReference: String(transaction.reference || ""),
      message: transaction.response || transaction.memo || `SMEPlug status: ${remoteStatus}`,
      raw: payload,
    };
    order.status = status === "successful" ? "complete" : status === "failed" ? "failed" : "processing";
    if (status === "failed") refundWallet(order.reference, order.amount);
  }
  return Response.json({ ok: true });
}
