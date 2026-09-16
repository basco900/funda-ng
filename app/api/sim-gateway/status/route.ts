import { getGatewayHealth } from "@/lib/services/sim-gateway";

export const runtime = "nodejs";

export async function GET() {
  const health = getGatewayHealth();
  return Response.json(health, {
    headers: { "Cache-Control": "no-store" },
  });
}
