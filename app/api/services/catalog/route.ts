import { listPurchaseProducts } from "@/lib/services/purchases";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  const url = new URL(request.url);
  const serviceType = url.searchParams.get("service") ?? undefined;
  const network = url.searchParams.get("network") ?? undefined;
  if (serviceType && !["data", "airtime"].includes(serviceType)) return Response.json({ error: "That service is not ready yet." }, { status: 400 });
  if (network && !["mtn", "airtel", "glo", "9mobile"].includes(network)) return Response.json({ error: "Choose a valid network." }, { status: 400 });
  try {
    const products = await listPurchaseProducts(user.id, serviceType, network);
    return Response.json({ products }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Products are unavailable." }, { status: 503 });
  }
}
