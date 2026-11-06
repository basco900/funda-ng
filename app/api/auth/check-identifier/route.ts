import { parseIdentifier } from "../../../../lib/auth/identifiers";
import { createAdminClient } from "../../../../lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { identifier?: string } | null;
    const raw = typeof body?.identifier === "string" ? body.identifier.trim() : "";
    const parsed = parseIdentifier(raw);
    if (!parsed) {
      return Response.json({ exists: false }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error || !data?.users) {
      return Response.json({ exists: false }, { headers: { "Cache-Control": "no-store" } });
    }

    const normalizedEmail = parsed.type === "email" ? parsed.value.toLowerCase() : null;
    const normalizedPhone = parsed.type === "phone" ? parsed.value.replace(/^\+/, "") : null;

    const exists = data.users.some((u) => {
      if (normalizedEmail && u.email?.toLowerCase() === normalizedEmail) return true;
      if (normalizedPhone && u.phone?.replace(/^\+/, "") === normalizedPhone) return true;
      return false;
    });

    return Response.json({ exists, type: parsed.type }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ exists: false }, { headers: { "Cache-Control": "no-store" } });
  }
}
