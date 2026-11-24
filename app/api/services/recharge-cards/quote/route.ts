import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { quoteRechargeCards } from "@/lib/services/recharge-cards";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  try {
    const { quote } = await quoteRechargeCards(await request.json());
    return Response.json(quote, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof z.ZodError ? "Choose a network, denomination and quantity from 1 to 20." : error instanceof Error ? error.message : "Recharge-card quote is unavailable." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
