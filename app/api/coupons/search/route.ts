import { createAdminClient } from "../../../../lib/supabase/admin";
import { allow, clientIp } from "../../../../lib/coupons/limits";
import { searchBrands } from "../../../../lib/coupons/queries";

/** Brand typeahead. Unmatched searches are recorded so the directory grows toward demand. */
export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (query.length < 2) return Response.json({ brands: [] });
  if (!allow(`coupon-search:${clientIp(request)}`, 120, 60_000)) return Response.json({ error: "Slow down a little." }, { status: 429 });
  const brands = await searchBrands(query, 8);
  const record = new URL(request.url).searchParams.get("final") === "1";
  if (!brands.length && record && query.length >= 3) await createAdminClient().rpc("record_coupon_search_miss", { p_query: query });
  return Response.json(
    { brands: brands.map(({ slug, name, domain, category, offers, codes, best }) => ({ slug, name, domain, category, offers, codes, best })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
