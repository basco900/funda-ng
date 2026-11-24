import "server-only";

import { createAdminClient, isSupabaseAdminConfigured } from "../supabase/admin";
import { rankOffers, trustScore } from "./trust";
import type { CouponBrand, CouponOffer } from "./types";

/** Public reads for the coupon finder. Server-side only; the browser never queries tables. */

export type BrandSummary = Pick<CouponBrand, "id" | "slug" | "name" | "domain" | "aliases" | "category" | "country_scope" | "search_count" | "last_refreshed_at"> & { offers: number; codes: number; best: string | null };

const OFFER_FIELDS = "id,brand_id,kind,code,title,description,discount_text,min_spend,conditions,new_users_only,works_in_nigeria,source_url,source_type,status,expires_at,first_seen_at,last_seen_at,last_verified_at,worked_count,failed_count,copy_count";

let indexCache: { at: number; brands: BrandSummary[] } | null = null;

type PagedQuery<T> = { range(from: number, to: number): PromiseLike<{ data: T[] | null; error: unknown }> };

/** Reads past PostgREST's 1,000-row page limit, a page at a time. */
async function readAll<T>(build: () => PagedQuery<T>, max = 50_000) {
  const rows: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error || !data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

/** Every active brand with its live offer counts; cached for a minute. */
export async function loadBrandIndex(): Promise<BrandSummary[]> {
  if (indexCache && Date.now() - indexCache.at < 60_000) return indexCache.brands;
  if (!isSupabaseAdminConfigured()) return [];
  const client = createAdminClient();
  type BrandRow = { id: string; slug: string; name: string; domain: string; aliases: string[]; category: string; country_scope: string; search_count: number; last_refreshed_at: string | null };
  type OfferRow = Parameters<typeof trustScore>[0] & { brand_id: string; kind: string; discount_text: string | null; title: string };
  const [brands, offers] = await Promise.all([
    readAll<BrandRow>(() => client.from("coupon_brands").select("id,slug,name,domain,aliases,category,country_scope,search_count,last_refreshed_at").eq("status", "active").order("name")),
    readAll<OfferRow>(() => client.from("coupon_offers").select("brand_id,kind,discount_text,title,source_type,last_seen_at,last_verified_at,worked_count,failed_count,expires_at,status").eq("status", "active").order("id")),
  ]);
  const byBrand = new Map<string, OfferRow[]>();
  for (const offer of offers) {
    const list = byBrand.get(offer.brand_id) ?? [];
    list.push(offer);
    byBrand.set(offer.brand_id, list);
  }
  const summaries = brands.map((brand) => {
    const list = rankOffers(byBrand.get(brand.id) ?? []);
    return {
      ...brand,
      country_scope: brand.country_scope as "ng" | "global",
      offers: list.length,
      codes: list.filter((offer) => offer.kind === "code").length,
      best: list[0] ? list[0].discount_text || list[0].title : null,
    };
  });
  indexCache = { at: Date.now(), brands: summaries };
  return summaries;
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
}

function distance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length];
}

