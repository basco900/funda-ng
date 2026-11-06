import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

    const admin = createAdminClient();
    await admin.rpc("increment_blog_post_views", { p_slug: slug });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to record view";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
