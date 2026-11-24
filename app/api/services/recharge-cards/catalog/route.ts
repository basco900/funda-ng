import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pinVaultConfigured } from "@/lib/security/pin-vault";
import { getVendor } from "@/lib/test-engine/vendors";

export const runtime = "nodejs";

export async function GET() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  const headers = { "Cache-Control": "private, no-store" };
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401, headers });
  try {
    if (!pinVaultConfigured() || !getVendor("maskawasub").isConfigured()) return Response.json({ offers: [] }, { headers });
    const { data, error } = await createAdminClient().from("recharge_card_catalogue").select("network,denomination,max_quantity,provider:provider_registry(slug,status,environment)").eq("is_active", true).limit(64);
    if (error) throw new Error("The recharge-card catalogue is unavailable.");
    const offers = (data ?? []).flatMap((row) => {
      const provider = Array.isArray(row.provider) ? row.provider[0] : row.provider;
      return provider?.slug === "maskawasub" && ["operational", "degraded"].includes(provider.status) && provider.environment === "live" ? [{ network: row.network, denomination: Number(row.denomination), maxQuantity: Number(row.max_quantity) }] : [];
    });
    return Response.json({ offers }, { headers });
  } catch {
    return Response.json({ error: "The recharge-card catalogue is unavailable.", offers: [] }, { status: 503, headers });
  }
}
