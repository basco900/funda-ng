"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

export type PublicBlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  category_slug: string;
  tags: string[];
  author_name: string;
  author_avatar: string | null;
  author_role: string | null;
  reading_time_minutes: number;
  views_count: number;
  likes_count: number;
  is_featured: boolean;
  featured_image: string | null;
  published_at: string;
};

export type PublicCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
};

type Props = {
  posts: PublicBlogPost[];
  categories: PublicCategory[];
  initialCategory?: string;
};

export default function BlogHomeClient({ posts, categories, initialCategory = "all" }: Props) {
  const [activeCategory, setActiveCategory] = useState<string>(initialCategory);
  const [searchQuery, setSearchQuery] = useState("");

  const featuredPost = posts.find((p) => p.is_featured) || posts[0];

  const filteredPosts = posts.filter((post) => {
    if (activeCategory !== "all" && post.category_slug !== activeCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchTitle = post.title.toLowerCase().includes(q);
      const matchExcerpt = post.excerpt.toLowerCase().includes(q);
      const matchTag = post.tags.some((t) => t.toLowerCase().includes(q));
      if (!matchTitle && !matchExcerpt && !matchTag) return false;
    }
    return true;
  });

  const getCategoryName = (slug: string) => {
    const found = categories.find((c) => c.slug === slug);
    return found ? found.name : slug.replace("-", " ");
  };

  const allTags = Array.from(new Set(posts.flatMap((p) => p.tags))).slice(0, 16);

  return (
    <div style={{ maxWidth: "1180px", margin: "0 auto", padding: "32px 20px 80px 20px" }}>
      {/* ---------------------------------------------------- */}
      {/* BLOG HERO HEADER */}
      {/* ---------------------------------------------------- */}
      <section style={{ textAlign: "center", marginBottom: "40px" }}>
        <span
          style={{
            display: "inline-block",
            fontSize: "12px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--brand-primary, #660033)",
            background: "var(--accent-subtle, rgba(102, 0, 51, 0.08))",
            padding: "4px 12px",
            borderRadius: "20px",
            marginBottom: "14px",
          }}
        >
          Funda Editorial & Research
        </span>
        <h1
          style={{
            fontSize: "clamp(30px, 4.5vw, 46px)",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: "var(--text-primary)",
            margin: "0 0 14px 0",
            lineHeight: 1.15,
          }}
        >
          Practical Guides, Hacks & Telecom Insights
        </h1>
        <p
          style={{
            fontSize: "clamp(15px, 2vw, 18px)",
            color: "var(--text-muted)",
            maxWidth: "680px",
            margin: "0 auto",
            lineHeight: 1.6,
          }}
        >
          Everything you need to master your mobile data, slash electricity bills, protect your banking apps, and navigate Nigerian utility services effortlessly.
        </p>
      </section>

      {/* ---------------------------------------------------- */}
      {/* FEATURED STORY SPOTLIGHT (if on "all" and not searching) */}
      {/* ---------------------------------------------------- */}
      {activeCategory === "all" && !searchQuery && featuredPost && (
        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "16px",
            overflow: "hidden",
            marginBottom: "48px",
            boxShadow: "var(--shadow-md)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          }}
        >
          <div
            style={{
              position: "relative",
              minHeight: "280px",
              background: "#1e1e24",
            }}
          >
            {featuredPost.featured_image ? (
              <Image
                src={featuredPost.featured_image}
                alt={featuredPost.title}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                style={{ objectFit: "cover" }}
                priority
              />
            ) : null}
            <div
              style={{
                position: "absolute",
                top: "16px",
                left: "16px",
                background: "var(--brand-primary, #660033)",
                color: "#ffffff",
                fontSize: "11px",
                fontWeight: 700,
                padding: "4px 10px",
                borderRadius: "20px",
                boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
              }}
            >
              Featured Story
            </div>
          </div>

          <div
            style={{
              padding: "clamp(24px, 4vw, 36px)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--brand-primary, #660033)",
                  background: "var(--accent-subtle, rgba(102, 0, 51, 0.06))",
                  padding: "3px 8px",
                  borderRadius: "12px",
                }}
              >
                {getCategoryName(featuredPost.category_slug)}
              </span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                {featuredPost.reading_time_minutes} min read
              </span>
            </div>

            <h2
              style={{
                fontSize: "clamp(20px, 2.5vw, 26px)",
                fontWeight: 700,
                lineHeight: 1.3,
                margin: "0 0 12px 0",
                color: "var(--text-primary)",
              }}
            >
              <Link
                href={`/blog/${featuredPost.slug}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                {featuredPost.title}
              </Link>
            </h2>

            <p
              style={{
                fontSize: "15px",
                lineHeight: 1.6,
                color: "var(--text-secondary)",
                margin: "0 0 20px 0",
              }}
            >
              {featuredPost.excerpt}
            </p>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {featuredPost.author_avatar && (
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    <Image
                      src={featuredPost.author_avatar}
                      alt={featuredPost.author_name}
                      fill
                      sizes="32px"
                      style={{ objectFit: "cover" }}
                    />
                  </div>
                )}
                <div>
                  <strong style={{ fontSize: "13px", display: "block", color: "var(--text-primary)" }}>
                    {featuredPost.author_name}
                  </strong>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {new Date(featuredPost.published_at).toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>

              <Link
                href={`/blog/${featuredPost.slug}`}
                style={{
                  background: "var(--brand-primary, #660033)",
                  color: "#ffffff",
                  padding: "8px 18px",
                  borderRadius: "20px",
                  fontSize: "13px",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Read Article →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------- */}
      {/* SEARCH & CATEGORY FILTER BAR */}
      {/* ---------------------------------------------------- */}
      <section style={{ marginBottom: "36px" }}>
        {/* Search Input */}
        <div style={{ maxWidth: "540px", margin: "0 auto 24px auto", position: "relative" }}>
          <input
            type="search"
            placeholder="Search articles, telecom hacks, error codes, tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "14px 20px",
              borderRadius: "30px",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text-primary)",
              fontSize: "15px",
              boxShadow: "var(--shadow-sm)",
              outline: "none",
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              style={{
                position: "absolute",
                right: "16px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                fontSize: "13px",
              }}
            >
              Clear ✕
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveCategory("all")}
            style={{
              border: activeCategory === "all" ? "1px solid var(--brand-primary, #660033)" : "1px solid var(--border)",
              background: activeCategory === "all" ? "var(--brand-primary, #660033)" : "var(--surface)",
              color: activeCategory === "all" ? "#ffffff" : "var(--text-primary)",
              padding: "8px 16px",
              borderRadius: "20px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            All Articles ({posts.length})
          </button>

          {categories.map((cat) => {
            const count = posts.filter((p) => p.category_slug === cat.slug).length;
            const isActive = activeCategory === cat.slug;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.slug)}
                style={{
                  border: isActive ? "1px solid var(--brand-primary, #660033)" : "1px solid var(--border)",
                  background: isActive ? "var(--brand-primary, #660033)" : "var(--surface)",
                  color: isActive ? "#ffffff" : "var(--text-primary)",
                  padding: "8px 16px",
                  borderRadius: "20px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {cat.name} ({count})
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------------------------------------------------- */}
      {/* ARTICLES GRID */}
      {/* ---------------------------------------------------- */}
      <section>
        {filteredPosts.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "16px",
            }}
          >
            <p style={{ fontSize: "16px", color: "var(--text-muted)", margin: "0 0 14px 0" }}>
              No articles found matching &ldquo;{searchQuery}&rdquo;.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setActiveCategory("all");
              }}
              style={{
                background: "var(--brand-primary, #660033)",
                color: "#fff",
                border: "none",
                padding: "8px 16px",
                borderRadius: "20px",
                fontSize: "13px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: "28px",
            }}
          >
            {filteredPosts.map((post) => (
              <article
                key={post.id}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "14px",
                  overflow: "hidden",
                  boxShadow: "var(--shadow-sm)",
                  display: "flex",
                  flexDirection: "column",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                }}
                className="hover:-translate-y-1 hover:shadow-md"
              >
                {/* Cover Image */}
                <Link
                  href={`/blog/${post.slug}`}
                  style={{
                    position: "relative",
                    width: "100%",
                    height: "190px",
                    display: "block",
                    background: "#1e1e24",
                  }}
                >
                  {post.featured_image ? (
                    <Image
                      src={post.featured_image}
                      alt={post.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 360px"
                      style={{ objectFit: "cover" }}
                    />
                  ) : null}
                  <span
                    style={{
                      position: "absolute",
                      bottom: "12px",
                      left: "12px",
                      background: "rgba(0, 0, 0, 0.72)",
                      backdropFilter: "blur(4px)",
                      color: "#ffffff",
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: "6px",
                    }}
                  >
                    {getCategoryName(post.category_slug)}
                  </span>
                </Link>

                {/* Body */}
                <div style={{ padding: "20px", display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      {new Date(post.published_at).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>·</span>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      {post.reading_time_minutes} min read
                    </span>
                  </div>

                  <h3
                    style={{
                      fontSize: "17px",
                      fontWeight: 700,
                      lineHeight: 1.4,
                      margin: "0 0 10px 0",
                      color: "var(--text-primary)",
                      flex: "0 0 auto",
                    }}
                  >
                    <Link
                      href={`/blog/${post.slug}`}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      {post.title}
                    </Link>
                  </h3>

                  <p
                    style={{
                      fontSize: "13px",
                      lineHeight: 1.6,
                      color: "var(--text-secondary)",
                      margin: "0 0 16px 0",
                      flex: 1,
                    }}
                  >
                    {post.excerpt.length > 120 ? post.excerpt.slice(0, 120) + "..." : post.excerpt}
                  </p>

                  {/* Footer stats & author */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingTop: "14px",
                      borderTop: "1px solid var(--border-subtle)",
                      fontSize: "12px",
                    }}
                  >
                    <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>
                      By {post.author_name}
                    </span>

                    <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--text-muted)" }}>
                      <span>👁 {post.views_count.toLocaleString()}</span>
                      <span>❤️ {post.likes_count}</span>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ---------------------------------------------------- */}
      {/* POPULAR TAGS CLOUD */}
      {/* ---------------------------------------------------- */}
      {allTags.length > 0 && (
        <section
          style={{
            marginTop: "56px",
            padding: "24px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "14px",
            textAlign: "center",
          }}
        >
          <h4 style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 14px 0", color: "var(--text-primary)" }}>
            Explore Topics & Popular Tags
          </h4>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px" }}>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setSearchQuery(tag)}
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--surface-subtle)",
                  color: "var(--text-secondary)",
                  padding: "4px 10px",
                  borderRadius: "14px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                #{tag}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------- */}
      {/* BOTTOM FUNDA PROMO CALLOUT */}
      {/* ---------------------------------------------------- */}
      <section
        style={{
          marginTop: "64px",
          background: "linear-gradient(135deg, #660033 0%, #3d001f 100%)",
          color: "#ffffff",
          borderRadius: "18px",
          padding: "clamp(32px, 5vw, 48px)",
          textAlign: "center",
          boxShadow: "0 14px 35px rgba(102, 0, 51, 0.25)",
        }}
      >
        <span
          style={{
            display: "inline-block",
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            background: "rgba(255, 255, 255, 0.15)",
            padding: "4px 12px",
            borderRadius: "20px",
            marginBottom: "16px",
          }}
        >
          Never Pay Full Price for Bills Again
        </span>
        <h2 style={{ fontSize: "clamp(24px, 3.5vw, 34px)", fontWeight: 800, margin: "0 0 12px 0" }}>
          Ready to experience instant utilities with real cashback?
        </h2>
        <p style={{ fontSize: "16px", opacity: 0.9, maxWidth: "600px", margin: "0 auto 28px auto", lineHeight: 1.6 }}>
          Buy SME data, recharge prepaid meters, subscribe to DStv, and generate exam PINs in under 3 seconds with guaranteed cashback credited back to your wallet.
        </p>

        <div style={{ display: "flex", justifyContent: "center", gap: "12px", flexWrap: "wrap" }}>
          <Link
            href="/dashboard"
            style={{
              background: "#ffffff",
              color: "#660033",
              padding: "12px 28px",
              borderRadius: "30px",
              fontSize: "14px",
              fontWeight: 700,
              textDecoration: "none",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            }}
          >
            Open Funda Dashboard →
          </Link>
          <Link
            href="/services"
            style={{
              background: "rgba(255, 255, 255, 0.12)",
              color: "#ffffff",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              padding: "12px 24px",
              borderRadius: "30px",
              fontSize: "14px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Explore Services
          </Link>
        </div>
      </section>
    </div>
  );
}
