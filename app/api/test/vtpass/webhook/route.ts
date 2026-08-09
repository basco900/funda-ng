import { testOrders } from "@/lib/test-engine/journal";
import { refundWallet } from "@/lib/test-engine/wallet";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const configuredSecret = process.env.VTPASS_WEBHOOK_SECRET;
  if (process.env.TRANSACTION_MODE === "live" && !configuredSecret) {
    return Response.json({ response: "webhook secret not configured" }, { status: 503 });
  }
  if (configuredSecret && url.searchParams.get("token") !== configuredSecret) {
    return Response.json({ response: "unauthorized" }, { status: 401 });
  }
  const payload = await request.json().catch(() => null);
  if (payload?.type !== "transaction-update" || !payload.data?.requestId) {
    return Response.json({ response: "success" });
  }
  const order = [...testOrders.values()].find((item) => item.result?.reference === payload.data.requestId);
  if (order) {
    const providerStatus = String(payload.data?.content?.transactions?.status || "").toLowerCase();
    const status = providerStatus === "delivered" ? "successful" : ["failed", "reversed"].includes(providerStatus) ? "failed" : "pending";
    order.result = {
      status,
      reference: payload.data.requestId,
      providerReference: payload.data?.content?.transactions?.transactionId,
      message: payload.data.response_description || `VTpass status: ${providerStatus}`,
      raw: payload,
    };
    order.status = status === "successful" ? "complete" : status === "failed" ? "failed" : "processing";
    if (status === "failed") refundWallet(order.reference, order.amount);
  }
  return Response.json({ response: "success" });
}
