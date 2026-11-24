import { requireAdminPermission } from "../../../../lib/admin/auth";
import { couponProviders } from "../../../../lib/coupons/providers";
import { createAdminClient } from "../../../../lib/supabase/admin";
import BrandCouponsWorkspace, { type AdminBrandRow, type AdminOfferRow, type AdminRunRow } from "./brand-coupons-workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Brand coupons" };

export default async function BrandCouponsPage() {
  await requireAdminPermission("campaigns.manage");
  const client = createAdminClient();
  const [brands, offers, runs, misses] = await Promise.all([
    client.from("coupon_brands").select("id,slug,name,domain,category,tier,status,country_scope,aliases,promo_urls,last_refreshed_at,next_refresh_at,last_refresh_status,search_count").order("name").limit(1000),
    client.from("coupon_offers").select("id,brand_id,kind,code,title,conditions,discount_text,source_type,source_url,status,expires_at,last_seen_at,worked_count,failed_count,copy_count,created_at").order("created_at", { ascending: false }).limit(1000),
    client.from("coupon_refresh_runs").select("id,brand_id,trigger,status,provider,pages_checked,found,added,updated,retired,error,started_at,finished_at").order("started_at", { ascending: false }).limit(60),
    client.from("coupon_search_misses").select("query,search_count,last_searched_at").order("search_count", { ascending: false }).limit(60),
  ]);

  return (
    <BrandCouponsWorkspace
      connected={!brands.error}
      brands={(brands.data ?? []) as AdminBrandRow[]}
      offers={(offers.data ?? []) as AdminOfferRow[]}
      runs={(runs.data ?? []) as AdminRunRow[]}
      requests={misses.data ?? []}
      providers={couponProviders()}
    />
  );
}
