import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import BlogNavHeader from "@/components/blog/blog-nav-header";
import BlogFooter from "@/components/blog/blog-footer";
import BlogHomeClient, { type PublicBlogPost, type PublicCategory } from "../../blog-home-client";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ category: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  if (!isSupabaseAdminConfigured()) {
    return { title: "Category Not Found · Funda Blog" };
  }
  const { category: categorySlug } = await params;
  const client = createAdminClient();

  const { data: cat } = await client
    .from("blog_categories")
    .select("name, description")
    .eq("slug", categorySlug)
    .maybeSingle();

  if (!cat) {
    return {
      title: "Category Not Found · Funda Blog",
    };
  }

  return {
    title: `${cat.name} Guides & Articles · Funda Editorial`,
    description: cat.description || `Browse in-depth guides and tips on ${cat.name}.`,
    openGraph: {
      title: `${cat.name} Guides · Funda`,
      description: cat.description || `Browse in-depth guides and tips on ${cat.name}.`,
      url: `https://funda.ng/blog/category/${categorySlug}`,
    },
  };
}

export default async function BlogCategoryPage({ params }: PageProps) {
  if (!isSupabaseAdminConfigured()) {
    notFound();
  }
  const { category: categorySlug } = await params;
  const client = createAdminClient();

  const [catRes, allCatsRes, postsRes] = await Promise.all([
    client
      .from("blog_categories")
      .select("id, name, slug, description, icon, color")
      .eq("slug", categorySlug)
      .maybeSingle(),
    client
      .from("blog_categories")
      .select("id, name, slug, description, icon, color")
      .order("name", { ascending: true }),
    client
      .from("blog_posts")
      .select(
        "id, title, slug, excerpt, category_slug, tags, author_name, author_avatar, author_role, reading_time_minutes, views_count, likes_count, is_featured, featured_image, published_at"
      )
      .eq("status", "published")
      .order("is_featured", { ascending: false })
      .order("published_at", { ascending: false }),
  ]);

  const category = catRes.data;
  if (!category) {
    notFound();
  }

  const allCategories = (allCatsRes.data || []) as PublicCategory[];
  const allPosts = (postsRes.data || []) as PublicBlogPost[];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--background)" }}>
      <BlogNavHeader />

      {/* Category Hero Banner */}
      <section
        style={{
          borderBottom: "1px solid var(--border)",
          background: "linear-gradient(180deg, var(--surface) 0%, var(--background) 100%)",
          padding: "40px 20px 28px 20px",
        }}
      >
        <div style={{ maxWidth: "1180px", margin: "0 auto" }}>
          {/* Breadcrumb */}
          <div style={{ display: "flex", gap: "8px", fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
            <Link href="/" style={{ color: "inherit", textDecoration: "none" }} className="hover:underline">Home</Link>
            <span>/</span>
            <Link href="/blog" style={{ color: "inherit", textDecoration: "none" }} className="hover:underline">Blog</Link>
            <span>/</span>
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{category.name}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
            <span
              style={{
                fontSize: "24px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                background: "var(--accent-subtle, rgba(102, 0, 51, 0.08))",
              }}
            >
              {category.icon || "📂"}
            </span>
            <h1
              style={{
                fontSize: "clamp(26px, 3.5vw, 36px)",
                fontWeight: 800,
                color: "var(--text-primary)",
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              {category.name}
            </h1>
          </div>

          {category.description && (
            <p style={{ fontSize: "15px", color: "var(--text-muted)", maxWidth: "600px", margin: "0 0 0 60px", lineHeight: 1.5 }}>
              {category.description}
            </p>
          )}
        </div>
      </section>

      <main style={{ flex: 1 }}>
        <BlogHomeClient
          posts={allPosts}
          categories={allCategories}
          initialCategory={category.slug}
        />
      </main>

      <BlogFooter />
    </div>
  );
}
