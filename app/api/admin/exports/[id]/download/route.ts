import { getAdminSession, hasAdminPermission, materializeAdminSession } from "@/lib/admin/auth";
import { getAdminExportDownload } from "@/lib/admin/exports";
import { recordAdminAudit } from "@/lib/admin/security";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasAdminPermission(admin, "reports.export")) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;
  try {
    const adminUserId = await materializeAdminSession(admin);
    const url = await getAdminExportDownload(id, adminUserId, admin.roleSlug === "super_admin");
    await recordAdminAudit(admin, { action: "report_export.downloaded", entityType: "admin_export", entityId: id });
    return Response.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Export could not be downloaded." }, { status: 400 });
  }
}
