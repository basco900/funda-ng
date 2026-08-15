import { testOrders } from "@/lib/test-engine/journal";
import { vendors } from "@/lib/test-engine/vendors";
import { refundWallet } from "@/lib/test-engine/wallet";

export async function POST(request: Request) {
  const configuredSecret = process.env.PAIRGATE_WEBHOOK_SECRET;
  const url = new URL(request.url);
  if (!configuredSecret || url.searchParams.get("token") !== configuredSecret) {
    return Response.json({ response: "unauthorized" }, { status: 401 });
  }
  const payload = await request.json().catch(() => null);
  const reference = String(payload?.reference_code ?? "");
  const order = [...testOrders.values()].find((item) => item.vendor === "pairgate" &&
    (item.result?.providerReference === reference || item.result?.reference === reference));
  if (!order || !reference) return Response.json({ response: "accepted" });

  // Pairgate does not document a signed webhook header. Requery its authenticated API
  // and use that response, never the untrusted callback body, as the final state.
  const result = await vendors.pairgate.requery(reference);
  order.result = result;
  order.status = result.status === "successful" ? "complete" : result.status === "failed" ? "failed" : "processing";
  if (result.status === "failed") refundWallet(order.reference, order.amount);
  return Response.json({ response: "success" });
}
