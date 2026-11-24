import { z } from "zod";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";
import { allow } from "../../../../lib/coupons/limits";
import { offerFingerprint } from "../../../../lib/coupons/refresh";

const schema = z.object({
  brand: z.string().trim().min(1).max(80),
  code: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/, "Codes are letters, numbers, - or _."),
  title: z.string().trim().min(3).max(140),
  conditions: z.string().trim().max(300).optional().default(""),
});

/** Signed-in users can share a code; it waits for review before anyone sees it. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in to share a code." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the code and try again." }, { status: 400 });
  if (!allow(`coupon-submit:${user.id}`, 10, 86_400_000)) return Response.json({ error: "You've shared a lot today. Try again tomorrow." }, { status: 429 });
  const client = createAdminClient();
  const { data: brand } = await client.from("coupon_brands").select("id").eq("slug", parsed.data.brand).maybeSingle();
  if (!brand) return Response.json({ error: "Unknown brand." }, { status: 404 });
  const offer = { kind: "code" as const, code: parsed.data.code, title: parsed.data.title };
  const { error } = await client.from("coupon_offers").insert({
    brand_id: brand.id,
    ...offer,
    conditions: parsed.data.conditions || null,
    source_type: "user",
    status: "pending",
    fingerprint: offerFingerprint(brand.id, offer),
    submitted_by: user.id,
  });
  if (error?.code === "23505") return Response.json({ ok: true, duplicate: true });
  if (error) return Response.json({ error: "Couldn't save that code." }, { status: 500 });
  return Response.json({ ok: true });
}
