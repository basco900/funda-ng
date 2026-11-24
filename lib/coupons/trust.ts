import type { CouponOffer, OfferSource } from "./types";

/**
 * How much to trust an offer: where it came from, how recently it was confirmed,
 * and what people who used it reported. 0–100, used for ranking and badges.
 */

const SOURCE_WEIGHT: Record<OfferSource, number> = { partner: 40, brand: 36, editor: 30, user: 18, web: 14 };

/** Lower bound of the Wilson interval: rewards consistent success, not a single lucky vote. */
function wilson(worked: number, failed: number) {
  const n = worked + failed;
  if (!n) return null;
  const z = 1.64;
  const p = worked / n;
  return (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / (1 + (z * z) / n);
}

export function trustScore(offer: Pick<CouponOffer, "source_type" | "last_seen_at" | "last_verified_at" | "worked_count" | "failed_count" | "expires_at" | "status">, now = Date.now()) {
  let score = SOURCE_WEIGHT[offer.source_type];

  const seen = new Date(offer.last_verified_at ?? offer.last_seen_at).getTime();
  const days = Math.max(0, (now - seen) / 86_400_000);
  score += Math.max(0, 25 - days * 2.5);

  const votes = wilson(offer.worked_count, offer.failed_count);
  if (votes !== null) score += (votes - 0.5) * 70;

  if (offer.expires_at) {
    const left = (new Date(offer.expires_at).getTime() - now) / 86_400_000;
    if (left < 0) score -= 60;
  }
  if (offer.status === "stale") score -= 25;
  return Math.round(Math.max(0, Math.min(100, score)));
}

export type TrustBadge = "verified" | "brand" | "community" | "unverified";

export function trustBadge(offer: Pick<CouponOffer, "source_type" | "worked_count" | "failed_count">): TrustBadge {
  const votes = wilson(offer.worked_count, offer.failed_count);
  if (votes !== null && votes >= 0.55 && offer.worked_count >= 2) return "verified";
  if (offer.source_type === "brand" || offer.source_type === "partner") return "brand";
  if (offer.source_type === "user" || offer.source_type === "editor") return "community";
  return "unverified";
}

export const BADGE_LABELS: Record<TrustBadge, string> = {
  verified: "Verified",
  brand: "From the brand",
  community: "Community",
  unverified: "Unverified",
};

export function successRate(offer: Pick<CouponOffer, "worked_count" | "failed_count">) {
  const n = offer.worked_count + offer.failed_count;
  return n ? Math.round((offer.worked_count / n) * 100) : null;
}

export function rankOffers<T extends Parameters<typeof trustScore>[0]>(offers: T[]) {
  const now = Date.now();
  return [...offers].sort((a, b) => trustScore(b, now) - trustScore(a, now));
}
