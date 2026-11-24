import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "../supabase/admin";
import { fetchPageText, type FetchedPage } from "./page-text";
import { couponProviders, couponProvidersReady, discoverUrls, extractOffers } from "./providers";
import { OFFER_KINDS, type BrandTier, type CouponBrand, type ExtractedOffer, type OfferSource } from "./types";

/**
 * Refreshes one brand: find pages, extract offers, keep only what the pages really say,
 * then reconcile with what is stored (new, changed, unseen, expired).
 */

const BASE_INTERVAL_DAYS: Record<BrandTier, number> = { hot: 2, regular: 7, long_tail: 21 };
const STALE_AFTER_MISSES = 2;
const EXPIRE_AFTER_MISSES = 4;

export type OfferInput = Omit<ExtractedOffer, "source_url"> & { source_url: string | null; source_type: OfferSource; description?: string | null };

/**
 * Identifies "the same offer" across runs. MD5 (dedupe only, not security) so SQL seeds can
 * compute the identical value: md5(brand_id || '|' || key), key as below.
 */
export function offerFingerprint(brandId: string, offer: Pick<OfferInput, "kind" | "code" | "title">) {
  const key = offer.kind === "code" && offer.code ? `code:${offer.code.toUpperCase()}` : `${offer.kind}:${offer.title.toLowerCase().replace(/[^a-z0-9%₦$£€]+/g, " ").trim()}`;
  return createHash("md5").update(`${brandId}|${key}`).digest("hex");
}

function cleanCode(code: string | null) {
  const value = code?.trim().replace(/\s+/g, "") ?? "";
  return /^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/.test(value) ? value : null;
}

