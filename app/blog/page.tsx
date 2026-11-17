import type { Metadata } from "next";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import BlogNavHeader from "@/components/blog/blog-nav-header";
import BlogFooter from "@/components/blog/blog-footer";
import BlogHomeClient, { type PublicBlogPost, type PublicCategory } from "./blog-home-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blog & Insights | Funda - Everyday Nigerian Bills & Telecom Hacks",
  description:
    "Explore practical guides, smart telecoms hacks, prepaid meter error solvers, WAEC & NECO registration guides, and financial security tips from the Funda editorial team.",
  openGraph: {
    title: "Funda Editorial & Insights | Everyday Bills & Telecoms Guides",
    description:
      "Explore practical guides, smart telecoms hacks, prepaid meter error solvers, WAEC & NECO registration guides, and financial security tips from Funda.",
    url: "https://funda.ng/blog",
    siteName: "Funda",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Funda Editorial & Insights",
    description: "Everyday Nigerian bills, telecoms hacks, prepaid meter troubleshooting, and fintech guides.",
  },
};

export default async function BlogPage() {
  let posts: PublicBlogPost[] = [];
  let categories: PublicCategory[] = [];

  if (isSupabaseAdminConfigured()) {
    const supabase = createAdminClient();

    const [postsRes, categoriesRes] = await Promise.all([
      supabase
        .from("blog_posts")
        .select(
          "id, title, slug, excerpt, category_slug, tags, author_name, author_avatar, author_role, reading_time_minutes, views_count, likes_count, is_featured, featured_image, published_at"
        )
        .eq("status", "published")
        .order("is_featured", { ascending: false })
        .order("published_at", { ascending: false }),
      supabase
        .from("blog_categories")
        .select("id, name, slug, description, icon, color")
        .order("name", { ascending: true }),
    ]);

    posts = (postsRes.data || []) as PublicBlogPost[];
    categories = (categoriesRes.data || []) as PublicCategory[];
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--background)" }}>
      <BlogNavHeader />
      <main style={{ flex: 1 }}>
        <BlogHomeClient posts={posts} categories={categories} />
      </main>
      <BlogFooter />
    </div>
  );
}
