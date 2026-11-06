import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const postId = searchParams.get("postId");
  if (!postId) {
    return NextResponse.json({ error: "Missing postId" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("blog_comments")
    .select("id, post_id, parent_id, author_name, content, is_admin_reply, likes_count, created_at")
    .eq("post_id", postId)
    .eq("is_approved", true)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ comments: data ?? [] });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { postId, authorName, authorEmail, content, parentId } = body;

    if (!postId || !authorName?.trim() || !content?.trim()) {
      return NextResponse.json(
        { error: "Post ID, Name, and Comment content are required." },
        { status: 400 }
      );
    }

    // Basic anti-spam: limit length
    if (content.trim().length < 3 || content.trim().length > 2000) {
      return NextResponse.json(
        { error: "Comment must be between 3 and 2000 characters." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("blog_comments")
      .insert({
        post_id: postId,
        parent_id: parentId || null,
        author_name: authorName.trim(),
        author_email: authorEmail?.trim() || null,
        content: content.trim(),
        is_approved: true, // auto-approve standard comments
        is_admin_reply: false,
      })
      .select("id, post_id, parent_id, author_name, content, is_admin_reply, likes_count, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ comment: data }, { status: 201 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to post comment";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
