import { z } from "zod";
import { createAdminClient } from "../../../../../../lib/supabase/admin";
import { allow, clientIp } from "../../../../../../lib/coupons/limits";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return Response.json({ error: "Unknown offer." }, { status: 404 });
  if (!allow(`coupon-copy:${clientIp(request)}:${id.data}`, 3, 3_600_000)) return Response.json({ ok: true });
  await createAdminClient().rpc("record_coupon_copy", { p_offer_id: id.data });
  return Response.json({ ok: true });
}
