import { purchaseService } from "@/lib/services/purchases";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  try {
    const result = await purchaseService(user.id, await request.json());
    return Response.json(result, { status: result.reused ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Purchase could not be started.";
    const status = /insufficient|limit|restricted|valid|unavailable|not ready/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
