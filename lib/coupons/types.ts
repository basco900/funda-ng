/** Coupon finder: shared shapes for brands, offers and refresh results. */

export const OFFER_KINDS = ["code", "deal", "trial", "student", "referral", "bundle"] as const;
export type OfferKind = (typeof OFFER_KINDS)[number];

export const OFFER_SOURCES = ["brand", "web", "user", "partner", "editor"] as const;
export type OfferSource = (typeof OFFER_SOURCES)[number];

export const OFFER_STATUSES = ["active", "stale", "expired", "rejected", "pending"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const BRAND_TIERS = ["hot", "regular", "long_tail"] as const;
export type BrandTier = (typeof BRAND_TIERS)[number];

export const BRAND_CATEGORIES = [
  "shopping",
  "food",
  "travel",
  "transport",
  "fashion",
  "electronics",
  "software",
  "hosting",
  "education",
  "streaming",
  "finance",
  "gaming",
  "health",
] as const;
export type BrandCategory = (typeof BRAND_CATEGORIES)[number];

export type CouponBrand = {
  id: string;
  slug: string;
  name: string;
  domain: string;
  aliases: string[];
  category: string;
  country_scope: "ng" | "global";
  promo_urls: string[];
  tier: BrandTier;
  status: "active" | "paused";
  search_count: number;
  last_refreshed_at: string | null;
  next_refresh_at: string;
  last_refresh_status: string | null;
  consecutive_empty_runs: number;
};

export type CouponOffer = {
  id: string;
  brand_id: string;
  kind: OfferKind;
  code: string | null;
  title: string;
  description: string | null;
  discount_text: string | null;
  min_spend: string | null;
  conditions: string | null;
  new_users_only: boolean;
  works_in_nigeria: boolean | null;
  source_url: string | null;
  source_type: OfferSource;
  status: OfferStatus;
  expires_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_verified_at: string | null;
  worked_count: number;
  failed_count: number;
  copy_count: number;
};

/** What the extractor returns for one offer, before it is checked against the page. */
export type ExtractedOffer = {
  kind: OfferKind;
  code: string | null;
  title: string;
  discount_text: string | null;
  min_spend: string | null;
  conditions: string | null;
  new_users_only: boolean;
  works_in_nigeria: boolean | null;
  expires_at: string | null;
  source_url: string;
};

export const KIND_LABELS: Record<OfferKind, string> = {
  code: "Code",
  deal: "Deal",
  trial: "Free trial",
  student: "Student",
  referral: "Referral",
  bundle: "Bundle",
};

export const CATEGORY_LABELS: Record<string, string> = {
  shopping: "Shopping",
  food: "Food & groceries",
  travel: "Travel",
  transport: "Rides",
  fashion: "Fashion",
  electronics: "Electronics",
  software: "Software",
  hosting: "Domains & hosting",
  education: "Learning",
  streaming: "Streaming",
  finance: "Finance",
  gaming: "Gaming",
  health: "Health & beauty",
};
