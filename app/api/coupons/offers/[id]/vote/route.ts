import { z } from "zod";
import { createAdminClient } from "../../../../../../lib/supabase/admin";
import { createClient } from "../../../../../../lib/supabase/server";
import { allow, clientIp, voterKey } from "../../../../../../lib/coupons/limits";

/** "Did it work?" One vote per person per offer; changing your mind replaces the vote. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.string().uuid().safeParse((await params).id);
  const body = z.object({ worked: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!id.success || !body.success) return Response.json({ error: "Invalid vote." }, { status: 400 });
  if (!allow(`coupon-vote:${clientIp(request)}`, 40, 3_600_000)) return Response.json({ error: "Too many votes. Try again later." }, { status: 429 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const key = user ? `user:${user.id}` : await voterKey();
  const { data, error } = await createAdminClient().rpc("record_coupon_vote", { p_offer_id: id.data, p_voter_key: key, p_user_id: user?.id ?? null, p_worked: body.data.worked });
  if (error) return Response.json({ error: "Vote could not be saved." }, { status: 500 });
  const counts = Array.isArray(data) ? data[0] : data;
  return Response.json({ ok: true, worked: counts?.worked_count ?? 0, failed: counts?.failed_count ?? 0 });
}
