import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/admin";
import BlogNavHeader from "@/components/blog/blog-nav-header";
import BlogFooter from "@/components/blog/blog-footer";
import MarkdownRenderer from "@/components/blog/markdown-renderer";
import BlogActionBar from "@/components/blog/blog-action-bar";
import BlogCommentsSection, { type BlogCommentItem } from "@/components/blog/blog-comments-section";
import BlogViewCounter from "@/components/blog/blog-view-counter";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const client = createAdminClient();

  const { data: post } = await client
    .from("blog_posts")
    .select("title, excerpt, featured_image, author_name, tags, published_at")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (!post) {
    return {
      title: "Article Not Found · Funda Blog",
    };
  }

  const postUrl = `https://funda.ng/blog/${slug}`;

  return {
    title: `${post.title} · Funda Editorial`,
    description: post.excerpt,
    keywords: post.tags || [],
    authors: [{ name: post.author_name || "Funda Editorial" }],
    openGraph: {
      title: post.title,
      description: post.excerpt,
      url: postUrl,
      siteName: "Funda",
      type: "article",
      publishedTime: post.published_at,
      images: post.featured_image
        ? [
            {
              url: post.featured_image,
              width: 1200,
              height: 630,
              alt: post.title,
            },
          ]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
      images: post.featured_image ? [post.featured_image] : [],
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const client = createAdminClient();

  // 1. Fetch Post
  const { data: post } = await client
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (!post) {
    notFound();
  }

  // 2. Fetch Category, Comments, Related Posts in Parallel
  const [catRes, commentsRes, relatedRes] = await Promise.all([
    client
      .from("blog_categories")
      .select("id, name, slug, description, color, icon")
      .eq("slug", post.category_slug)
      .maybeSingle(),
    client
      .from("blog_comments")
      .select("id, post_id, parent_id, author_name, content, is_admin_reply, likes_count, created_at")
      .eq("post_id", post.id)
      .eq("is_approved", true)
      .order("created_at", { ascending: true }),
    client
      .from("blog_posts")
      .select("id, title, slug, excerpt, category_slug, featured_image, reading_time_minutes, published_at")
      .eq("status", "published")
      .neq("id", post.id)
      .order("published_at", { ascending: false })
      .limit(3),
  ]);

  const category = catRes.data;
  const comments = (commentsRes.data || []) as BlogCommentItem[];
  const relatedPosts = relatedRes.data || [];

  const postUrl = `https://funda.ng/blog/${post.slug}`;
  const formattedDate = new Date(post.published_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Contextual utility banner mapping
  const utilityPromo = getContextualPromo(post.category_slug);

  // Structured Data (JSON-LD) for Rich Article Snippets
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    image: post.featured_image ? [post.featured_image] : [],
    datePublished: post.published_at,
    dateModified: post.updated_at || post.published_at,
    author: {
      "@type": "Person",
      name: post.author_name || "Funda Staff",
    },
    publisher: {
      "@type": "Organization",
      name: "Funda Technologies Ltd",
      logo: {
        "@type": "ImageObject",
        url: "https://funda.ng/brand/funda-logo.png",
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": postUrl,
    },
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--background)" }}>
      {/* Dynamic View Counter */}
      <BlogViewCounter slug={post.slug} />

      {/* JSON-LD Article Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <BlogNavHeader />

      <main style={{ flex: 1, padding: "32px 20px 80px 20px" }}>
        <article style={{ maxWidth: "840px", margin: "0 auto" }}>
          {/* Breadcrumbs */}
          <nav
            aria-label="Breadcrumb"
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
              fontSize: "13px",
              color: "var(--text-muted)",
              marginBottom: "24px",
            }}
          >
            <Link href="/" style={{ color: "inherit", textDecoration: "none" }} className="hover:underline">
              Home
            </Link>
            <span>/</span>
            <Link href="/blog" style={{ color: "inherit", textDecoration: "none" }} className="hover:underline">
              Blog
            </Link>
            {category && (
              <>
                <span>/</span>
                <Link
                  href={`/blog/category/${category.slug}`}
                  style={{ color: "inherit", textDecoration: "none" }}
                  className="hover:underline"
                >
                  {category.name}
                </Link>
              </>
            )}
          </nav>

          {/* Category Pill & Reading Time */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
            <Link
              href={`/blog/category/${post.category_slug}`}
              style={{
                display: "inline-block",
                padding: "4px 12px",
                borderRadius: "20px",
                fontSize: "12px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                background: "var(--accent-subtle, rgba(102, 0, 51, 0.08))",
                color: "var(--brand-primary, #660033)",
                textDecoration: "none",
              }}
            >
              {category ? category.name : post.category_slug.replace("-", " ")}
            </Link>
            <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>•</span>
            <span style={{ fontSize: "13px", color: "var(--text-muted)", fontWeight: 500 }}>
              ⏱️ {post.reading_time_minutes} min read
            </span>
          </div>

          {/* Title */}
          <h1
            style={{
              fontSize: "clamp(28px, 4vw, 44px)",
              fontWeight: 800,
              lineHeight: 1.2,
              letterSpacing: "-0.03em",
              color: "var(--text-primary)",
              margin: "0 0 16px 0",
            }}
          >
            {post.title}
          </h1>

          {/* Excerpt / Lead */}
          {post.excerpt && (
            <p
              style={{
                fontSize: "clamp(16px, 2vw, 19px)",
                lineHeight: 1.6,
                color: "var(--text-muted)",
                margin: "0 0 28px 0",
              }}
            >
              {post.excerpt}
            </p>
          )}

          {/* Author Byline & Stats */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "16px",
              paddingBottom: "24px",
              marginBottom: "32px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  background: "var(--brand-primary, #660033)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "17px",
                  flexShrink: 0,
                  boxShadow: "0 2px 8px rgba(102, 0, 51, 0.2)",
                }}
              >
                {post.author_name ? post.author_name.charAt(0) : "F"}
              </div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
                  {post.author_name || "Funda Editorial"}
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  {post.author_role || "Staff Writer"} · Published {formattedDate}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "13px", color: "var(--text-muted)" }}>
              <span>👁️ {post.views_count.toLocaleString()} views</span>
              <span>❤️ {post.likes_count.toLocaleString()} likes</span>
            </div>
          </div>

          {/* Featured Image */}
          {post.featured_image && (
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "auto",
                aspectRatio: "16 / 9",
                borderRadius: "16px",
                overflow: "hidden",
                marginBottom: "40px",
                boxShadow: "0 8px 30px rgba(0, 0, 0, 0.08)",
                border: "1px solid var(--border)",
              }}
            >
              <Image
                src={post.featured_image}
                alt={post.title}
                fill
                priority
                sizes="(max-width: 840px) 100vw, 840px"
                style={{ objectFit: "cover" }}
              />
            </div>
          )}

          {/* Main Article Content */}
          <div
            style={{
              fontSize: "16px",
              lineHeight: 1.8,
              color: "var(--text-primary)",
            }}
          >
            <MarkdownRenderer content={post.content} />
          </div>

          {/* Tag Badges */}
          {post.tags && post.tags.length > 0 && (
            <div style={{ marginTop: "40px", paddingTop: "24px", borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "12px" }}>
                Related Tags
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {post.tags.map((tag: string) => (
                  <Link
                    key={tag}
                    href={`/blog/tag/${encodeURIComponent(tag.toLowerCase())}`}
                    style={{
                      fontSize: "12px",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                      textDecoration: "none",
                      transition: "all 0.15s ease",
                    }}
                    className="hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Social Share & Action Bar */}
          <BlogActionBar
            postId={post.id}
            initialLikes={post.likes_count}
            title={post.title}
            url={postUrl}
          />

          {/* Contextual Funda Utility Card */}
          <div
            style={{
              background: "linear-gradient(135deg, rgba(102, 0, 51, 0.06) 0%, rgba(217, 180, 106, 0.1) 100%)",
              border: "1px solid rgba(102, 0, 51, 0.15)",
              borderRadius: "16px",
              padding: "28px 24px",
              margin: "40px 0",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "24px" }}>{utilityPromo.emoji}</span>
              <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--brand-primary, #660033)", margin: 0 }}>
                {utilityPromo.title}
              </h3>
            </div>
            <p style={{ fontSize: "14px", lineHeight: 1.6, color: "var(--text-primary)", margin: 0 }}>
              {utilityPromo.description}
            </p>
            <div>
              <Link
                href={utilityPromo.ctaLink}
                style={{
                  display: "inline-block",
                  padding: "10px 20px",
                  borderRadius: "10px",
                  background: "var(--brand-primary, #660033)",
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: 600,
                  textDecoration: "none",
                  boxShadow: "0 2px 8px rgba(102, 0, 51, 0.25)",
                }}
              >
                {utilityPromo.ctaText}
              </Link>
            </div>
          </div>

          {/* Comments & Questions Q&A Section */}
          <BlogCommentsSection postId={post.id} initialComments={comments} />

          {/* Related Articles Grid */}
          {relatedPosts.length > 0 && (
            <section style={{ marginTop: "60px", paddingTop: "40px", borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
                <h3 style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
                  You Might Also Like
                </h3>
                <Link
                  href="/blog"
                  style={{ fontSize: "13px", fontWeight: 600, color: "var(--brand-primary, #660033)", textDecoration: "none" }}
                  className="hover:underline"
                >
                  View all guides →
                </Link>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                  gap: "20px",
                }}
              >
                {relatedPosts.map((related) => (
                  <Link
                    key={related.id}
                    href={`/blog/${related.slug}`}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      borderRadius: "12px",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      overflow: "hidden",
                      textDecoration: "none",
                      color: "inherit",
                      transition: "transform 0.15s ease, box-shadow 0.15s ease",
                    }}
                    className="hover:translate-y-[-2px] hover:shadow-md"
                  >
                    {related.featured_image && (
                      <div style={{ position: "relative", width: "100%", height: "140px" }}>
                        <Image
                          src={related.featured_image}
                          alt={related.title}
                          fill
                          sizes="(max-width: 600px) 100vw, 300px"
                          style={{ objectFit: "cover" }}
                        />
                      </div>
                    )}
                    <div style={{ padding: "14px", display: "flex", flexDirection: "column", flex: 1 }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          color: "var(--brand-primary, #660033)",
                          marginBottom: "6px",
                        }}
                      >
                        {related.category_slug.replace("-", " ")}
                      </span>
                      <h4
                        style={{
                          fontSize: "14px",
                          fontWeight: 700,
                          lineHeight: 1.4,
                          color: "var(--text-primary)",
                          margin: "0 0 8px 0",
                        }}
                      >
                        {related.title}
                      </h4>
                      <p
                        style={{
                          fontSize: "12px",
                          color: "var(--text-muted)",
                          lineHeight: 1.5,
                          margin: "0 0 12px 0",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {related.excerpt}
                      </p>
                      <div style={{ marginTop: "auto", fontSize: "11px", color: "var(--text-muted)", fontWeight: 500 }}>
                        ⏱️ {related.reading_time_minutes} min read
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </article>
      </main>

      <BlogFooter />
    </div>
  );
}

function getContextualPromo(categorySlug: string) {
  switch (categorySlug) {
    case "telecoms-data":
      return {
        emoji: "⚡",
        title: "Tired of Data Draining Too Fast?",
        description:
          "Buy affordable SME and corporate gifting data for MTN, Airtel, Glo & 9mobile. Automated 5-second fulfillment directly to your SIM.",
        ctaText: "Buy Cheap Data on Funda →",
        ctaLink: "/dashboard",
      };
    case "electricity-utilities":
      return {
        emoji: "💡",
        title: "Recharge Your Prepaid Meter in Seconds",
        description:
          "Get your 20-digit electricity token instantly for AEDC, EKEDC, IKEDC, IBEDC, and all discos with zero downtime.",
        ctaText: "Buy Electricity Token →",
        ctaLink: "/dashboard",
      };
    case "education-exams":
      return {
        emoji: "🎓",
        title: "Instant WAEC, NECO & JAMB e-PINs",
        description:
          "Purchase verified examination scratch cards and check your results without visiting cyber cafes. Pin displayed immediately on screen.",
        ctaText: "Get Exam Scratch Cards →",
        ctaLink: "/dashboard",
      };
    case "cable-tv":
      return {
        emoji: "📺",
        title: "Renew DStv, GOtv or Startimes Automatically",
        description:
          "Clear error codes and activate your decoder within 60 seconds with Funda's direct satellite integration.",
        ctaText: "Recharge Decoder Now →",
        ctaLink: "/dashboard",
      };
    case "fintech-payments":
      return {
        emoji: "💳",
        title: "Instant Wallet Funding with Dedicated Accounts",
        description:
          "Experience zero-failed bank transfers with your personal virtual account on Funda. Free, secure and credits instantly.",
        ctaText: "Explore Funda Wallet →",
        ctaLink: "/dashboard",
      };
    default:
      return {
        emoji: "🚀",
        title: "Fund Every Everyday Utility with Funda",
        description:
          "Nigeria's fastest portal for airtime, data, electricity, cable TV, and exam scratch cards with cashbacks on every purchase.",
        ctaText: "Start Transacting on Funda →",
        ctaLink: "/dashboard",
      };
  }
}
