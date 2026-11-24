import { createAdminClient } from "../../../../../../lib/supabase/admin";
import { allow, clientIp, liveRefreshBudgetLeft } from "../../../../../../lib/coupons/limits";
import { couponProvidersReady } from "../../../../../../lib/coupons/providers";
import { refreshBrand } from "../../../../../../lib/coupons/refresh";

export const maxDuration = 60;

/** A live look for one brand: only when its data is old, and within the daily budget. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!couponProvidersReady()) return Response.json({ error: "Live search is not available right now." }, { status: 503 });
  if (!allow(`coupon-live:${clientIp(request)}`, 5, 3_600_000)) return Response.json({ error: "Try again in a little while." }, { status: 429 });
  const client = createAdminClient();
  const { data: brand } = await client.from("coupon_brands").select("id,last_refreshed_at").eq("slug", slug).eq("status", "active").maybeSingle();
  if (!brand) return Response.json({ error: "Unknown brand." }, { status: 404 });
  if (brand.last_refreshed_at && Date.now() - Date.parse(brand.last_refreshed_at) < 12 * 3_600_000) return Response.json({ ok: true, fresh: true });
  if (!allow(`coupon-live-brand:${slug}`, 1, 12 * 3_600_000)) return Response.json({ ok: true, fresh: true });
  if ((await liveRefreshBudgetLeft()) <= 0) return Response.json({ error: "Live search has reached today's limit." }, { status: 429 });
  try {
    const result = await refreshBrand(brand.id, "live");
    return Response.json({ ok: true, found: result.found });
  } catch {
    return Response.json({ error: "Couldn't search right now." }, { status: 502 });
  }
}
