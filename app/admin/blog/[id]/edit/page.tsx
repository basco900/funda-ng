import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import PostEditor, { type PostFormData } from "../../post-editor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Edit Blog Post · Funda Admin",
};

export default async function EditBlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = await requireAdmin();
  const client = createAdminClient();

  const [{ data: post }, { data: categories }] = await Promise.all([
    client
      .from("blog_posts")
      .select("*")
      .eq("id", id)
      .maybeSingle(),
    client
      .from("blog_categories")
      .select("id, name, slug")
      .order("sort_order", { ascending: true }),
  ]);

  if (!post) {
    notFound();
  }

  const initialData: PostFormData = {
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    content: post.content,
    featured_image: post.featured_image,
    category_slug: post.category_slug,
    tags: post.tags ?? [],
    author_name: post.author_name,
    author_role: post.author_role ?? "Staff Writer",
    status: post.status as "published" | "draft",
    is_featured: Boolean(post.is_featured),
  };

  return (
    <PostEditor
      initialData={initialData}
      categories={categories ?? []}
      adminName={admin.fullName || "Funda Editorial"}
    />
  );
}
