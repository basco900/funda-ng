import { getAdminSession, hasAdminPermission } from "../../../../lib/admin/auth";
import { searchAdminRecords } from "../../../../lib/admin/repository";

export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminPermission(admin, "dashboard.view")) return Response.json({ error: "Forbidden" }, { status: 403 });

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length > 80) return Response.json({ error: "Search query is too long." }, { status: 400 });
  const results = await searchAdminRecords(query);
  return Response.json({ results }, { headers: { "Cache-Control": "private, no-store" } });
}
