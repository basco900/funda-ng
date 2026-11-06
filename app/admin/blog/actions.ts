"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function estimateReadingTime(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 220));
}

export async function createBlogPost(formData: FormData) {
  const admin = await requireAdmin();
  const client = createAdminClient();

  const title = (formData.get("title") as string)?.trim();
  const slugInput = (formData.get("slug") as string)?.trim();
  const excerpt = (formData.get("excerpt") as string)?.trim();
  const content = (formData.get("content") as string)?.trim();
  const categorySlug = (formData.get("categorySlug") as string)?.trim() || "telecoms-data";
  const featuredImage = (formData.get("featuredImage") as string)?.trim() || null;
  const authorName = (formData.get("authorName") as string)?.trim() || admin.fullName || "Funda Editorial";
  const authorRole = (formData.get("authorRole") as string)?.trim() || "Staff Writer";
  const status = (formData.get("status") as string)?.trim() || "published";
  const isFeatured = formData.get("isFeatured") === "true" || formData.get("isFeatured") === "on";
  const tagsString = (formData.get("tags") as string)?.trim() || "";
  const tags = tagsString
    ? tagsString.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  if (!title || !content) {
    return { error: "Title and content are required." };
  }

  const slug = slugInput ? generateSlug(slugInput) : generateSlug(title);
  const readingTime = estimateReadingTime(content);

  // Get category id
  const { data: catData } = await client
    .from("blog_categories")
    .select("id")
    .eq("slug", categorySlug)
    .maybeSingle();

  const { data: post, error } = await client
    .from("blog_posts")
    .insert({
      title,
      slug,
      excerpt: excerpt || title,
      content,
      featured_image: featuredImage,
      category_id: catData?.id || null,
      category_slug: categorySlug,
      tags,
      author_name: authorName,
      author_role: authorRole,
      status,
      is_featured: isFeatured,
      reading_time_minutes: readingTime,
      published_at: status === "published" ? new Date().toISOString() : null,
    })
    .select("id, slug")
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/blog");
  revalidatePath(`/blog/${post.slug}`);
  revalidatePath("/admin/blog");
  redirect("/admin/blog");
}

export async function updateBlogPost(id: string, formData: FormData) {
  await requireAdmin();
  const client = createAdminClient();

  const title = (formData.get("title") as string)?.trim();
  const slugInput = (formData.get("slug") as string)?.trim();
  const excerpt = (formData.get("excerpt") as string)?.trim();
  const content = (formData.get("content") as string)?.trim();
  const categorySlug = (formData.get("categorySlug") as string)?.trim() || "telecoms-data";
  const featuredImage = (formData.get("featuredImage") as string)?.trim() || null;
  const authorName = (formData.get("authorName") as string)?.trim() || "Funda Editorial";
  const authorRole = (formData.get("authorRole") as string)?.trim() || "Staff Writer";
  const status = (formData.get("status") as string)?.trim() || "published";
  const isFeatured = formData.get("isFeatured") === "true" || formData.get("isFeatured") === "on";
  const tagsString = (formData.get("tags") as string)?.trim() || "";
  const tags = tagsString
    ? tagsString.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  if (!title || !content) {
    return { error: "Title and content are required." };
  }

  const slug = slugInput ? generateSlug(slugInput) : generateSlug(title);
  const readingTime = estimateReadingTime(content);

  const { data: catData } = await client
    .from("blog_categories")
    .select("id")
    .eq("slug", categorySlug)
    .maybeSingle();

  const { error } = await client
    .from("blog_posts")
    .update({
      title,
      slug,
      excerpt: excerpt || title,
      content,
      featured_image: featuredImage,
      category_id: catData?.id || null,
      category_slug: categorySlug,
      tags,
      author_name: authorName,
      author_role: authorRole,
      status,
      is_featured: isFeatured,
      reading_time_minutes: readingTime,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/blog");
  revalidatePath(`/blog/${slug}`);
  revalidatePath("/admin/blog");
  redirect("/admin/blog");
}

export async function deleteBlogPost(id: string) {
  await requireAdmin();
  const client = createAdminClient();

  const { data: post } = await client
    .from("blog_posts")
    .select("slug")
    .eq("id", id)
    .single();

  const { error } = await client.from("blog_posts").delete().eq("id", id);
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/blog");
  if (post?.slug) revalidatePath(`/blog/${post.slug}`);
  revalidatePath("/admin/blog");
  return { success: true };
}

export async function togglePostStatus(id: string, currentStatus: string) {
  await requireAdmin();
  const client = createAdminClient();

  const newStatus = currentStatus === "published" ? "draft" : "published";
  const { error } = await client
    .from("blog_posts")
    .update({
      status: newStatus,
      published_at: newStatus === "published" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/blog");
  revalidatePath("/admin/blog");
  return { success: true, newStatus };
}

export async function deleteComment(id: string) {
  await requireAdmin();
  const client = createAdminClient();

  const { error } = await client.from("blog_comments").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/blog");
  revalidatePath("/admin/blog");
  return { success: true };
}

export async function replyToComment(postId: string, parentId: string, replyContent: string) {
  const admin = await requireAdmin();
  const client = createAdminClient();

  if (!replyContent?.trim()) return { error: "Reply content cannot be empty." };

  const { data, error } = await client
    .from("blog_comments")
    .insert({
      post_id: postId,
      parent_id: parentId,
      author_name: admin.fullName || "Funda Admin",
      author_email: admin.email,
      content: replyContent.trim(),
      is_admin_reply: true,
      is_approved: true,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/blog`);
  return { success: true, reply: data };
}
