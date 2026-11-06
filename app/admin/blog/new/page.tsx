import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import PostEditor from "../post-editor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "New Blog Post · Funda Admin",
};

export default async function NewBlogPostPage() {
  const admin = await requireAdmin();
  const client = createAdminClient();

  const { data: categories } = await client
    .from("blog_categories")
    .select("id, name, slug")
    .order("sort_order", { ascending: true });

  return (
    <PostEditor
      categories={categories ?? []}
      adminName={admin.fullName || "Funda Editorial"}
    />
  );
}