/** Typo-tolerant brand search over names, aliases and domains. */
export async function searchBrands(query: string, limit = 12) {
  const needle = normalize(query);
  if (needle.length < 2) return [];
  const brands = await loadBrandIndex();
  const scored = brands
    .map((brand) => {
      const names = [brand.name, brand.slug, brand.domain.split(".")[0], ...brand.aliases].map(normalize).filter(Boolean);
      let score = 0;
      for (const name of names) {
        if (name === needle) score = Math.max(score, 100);
        else if (name.startsWith(needle)) score = Math.max(score, 80 - Math.min(20, name.length - needle.length));
        else if (name.includes(needle)) score = Math.max(score, 55);
        else if (needle.length >= 4 && distance(needle, name.slice(0, needle.length + 1)) <= (needle.length > 6 ? 2 : 1)) score = Math.max(score, 40);
      }
      return { brand, score: score ? score + Math.min(10, brand.offers) + Math.min(5, Math.log10(brand.search_count + 1) * 2) : 0 };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((item) => item.brand);
}

export async function getBrandBySlug(slug: string) {
  if (!isSupabaseAdminConfigured()) return null;
  const client = createAdminClient();
  const { data: brand } = await client.from("coupon_brands").select("*").eq("slug", slug).eq("status", "active").maybeSingle();
  if (!brand) return null;
  const { data: offers } = await client.from("coupon_offers").select(OFFER_FIELDS).eq("brand_id", brand.id).in("status", ["active", "stale"]).limit(200);
  return { brand: brand as CouponBrand, offers: rankOffers((offers ?? []) as CouponOffer[]) };
}

export type RailOffer = CouponOffer & { brand: { slug: string; name: string; domain: string } };

async function offersWithBrands(rows: CouponOffer[]): Promise<RailOffer[]> {
  if (!rows.length) return [];
  const brands = new Map((await loadBrandIndex()).map((brand) => [brand.id, brand]));
  return rows
    .map((row) => {
      const brand = brands.get(row.brand_id);
      return brand ? { ...row, brand: { slug: brand.slug, name: brand.name, domain: brand.domain } } : null;
    })
    .filter((row): row is RailOffer => Boolean(row));
}

/** The rails beside search: hot, ending soon, recently confirmed, popular brands, Nigeria. */
export async function loadCouponRails() {
  if (!isSupabaseAdminConfigured()) return { hot: [], endingSoon: [], recent: [], popular: [], nigeria: [] };
  const client = createAdminClient();
  const since = new Date(Date.now() - 48 * 3_600_000).toISOString();
  const soon = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const [{ data: events }, { data: ending }, { data: recent }] = await Promise.all([
    client.from("coupon_events").select("offer_id").gte("created_at", since).limit(5_000),
    client.from("coupon_offers").select(OFFER_FIELDS).eq("status", "active").not("expires_at", "is", null).gte("expires_at", new Date().toISOString()).lte("expires_at", soon).order("expires_at").limit(8),
    client.from("coupon_offers").select(OFFER_FIELDS).eq("status", "active").order("last_seen_at", { ascending: false }).limit(40),
  ]);

  const tally = new Map<string, number>();
  for (const event of events ?? []) tally.set(event.offer_id, (tally.get(event.offer_id) ?? 0) + 1);
  const hotIds = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);
  let hotRows: CouponOffer[] = [];
  if (hotIds.length) {
    const { data } = await client.from("coupon_offers").select(OFFER_FIELDS).in("id", hotIds).eq("status", "active");
    hotRows = ((data ?? []) as CouponOffer[]).sort((a, b) => (tally.get(b.id) ?? 0) - (tally.get(a.id) ?? 0));
  }
  // Until people start copying, "hot" falls back to the strongest codes.
  const recentRows = (recent ?? []) as CouponOffer[];
  if (hotRows.length < 4) {
    const fallback = rankOffers(recentRows.filter((offer) => offer.kind === "code" && !hotIds.includes(offer.id)));
    const perBrand = new Set(hotRows.map((row) => row.brand_id));
    for (const offer of fallback) {
      if (hotRows.length >= 8) break;
      if (perBrand.has(offer.brand_id)) continue;
      perBrand.add(offer.brand_id);
      hotRows.push(offer);
    }
  }

  const brands = await loadBrandIndex();
  const withOffers = brands.filter((brand) => brand.offers > 0);
  const popular = [...withOffers].sort((a, b) => b.search_count - a.search_count || b.offers - a.offers).slice(0, 18);
  const nigeria = withOffers.filter((brand) => brand.country_scope === "ng").sort((a, b) => b.offers - a.offers).slice(0, 12);

  const recentByBrand: CouponOffer[] = [];
  const seenBrands = new Set<string>();
  for (const offer of recentRows) {
    if (seenBrands.has(offer.brand_id)) continue;
    seenBrands.add(offer.brand_id);
    recentByBrand.push(offer);
    if (recentByBrand.length >= 8) break;
  }

  return {
    hot: await offersWithBrands(hotRows),
    endingSoon: await offersWithBrands((ending ?? []) as CouponOffer[]),
    recent: await offersWithBrands(recentByBrand),
    popular,
    nigeria,
  };
}

export async function couponTotals() {
  const brands = await loadBrandIndex();
  return { brands: brands.length, offers: brands.reduce((sum, brand) => sum + brand.offers, 0), codes: brands.reduce((sum, brand) => sum + brand.codes, 0) };
}
