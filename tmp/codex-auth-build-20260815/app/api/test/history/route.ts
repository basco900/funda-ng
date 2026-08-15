import { testOrders } from "@/lib/test-engine/journal";

export async function GET() {
  const orders = [...testOrders.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20)
    .map(({ result, ...order }) => ({ ...order, result: result && { ...result, raw: undefined } }));
  return Response.json({ orders });
}
