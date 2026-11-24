import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const cursorSchema = z.object({ createdAt: z.string().datetime({ offset: true }), id: z.string().uuid() });

export async function GET(request: Request) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  const headers = { "Cache-Control": "private, no-store" };
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401, headers });
  try {
    const params = new URL(request.url).searchParams;
    let query = client.from("service_transactions").select("id,internal_reference,provider_reference,amount,discount_amount,cashback_amount,status,destination,created_at,metadata").eq("user_id", user.id).eq("service_type", "airtime").eq("metadata->>mode", "epin").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(21);
    const cursor = params.get("cursor");
    if (cursor) {
      const parsed = cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
      query = query.or(`created_at.lt.${parsed.createdAt},and(created_at.eq.${parsed.createdAt},id.lt.${parsed.id})`);
    }
    const q = params.get("q")?.trim().slice(0, 120);
    if (q) query = query.ilike("internal_reference", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
    const { data, error } = await query;
    if (error) throw new Error("Your recharge-card history is unavailable.");
    const page = (data ?? []).slice(0, 20);
    const orders = page.map((tx) => {
    const meta = (tx.metadata ?? {}) as Record<string, unknown>;
      return { id: tx.id, reference: tx.internal_reference, providerReference: tx.provider_reference, amount: Number(tx.amount), discount: Number(tx.discount_amount), cashback: tx.status === "successful" ? Number(tx.cashback_amount) : 0, status: tx.status, destination: tx.destination, createdAt: tx.created_at, productName: String(meta.productName ?? "Recharge cards"), quantity: Number(meta.quantity ?? 1), unitAmount: Number(meta.unitAmount ?? tx.amount), faceValue: Number(meta.faceValue ?? Number(tx.amount) + Number(tx.discount_amount)), deliveryStatus: String(meta.deliveryStatus ?? (tx.status === "successful" ? "ready" : "awaiting_provider")), pinCount: Number(meta.pinCount ?? 0) };
    });
    const last = page.at(-1);
    const nextCursor = (data?.length ?? 0) > 20 && last ? Buffer.from(JSON.stringify({ id: last.id, createdAt: last.created_at })).toString("base64url") : null;
    return Response.json({ orders, nextCursor }, { headers });
  } catch (error) {
    const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
    return Response.json({ error: invalid ? "Invalid history cursor." : "Your recharge-card history is unavailable." }, { status: invalid ? 400 : 503, headers });
  }
}
