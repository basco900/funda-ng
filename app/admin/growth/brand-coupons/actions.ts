"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AdminPermissionError, requireAdminPermission } from "../../../../lib/admin/auth";
import { enqueueAdminJob } from "../../../../lib/admin/jobs";
import { recordAdminAudit } from "../../../../lib/admin/security";
import { couponProvidersReady } from "../../../../lib/coupons/providers";
import { BRAND_CATEGORIES, BRAND_TIERS } from "../../../../lib/coupons/types";
import { createAdminClient } from "../../../../lib/supabase/admin";

export type CouponActionResult = { ok: boolean; message: string };

const PATH = "/admin/growth/brand-coupons";

function failure(error: unknown): CouponActionResult {
  if (error instanceof AdminPermissionError) return { ok: false, message: "You don't have access to manage coupons." };
  if (error instanceof z.ZodError) return { ok: false, message: error.issues[0]?.message ?? "Check the details and try again." };
  return { ok: false, message: error instanceof Error ? error.message : "Something went wrong." };
}

const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

const brandSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(80),
  domain: z.string().trim().toLowerCase().transform((value) => value.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "")).pipe(z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Enter a domain like jumia.com.ng")),
  category: z.enum(BRAND_CATEGORIES),
  tier: z.enum(BRAND_TIERS),
  countryScope: z.enum(["ng", "global"]),
  aliases: z.string().max(300).optional().default(""),
  promoUrls: z.string().max(2000).optional().default(""),
});

export async function saveCouponBrand(input: unknown): Promise<CouponActionResult> {
  try {
    const values = brandSchema.parse(input);
    const session = await requireAdminPermission("campaigns.manage");
    const record = {
      name: values.name,
      domain: values.domain,
      category: values.category,
      tier: values.tier,
      country_scope: values.countryScope,
      aliases: values.aliases.split(",").map((alias) => alias.trim()).filter(Boolean).slice(0, 12),
      promo_urls: values.promoUrls.split(/\s+/).map((url) => url.trim()).filter((url) => /^https:\/\//.test(url)).slice(0, 6),
      updated_at: new Date().toISOString(),
    };
    const client = createAdminClient();
    const { data, error } = values.id
      ? await client.from("coupon_brands").update(record).eq("id", values.id).select("id").single()
      : await client.from("coupon_brands").insert({ ...record, slug: slugify(values.name) }).select("id").single();
    if (error) throw new Error(error.code === "23505" ? "A brand with that name already exists." : "The brand could not be saved.");
    await recordAdminAudit(session, { action: values.id ? "coupon_brand.updated" : "coupon_brand.created", entityType: "coupon_brand", entityId: data.id, newValue: record });
    revalidatePath(PATH);
    return { ok: true, message: values.id ? "Brand updated." : "Brand added. It will be checked on the next run." };
  } catch (error) {
    return failure(error);
  }
}

export async function setCouponBrandStatus(input: unknown): Promise<CouponActionResult> {
  try {
    const values = z.object({ id: z.string().uuid(), status: z.enum(["active", "paused"]) }).parse(input);
    const session = await requireAdminPermission("campaigns.manage");
    const { error } = await createAdminClient().from("coupon_brands").update({ status: values.status, updated_at: new Date().toISOString() }).eq("id", values.id);
    if (error) throw new Error("The brand could not be updated.");
    await recordAdminAudit(session, { action: `coupon_brand.${values.status === "active" ? "resumed" : "paused"}`, entityType: "coupon_brand", entityId: values.id });
    revalidatePath(PATH);
    return { ok: true, message: values.status === "active" ? "Brand is live again." : "Brand hidden and paused." };
  } catch (error) {
    return failure(error);
  }
}

export async function queueCouponRefresh(input: unknown): Promise<CouponActionResult> {
  try {
    const values = z.object({ id: z.string().uuid() }).parse(input);
    const session = await requireAdminPermission("campaigns.manage");
    if (!couponProvidersReady()) throw new Error("Add OPENAI_API_KEY or GEMINI_API_KEY before refreshing.");
    const jobId = await enqueueAdminJob("coupons.refresh_brand", { brandId: values.id, trigger: "manual" }, `coupons.refresh_brand:${values.id}:${Math.floor(Date.now() / 600_000)}`);
    await recordAdminAudit(session, { action: "coupon_brand.refresh_queued", entityType: "coupon_brand", entityId: values.id, newValue: { jobId } });
    return { ok: true, message: "Refresh queued. It runs with the next worker pass." };
  } catch (error) {
    return failure(error);
  }
}

export async function moderateCouponOffer(input: unknown): Promise<CouponActionResult> {
  try {
    const values = z.object({ id: z.string().uuid(), status: z.enum(["active", "rejected", "expired"]) }).parse(input);
    const session = await requireAdminPermission("campaigns.manage");
    const { error } = await createAdminClient()
      .from("coupon_offers")
      .update({ status: values.status, missed_runs: 0, updated_at: new Date().toISOString(), ...(values.status === "active" ? { last_verified_at: new Date().toISOString() } : {}) })
      .eq("id", values.id);
    if (error) throw new Error("The offer could not be updated.");
    await recordAdminAudit(session, { action: `coupon_offer.${values.status}`, entityType: "coupon_offer", entityId: values.id });
    revalidatePath(PATH);
    return { ok: true, message: values.status === "active" ? "Offer is live." : values.status === "rejected" ? "Offer rejected." : "Offer marked expired." };
  } catch (error) {
    return failure(error);
  }
}

export async function dismissCouponRequest(input: unknown): Promise<CouponActionResult> {
  try {
    const values = z.object({ query: z.string().trim().min(1).max(80) }).parse(input);
    await requireAdminPermission("campaigns.manage");
    await createAdminClient().from("coupon_search_misses").delete().eq("query", values.query);
    revalidatePath(PATH);
    return { ok: true, message: "Request dismissed." };
  } catch (error) {
    return failure(error);
  }
}