function cleanDate(value: string | null) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function short(value: string | null | undefined, max: number) {
  const text = value?.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

function hostOf(url: string | null) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

/** Keeps an extracted offer only if its page backs it up; codes must appear verbatim. */
export function verifyExtracted(brand: Pick<CouponBrand, "domain">, offers: ExtractedOffer[], pages: FetchedPage[]): OfferInput[] {
  const byUrl = new Map<string, FetchedPage>();
  for (const page of pages) {
    byUrl.set(page.url, page);
    byUrl.set(page.finalUrl, page);
  }
  const result: OfferInput[] = [];
  const brandHost = brand.domain.replace(/^www\./, "");
  for (const offer of offers) {
    if (!OFFER_KINDS.includes(offer.kind)) continue;
    const page = byUrl.get(offer.source_url) ?? pages.find((candidate) => candidate.finalUrl.startsWith(offer.source_url) || offer.source_url.startsWith(candidate.finalUrl));
    if (!page) continue;
    const code = offer.kind === "code" ? cleanCode(offer.code) : null;
    if (offer.kind === "code") {
      if (!code) continue;
      const haystack = page.text.toUpperCase();
      if (!haystack.includes(code.toUpperCase())) continue;
    }
    const title = short(offer.title, 140);
    if (!title) continue;
    const expires = cleanDate(offer.expires_at);
    if (expires && Date.parse(expires) < Date.now()) continue;
    const host = hostOf(page.finalUrl);
    result.push({
      kind: offer.kind,
      code,
      title,
      discount_text: short(offer.discount_text, 60),
      min_spend: short(offer.min_spend, 60),
      conditions: short(offer.conditions, 300),
      new_users_only: Boolean(offer.new_users_only),
      works_in_nigeria: typeof offer.works_in_nigeria === "boolean" ? offer.works_in_nigeria : null,
      expires_at: expires,
      source_url: page.finalUrl,
      source_type: host === brandHost || host.endsWith(`.${brandHost}`) ? "brand" : "web",
    });
  }
  return result;
}

type ExistingOffer = { id: string; fingerprint: string; status: string; missed_runs: number; source_type: OfferSource; expires_at: string | null };

/**
 * Upserts offers found in this run and ages the ones that were not seen.
 * `exhaustive` marks a full refresh: anything not seen counts as a miss.
 */
export async function reconcileOffers(brandId: string, offers: OfferInput[], { exhaustive }: { exhaustive: boolean }) {
  const client = createAdminClient();
  const now = new Date().toISOString();
  const { data: existingRows, error } = await client.from("coupon_offers").select("id,fingerprint,status,missed_runs,source_type,expires_at").eq("brand_id", brandId);
  if (error) throw new Error("Stored offers could not be loaded.");
  const existing = new Map((existingRows ?? []).map((row) => [row.fingerprint, row as ExistingOffer]));
  const seen = new Set<string>();
  let added = 0;
  let updated = 0;
  let retired = 0;

  for (const offer of offers) {
    const fingerprint = offerFingerprint(brandId, offer);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const fields = {
      kind: offer.kind,
      code: offer.code,
      title: offer.title,
      description: offer.description ?? null,
      discount_text: offer.discount_text,
      min_spend: offer.min_spend,
      conditions: offer.conditions,
      new_users_only: offer.new_users_only,
      works_in_nigeria: offer.works_in_nigeria,
      source_url: offer.source_url,
      expires_at: offer.expires_at,
      last_seen_at: now,
      missed_runs: 0,
      updated_at: now,
    };
    const current = existing.get(fingerprint);
    if (current) {
      if (current.status === "rejected") continue;
      const { error: updateError } = await client
        .from("coupon_offers")
        .update({ ...fields, status: current.status === "pending" ? "pending" : "active", source_type: current.source_type === "web" ? offer.source_type : current.source_type })
        .eq("id", current.id);
      if (updateError) throw new Error("An offer could not be updated.");
      updated += 1;
    } else {
      const { error: insertError } = await client.from("coupon_offers").insert({ ...fields, brand_id: brandId, fingerprint, source_type: offer.source_type, status: "active", first_seen_at: now });
      if (insertError) throw new Error(`An offer could not be saved: ${insertError.message}`);
      added += 1;
    }
  }

  for (const row of existing.values()) {
    if (seen.has(row.fingerprint) || !["active", "stale"].includes(row.status)) continue;
    const expiredByDate = row.expires_at && Date.parse(row.expires_at) < Date.now();
    // Editor, partner and user codes are not found by crawling; only their dates and votes retire them.
    const crawlable = row.source_type === "brand" || row.source_type === "web";
    const misses = exhaustive && crawlable ? row.missed_runs + 1 : row.missed_runs;
    const status = expiredByDate || misses >= EXPIRE_AFTER_MISSES ? "expired" : misses >= STALE_AFTER_MISSES ? "stale" : row.status;
    if (status !== row.status || misses !== row.missed_runs) {
      await client.from("coupon_offers").update({ missed_runs: misses, status, updated_at: now }).eq("id", row.id);
      if (status === "expired") retired += 1;
    }
  }

  return { added, updated, retired };
}

function nextRefresh(tier: BrandTier, emptyRuns: number) {
  const days = Math.min(30, BASE_INTERVAL_DAYS[tier] * Math.pow(1.6, Math.min(emptyRuns, 4)));
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export async function refreshBrand(brandId: string, trigger: "schedule" | "manual" | "live" = "schedule") {
  const client = createAdminClient();
  const { data: brand, error } = await client.from("coupon_brands").select("*").eq("id", brandId).single();
  if (error || !brand) throw new Error("Brand not found.");
  const providers = couponProviders();
  const { data: run } = await client
    .from("coupon_refresh_runs")
    .insert({ brand_id: brandId, trigger, provider: [providers.search, providers.extract].filter(Boolean).join("+") || "none" })
    .select("id")
    .single();

  const finish = async (fields: Record<string, unknown>) => {
    if (run) await client.from("coupon_refresh_runs").update({ ...fields, finished_at: new Date().toISOString() }).eq("id", run.id);
  };

  try {
    if (!couponProvidersReady()) throw new Error("No AI provider is configured. Add OPENAI_API_KEY or GEMINI_API_KEY.");
    const urls = await discoverUrls(brand as CouponBrand);
    const pages = (await Promise.all(urls.map((url) => fetchPageText(url)))).filter((page): page is FetchedPage => Boolean(page));
    const extracted = await extractOffers(brand, pages.map((page) => ({ url: page.finalUrl, text: page.focused })));
    const offers = verifyExtracted(brand, extracted, pages);
    const result = await reconcileOffers(brandId, offers, { exhaustive: pages.length > 0 });
    const empty = offers.length === 0;
    const emptyRuns = empty ? brand.consecutive_empty_runs + 1 : 0;
    await client
      .from("coupon_brands")
      .update({ last_refreshed_at: new Date().toISOString(), next_refresh_at: nextRefresh(brand.tier, emptyRuns), last_refresh_status: empty ? "empty" : "ok", consecutive_empty_runs: emptyRuns, updated_at: new Date().toISOString() })
      .eq("id", brandId);
    await finish({ status: empty ? "empty" : "succeeded", pages_checked: pages.length, found: offers.length, ...result });
    return { brand: brand.name, pages: pages.length, found: offers.length, ...result };
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : "Refresh failed.";
    await client.from("coupon_brands").update({ last_refresh_status: "failed", next_refresh_at: new Date(Date.now() + 6 * 3_600_000).toISOString() }).eq("id", brandId);
    await finish({ status: "failed", error: message.slice(0, 500) });
    throw failure;
  }
}

/** Worker entry: refreshes the brands that are due, a small batch at a time. */
export async function refreshDueBrands(limit = Number(process.env.COUPON_REFRESH_BATCH || 8)) {
  if (!couponProvidersReady()) return { skipped: "no provider configured" };
  const client = createAdminClient();
  const { data, error } = await client
    .from("coupon_brands")
    .select("id")
    .eq("status", "active")
    .lte("next_refresh_at", new Date().toISOString())
    .order("next_refresh_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 25)));
  if (error) throw new Error("Due brands could not be loaded.");
  const results: Array<{ id: string; ok: boolean }> = [];
  for (const row of data ?? []) {
    try {
      await refreshBrand(row.id, "schedule");
      results.push({ id: row.id, ok: true });
    } catch {
      results.push({ id: row.id, ok: false });
    }
  }
  return { refreshed: results.length, failed: results.filter((item) => !item.ok).length };
}
