import { testOrders } from "@/lib/test-engine/journal";
import { getVendor } from "@/lib/test-engine/vendors";
import { safeError } from "@/lib/test-engine/utils";
import { refundWallet } from "@/lib/test-engine/wallet";

export async function GET(_request: Request, context: RouteContext<"/api/test/status/[reference]">) {
  const { reference } = await context.params;
  const order = testOrders.get(reference);
  if (!order) return Response.json({ error: "Order was not found in the test journal." }, { status: 404 });
  if (order.result?.status === "pending") {
    try {
      const wasFailed = order.status === "failed";
      order.result = await getVendor(order.vendor).requery(order.result.reference);
      order.status = order.result.status === "successful" ? "complete" : order.result.status === "failed" ? "failed" : "processing";
      if (!wasFailed && order.status === "failed") refundWallet(order.reference, order.amount);
    } catch (error) {
      return Response.json({ order, warning: safeError(error) });
    }
  }
  return Response.json({ order });
}
