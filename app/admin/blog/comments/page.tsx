import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import CommentsClient, { type AdminCommentItem } from "./comments-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Blog Comments & Questions · Funda Admin",
};

export default async function AdminBlogCommentsPage() {
  await requireAdmin();
  const client = createAdminClient();

  const { data: comments } = await client
    .from("blog_comments")
    .select(`
      id,
      post_id,
      parent_id,
      author_name,
      author_email,
      content,
      is_admin_reply,
      is_approved,
      likes_count,
      created_at,
      post:blog_posts(id, title, slug)
    `)
    .order("created_at", { ascending: false });

  // Normalise post field in case it's an array
  const formattedComments = (comments ?? []).map((c) => ({
    ...c,
    post: Array.isArray(c.post) ? c.post[0] ?? null : c.post,
  })) as AdminCommentItem[];

  return <CommentsClient initialComments={formattedComments} />;
}
