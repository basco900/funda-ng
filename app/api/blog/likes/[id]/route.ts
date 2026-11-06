import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    const admin = createAdminClient();
    const { data: newLikes, error } = await admin.rpc("increment_blog_post_likes", { p_post_id: id });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ likes: newLikes });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to record like";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
