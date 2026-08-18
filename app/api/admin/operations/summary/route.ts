import { getAdminSession, hasAdminPermission } from "../../../../../lib/admin/auth";
import { loadAdminOperationsSummary } from "../../../../../lib/admin/repository";

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminPermission(admin, "dashboard.view")) return Response.json({ error: "Forbidden" }, { status: 403 });

  const summary = await loadAdminOperationsSummary();
  return Response.json(summary, { headers: { "Cache-Control": "private, no-store" } });
}
