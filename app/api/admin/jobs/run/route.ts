import { timingSafeEqual } from "node:crypto";
import { runAdminJobs } from "../../../../../lib/admin/jobs";

function authorized(request: Request) {
  const expected = process.env.FUNDA_ADMIN_WORKER_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { limit?: number };
  const result = await runAdminJobs(undefined, Math.max(1, Math.min(Number(body.limit) || 20, 100)));
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
