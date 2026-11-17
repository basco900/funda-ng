import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import BlogNavHeader from "@/components/blog/blog-nav-header";
import BlogFooter from "@/components/blog/blog-footer";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tag: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tag: rawTag } = await params;
  const tag = decodeURIComponent(rawTag);

  return {
    title: `Posts tagged #${tag} · Funda Blog`,
    description: `Explore all tutorials, research, and guides tagged with #${tag} on Funda.`,
  };
}

export default async function BlogTagPage({ params }: PageProps) {
  const { tag: rawTag } = await params;
  const decodedTag = decodeURIComponent(rawTag).toLowerCase();
  const [postsRes, catsRes] = isSupabaseAdminConfigured()
    ? await (async () => {
        const client = createAdminClient();
        return Promise.all([
          client
            .from("blog_posts")
            .select(
              "id, title, slug, excerpt, category_slug, tags, author_name, author_avatar, reading_time_minutes, views_count, likes_count, featured_image, published_at"
            )
            .eq("status", "published")
            .order("published_at", { ascending: false }),
          client.from("blog_categories").select("slug, name"),
        ]);
      })()
    : [{ data: [] }, { data: [] }];

  const allPosts = postsRes.data || [];
  const categories = catsRes.data || [];

  const getCategoryName = (slug: string) => {
    const found = categories.find((c) => c.slug === slug);
    return found ? found.name : slug.replace("-", " ");
  };

  // Case-insensitive matching across tags array
  const matchedPosts = allPosts.filter((post) =>
    (post.tags || []).some((t: string) => t.toLowerCase() === decodedTag)
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--background)" }}>
      <BlogNavHeader />

      <main style={{ flex: 1, maxWidth: "1180px", margin: "0 auto", padding: "40px 20px 80px 20px", width: "100%" }}>
        {/* Breadcrumb */}
        <div style={{ display: "flex", gap: "8px", fontSize: "13px", color: "var(--text-muted)", marginBottom: "20px" }}>
          <Link href="/" style={{ color: "inherit", textDecoration: "none" }} className="hover:underline">Home</Link>
          <span>/</span>
          <Link href="/blog" style={{ color: "inherit", textDecoration: "none" }} className="hover:underline">Blog</Link>
          <span>/</span>
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>#{decodedTag}</span>
        </div>

        {/* Header */}
        <div style={{ marginBottom: "36px" }}>
          <span
            style={{
              fontSize: "12px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--brand-primary, #660033)",
              background: "var(--accent-subtle, rgba(102, 0, 51, 0.08))",
              padding: "4px 12px",
              borderRadius: "20px",
              display: "inline-block",
              marginBottom: "12px",
            }}
          >
            Tag Archive
          </span>
          <h1
            style={{
              fontSize: "clamp(26px, 3.5vw, 38px)",
              fontWeight: 800,
              color: "var(--text-primary)",
              margin: "0 0 10px 0",
              letterSpacing: "-0.02em",
            }}
          >
            Posts tagged <span style={{ color: "var(--brand-primary, #660033)" }}>#{decodedTag}</span>
          </h1>
          <p style={{ fontSize: "15px", color: "var(--text-muted)", margin: 0 }}>
            Found {matchedPosts.length} {matchedPosts.length === 1 ? "article" : "articles"} matching this tag.
          </p>
        </div>

        {/* Posts Grid */}
        {matchedPosts.length === 0 ? (
          <div
            style={{
              padding: "60px 20px",
              textAlign: "center",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "16px",
            }}
          >
            <div style={{ fontSize: "36px", marginBottom: "12px" }}>🔍</div>
            <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 8px 0" }}>No articles found with this tag</h3>
            <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "20px" }}>
              Try browsing all blog topics or search by a keyword.
            </p>
            <Link
              href="/blog"
              style={{
                display: "inline-block",
                padding: "8px 18px",
                borderRadius: "8px",
                background: "var(--brand-primary, #660033)",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Back to all articles →
            </Link>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: "24px",
            }}
          >
            {matchedPosts.map((post) => {
              const formattedDate = new Date(post.published_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              });

              return (
                <article
                  key={post.id}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "16px",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  }}
                  className="hover:translate-y-[-2px] hover:shadow-lg"
                >
                  {post.featured_image && (
                    <Link href={`/blog/${post.slug}`} style={{ position: "relative", width: "100%", height: "200px", display: "block" }}>
                      <Image
                        src={post.featured_image}
                        alt={post.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 360px"
                        style={{ objectFit: "cover" }}
                      />
                    </Link>
                  )}

                  <div style={{ padding: "20px", display: "flex", flexDirection: "column", flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                      <Link
                        href={`/blog/category/${post.category_slug}`}
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          color: "var(--brand-primary, #660033)",
                          textDecoration: "none",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {getCategoryName(post.category_slug)}
                      </Link>
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        ⏱️ {post.reading_time_minutes} min read
                      </span>
                    </div>

                    <h2
                      style={{
                        fontSize: "18px",
                        fontWeight: 700,
                        lineHeight: 1.35,
                        color: "var(--text-primary)",
                        margin: "0 0 10px 0",
                      }}
                    >
                      <Link
                        href={`/blog/${post.slug}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                        className="hover:text-[var(--brand-primary)]"
                      >
                        {post.title}
                      </Link>
                    </h2>

                    <p
                      style={{
                        fontSize: "13px",
                        lineHeight: 1.6,
                        color: "var(--text-muted)",
                        margin: "0 0 16px 0",
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {post.excerpt}
                    </p>

                    <div
                      style={{
                        marginTop: "auto",
                        paddingTop: "14px",
                        borderTop: "1px solid var(--border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: "12px",
                        color: "var(--text-muted)",
                      }}
                    >
                      <span>{formattedDate}</span>
                      <Link
                        href={`/blog/${post.slug}`}
                        style={{
                          fontWeight: 600,
                          color: "var(--brand-primary, #660033)",
                          textDecoration: "none",
                        }}
                        className="hover:underline"
                      >
                        Read guide →
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <BlogFooter />
    </div>
  );
}
