import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: notifications } = await admin
    .from("user_notifications")
    .select("id, title, body, kind, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(35);

  return Response.json(
    { notifications: notifications ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  await admin
    .from("user_notifications")
    .update({ read_at: now })
    .eq("user_id", user.id)
    .is("read_at", null);

  return Response.json({ ok: true, readAt: now });
}
