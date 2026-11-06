import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import BlogWorkspace, { type BlogPostRow, type BlogCategoryRow } from "./blog-workspace";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Blog & Editorial Manager · Funda Admin",
};

export default async function AdminBlogPage() {
  await requireAdmin();
  const client = createAdminClient();

  const [{ data: posts }, { data: categories }, { count: commentsCount }] = await Promise.all([
    client
      .from("blog_posts")
      .select("id, title, slug, excerpt, category_slug, tags, author_name, status, published_at, reading_time_minutes, views_count, likes_count, is_featured, featured_image, created_at")
      .order("created_at", { ascending: false }),
    client
      .from("blog_categories")
      .select("id, name, slug, icon, color")
      .order("sort_order", { ascending: true }),
    client
      .from("blog_comments")
      .select("*", { count: "exact", head: true }),
  ]);

  return (
    <BlogWorkspace
      posts={(posts ?? []) as BlogPostRow[]}
      categories={(categories ?? []) as BlogCategoryRow[]}
      totalCommentsCount={commentsCount ?? 0}
    />
  );
}
