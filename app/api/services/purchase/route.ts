import { purchaseService } from "@/lib/services/purchases";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  try {
    const result = await purchaseService(user.id, await request.json());
    return Response.json(result, { status: result.reused ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid purchase details." : error instanceof Error ? error.message : "Purchase could not be started.";
    const status = /pricing changed|quote changed|different purchase|route changed/i.test(message) ? 409 : /insufficient|limit|restricted|valid|unavailable|not ready|choose/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
