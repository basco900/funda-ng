"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import AdminIcon from "../(console)/admin-icon";
import { AdminFeedback } from "../(console)/admin-ui";
import { createBlogPost, updateBlogPost } from "./actions";
import styles from "../admin.module.css";

const PRESET_IMAGES = [
  { label: "Data / Mobile", url: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=1200&q=80" },
  { label: "Electricity / Power", url: "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=1200&q=80" },
  { label: "Fintech / Cards", url: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=1200&q=80" },
  { label: "Education / Exams", url: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1200&q=80" },
  { label: "Cable TV / Media", url: "https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?auto=format&fit=crop&w=1200&q=80" },
  { label: "Cybersecurity", url: "https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=1200&q=80" },
  { label: "Savings / Coins", url: "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?auto=format&fit=crop&w=1200&q=80" },
];

export type PostFormData = {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featured_image: string | null;
  category_slug: string;
  tags: string[];
  author_name: string;
  author_role: string;
  status: "published" | "draft";
  is_featured: boolean;
};

type Props = {
  initialData?: PostFormData;
  categories: { id: string; name: string; slug: string }[];
  adminName: string;
};

export default function PostEditor({ initialData, categories, adminName }: Props) {
  const isEditing = Boolean(initialData?.id);
  const [title, setTitle] = useState(initialData?.title || "");
  const [slug, setSlug] = useState(initialData?.slug || "");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(Boolean(initialData?.slug));
  const [excerpt, setExcerpt] = useState(initialData?.excerpt || "");
  const [content, setContent] = useState(initialData?.content || "");
  const [categorySlug, setCategorySlug] = useState(initialData?.category_slug || "telecoms-data");
  const [featuredImage, setFeaturedImage] = useState(initialData?.featured_image || "");
  const [tagsInput, setTagsInput] = useState(initialData?.tags?.join(", ") || "");
  const [authorName, setAuthorName] = useState(initialData?.author_name || adminName || "Funda Editorial");
  const [authorRole, setAuthorRole] = useState(initialData?.author_role || "Staff Writer");
  const [status, setStatus] = useState<"published" | "draft">(initialData?.status || "published");
  const [isFeatured, setIsFeatured] = useState(initialData?.is_featured || false);

  // AI Generator state
  const [aiNotes, setAiNotes] = useState("");
  const [aiTone, setAiTone] = useState<string>("practical_guide");
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiBannerVisible, setAiBannerVisible] = useState(true);

  // Editor View Mode
  const [activeTab, setActiveTab] = useState<"write" | "preview">("write");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!slugManuallyEdited) {
      setSlug(
        val
          .toLowerCase()
          .trim()
          .replace(/[^\w\s-]/g, "")
          .replace(/[\s_-]+/g, "-")
          .replace(/^-+|-+$/g, "")
      );
    }
  };

  const handleAiGenerate = async () => {
    if (!title && !aiNotes) {
      setFeedback({ type: "error", text: "Please enter a title or rough notes for the AI to develop." });
      return;
    }

    setIsAiGenerating(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/blog/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          roughNotes: aiNotes,
          category: categorySlug,
          tone: aiTone,
          action: "generate_full",
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "AI generation failed");
      }

      const generated = await res.json();

      if (generated.title) {
        setTitle(generated.title);
        if (!slugManuallyEdited) setSlug(generated.slug);
      }
      if (generated.excerpt) setExcerpt(generated.excerpt);
      if (generated.content) setContent(generated.content);
      if (generated.suggestedTags?.length) setTagsInput(generated.suggestedTags.join(", "));

      setFeedback({
        type: "success",
        text: `✨ AI generated a ${generated.readingTimeMinutes}-minute post! Review and tweak below.`,
      });
      setActiveTab("write");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "AI generation error";
      setFeedback({ type: "error", text: msg });
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setFeedback({ type: "error", text: "Please provide both a Title and Content." });
      return;
    }

    const formData = new FormData();
    formData.append("title", title);
    formData.append("slug", slug);
    formData.append("excerpt", excerpt);
    formData.append("content", content);
    formData.append("categorySlug", categorySlug);
    formData.append("featuredImage", featuredImage);
    formData.append("authorName", authorName);
    formData.append("authorRole", authorRole);
    formData.append("status", status);
    formData.append("isFeatured", isFeatured ? "true" : "false");
    formData.append("tags", tagsInput);

    startTransition(async () => {
      let res;
      if (isEditing && initialData?.id) {
        res = await updateBlogPost(initialData.id, formData);
      } else {
        res = await createBlogPost(formData);
      }

      if (res?.error) {
        setFeedback({ type: "error", text: res.error });
      }
    });
  };

  return (
    <div className={styles.workspacePage}>
      <header className={styles.pageHeading}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <Link
              href="/admin/blog"
              style={{
                fontSize: "12px",
                color: "var(--admin-muted)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              ← Back to All Articles
            </Link>
          </div>
          <h1>{isEditing ? "Edit Blog Post" : "Add New Blog Post"}</h1>
        </div>

        <div className={styles.pageHeadingActions}>
          <Link href="/admin/blog" className={styles.secondaryButton}>
            Cancel
          </Link>
          <button
            type="button"
            className={status === "published" ? styles.primaryButton : styles.secondaryButton}
            onClick={() => {
              setStatus((prev) => (prev === "published" ? "draft" : "published"));
            }}
          >
            {status === "published" ? "● Set to Draft" : "○ Set to Published"}
          </button>
        </div>
      </header>

      {feedback && (
        <AdminFeedback
          tone={feedback.type}
          text={feedback.text}
          onClose={() => setFeedback(null)}
        />
      )}

      {/* ---------------------------------------------------- */}
      {/* ✨ AI WRITING ASSISTANT CARD */}
      {/* ---------------------------------------------------- */}
      {aiBannerVisible && (
        <section
          style={{
            background: "linear-gradient(135deg, rgba(102, 0, 51, 0.04) 0%, rgba(217, 180, 106, 0.08) 100%)",
            border: "1px solid rgba(102, 0, 51, 0.16)",
            borderRadius: "8px",
            padding: "18px 20px",
            marginBottom: "20px",
            position: "relative",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  background: "var(--admin-green)",
                  color: "#fff",
                  padding: "4px 8px",
                  borderRadius: "5px",
                  fontSize: "12px",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                ✨ AI Writer Studio
              </span>
              <strong style={{ fontSize: "14px", color: "var(--admin-ink)" }}>
                Generate or Expand Blog Post with Full AI Capacity
              </strong>
            </div>

            <button
              type="button"
              onClick={() => setAiBannerVisible(false)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--admin-muted)",
                fontSize: "12px",
              }}
            >
              Hide AI Assistant ✕
            </button>
          </div>

          <p style={{ fontSize: "12px", color: "var(--admin-muted)", margin: "0 0 14px 0", lineHeight: 1.5 }}>
            Enter a rough working title and jot down bullet points, ideas, or unstructured notes below. The AI will polish your title, draft an SEO excerpt, write in-depth structured markdown with headings & tables, and suggest tags!
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 200px 140px", gap: "12px", alignItems: "flex-end" }}>
            <div>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--admin-ink)", display: "block", marginBottom: "4px" }}>
                Rough Notes, Bullet Points, or Topic Outline
              </label>
              <textarea
                placeholder="e.g. - how to clear error E16 on GOTV without customer care&#10;- keep decoder on&#10;- dial USSD *288# or send SMS&#10;- mention Funda instant recharge"
                value={aiNotes}
                onChange={(e) => setAiNotes(e.target.value)}
                rows={3}
                style={{
                  width: "100%",
                  fontSize: "12px",
                  fontFamily: "inherit",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--admin-line)",
                  background: "var(--admin-surface)",
                  resize: "vertical",
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--admin-ink)", display: "block", marginBottom: "4px" }}>
                Editorial Tone
              </label>
              <select
                value={aiTone}
                onChange={(e) => setAiTone(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 8px",
                  borderRadius: "6px",
                  border: "1px solid var(--admin-line)",
                  background: "var(--admin-surface)",
                  fontSize: "12px",
                }}
              >
                <option value="practical_guide">Practical Guide / How-To</option>
                <option value="informative">Informative & Analysis</option>
                <option value="engaging_story">Engaging & Storytelling</option>
                <option value="announcement">Product Announcement</option>
              </select>
            </div>

            <div>
              <button
                type="button"
                onClick={handleAiGenerate}
                disabled={isAiGenerating}
                className={styles.primaryButton}
                style={{ width: "100%", height: "40px", justifyContent: "center" }}
              >
                {isAiGenerating ? "Generating..." : "✨ AI Write"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------- */}
      {/* MAIN POST EDITOR FORM */}
      {/* ---------------------------------------------------- */}
      <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "24px" }}>
        {/* Left Column: Title, Content, Excerpt */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div className={styles.workspacePanel} style={{ padding: "20px" }}>
            <label style={{ display: "block", marginBottom: "16px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                Post Title *
              </span>
              <input
                type="text"
                required
                placeholder="e.g. How to Save ₦25,000 Monthly on Everyday Bills"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                style={{
                  width: "100%",
                  fontSize: "16px",
                  fontWeight: 600,
                  padding: "10px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--admin-line)",
                  background: "var(--admin-surface)",
                }}
              />
            </label>

            <label style={{ display: "block", marginBottom: "16px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                URL Slug (funda.ng/blog/...)
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--admin-muted)" }}>/blog/</span>
                <input
                  type="text"
                  required
                  placeholder="post-url-slug"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setSlugManuallyEdited(true);
                  }}
                  style={{
                    flex: 1,
                    fontSize: "13px",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: "1px solid var(--admin-line)",
                    background: "var(--admin-surface)",
                  }}
                />
              </div>
            </label>

            <label style={{ display: "block" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                Short Excerpt (SEO & Card Previews)
              </span>
              <textarea
                rows={2}
                placeholder="A compelling 1-2 sentence preview for social cards and search engines..."
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                style={{
                  width: "100%",
                  fontSize: "13px",
                  fontFamily: "inherit",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--admin-line)",
                  background: "var(--admin-surface)",
                  resize: "vertical",
                }}
              />
            </label>
          </div>

          {/* Content Editor with Write vs Live Preview Tabs */}
          <div className={styles.workspacePanel} style={{ padding: "20px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px solid var(--admin-line)",
                paddingBottom: "10px",
                marginBottom: "14px",
              }}
            >
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setActiveTab("write")}
                  style={{
                    border: "none",
                    background: activeTab === "write" ? "var(--admin-green-soft)" : "transparent",
                    color: activeTab === "write" ? "var(--admin-green)" : "var(--admin-muted)",
                    fontWeight: 600,
                    padding: "6px 12px",
                    borderRadius: "5px",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  Write (Markdown)
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("preview")}
                  style={{
                    border: "none",
                    background: activeTab === "preview" ? "var(--admin-green-soft)" : "transparent",
                    color: activeTab === "preview" ? "var(--admin-green)" : "var(--admin-muted)",
                    fontWeight: 600,
                    padding: "6px 12px",
                    borderRadius: "5px",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  Live Preview
                </button>
              </div>

              <span style={{ fontSize: "11px", color: "var(--admin-muted)" }}>
                Supports # Heading, ## H2, ### H3, - bullets, &gt; callouts, | tables |
              </span>
            </div>

            {activeTab === "write" ? (
              <textarea
                required
                rows={22}
                placeholder="# Introduction&#10;&#10;Write your in-depth blog post here in GitHub Flavored Markdown..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                style={{
                  width: "100%",
                  fontSize: "13px",
                  lineHeight: "1.6",
                  fontFamily: 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
                  padding: "12px",
                  borderRadius: "6px",
                  border: "1px solid var(--admin-line)",
                  background: "var(--admin-surface)",
                  resize: "vertical",
                }}
              />
            ) : (
              <div
                style={{
                  minHeight: "400px",
                  padding: "16px",
                  background: "var(--admin-surface-soft)",
                  borderRadius: "6px",
                  border: "1px solid var(--admin-line)",
                  fontSize: "14px",
                  lineHeight: "1.7",
                  overflowY: "auto",
                }}
              >
                {content ? (
                  <div style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
                    {content}
                  </div>
                ) : (
                  <p style={{ color: "var(--admin-muted)", fontStyle: "italic" }}>
                    Nothing written yet. Write content or use the AI Writer to see a preview.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Settings, Category, Featured Image, Status */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Publishing Box */}
          <div className={styles.workspacePanel} style={{ padding: "18px" }}>
            <h3 style={{ margin: "0 0 14px 0", fontSize: "13px", fontWeight: 700 }}>
              Publishing Options
            </h3>

            <div style={{ marginBottom: "14px" }}>
              <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "published" | "draft")}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--admin-line)",
                  background: "var(--admin-surface)",
                  fontSize: "12px",
                  fontWeight: 600,
                }}
              >
                <option value="published">🚀 Published (Live on Site)</option>
                <option value="draft">📝 Draft (Private)</option>
              </select>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
              />
              <span style={{ fontSize: "12px", fontWeight: 500 }}>
                Set as Featured Story (Hero Banner)
              </span>
            </label>

            <button
              type="submit"
              disabled={isPending}
              className={styles.primaryButton}
              style={{ width: "100%", justifyContent: "center", height: "38px" }}
            >
              {isPending
                ? "Saving..."
                : isEditing
                ? "Save & Update Post"
                : status === "published"
                ? "Publish Article Now"
                : "Save as Draft"}
            </button>
          </div>

          {/* Category & Tags Box */}
          <div className={styles.workspacePanel} style={{ padding: "18px" }}>
            <h3 style={{ margin: "0 0 14px 0", fontSize: "13px", fontWeight: 700 }}>
              Category & Taxonomy
            </h3>

            <div style={{ marginBottom: "14px" }}>
              <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                Primary Category *
              </label>
              <select
                required
                value={categorySlug}
                onChange={(e) => setCategorySlug(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--admin-line)",
                  background: "var(--admin-surface)",
                  fontSize: "12px",
                }}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                Tags (Comma separated)
              </label>
              <input
                type="text"
                placeholder="MTN, Electricity, JAMB, Tips"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                style={{
                  width: "100%",
                  fontSize: "12px",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--admin-line)",
                  background: "var(--admin-surface)",
                }}
              />
            </div>
          </div>

          {/* Featured Image Box */}
          <div className={styles.workspacePanel} style={{ padding: "18px" }}>
            <h3 style={{ margin: "0 0 14px 0", fontSize: "13px", fontWeight: 700 }}>
              Featured Cover Image
            </h3>

            <div style={{ marginBottom: "12px" }}>
              <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                Image URL
              </label>
              <input
                type="url"
                placeholder="https://images.unsplash.com/..."
                value={featuredImage}
                onChange={(e) => setFeaturedImage(e.target.value)}
                style={{
                  width: "100%",
                  fontSize: "12px",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--admin-line)",
                  background: "var(--admin-surface)",
                }}
              />
            </div>

            {/* Quick Presets */}
            <div style={{ marginBottom: "14px" }}>
              <span style={{ fontSize: "10px", color: "var(--admin-muted)", display: "block", marginBottom: "6px" }}>
                Or pick a curated Unsplash cover:
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {PRESET_IMAGES.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setFeaturedImage(preset.url)}
                    style={{
                      fontSize: "10px",
                      padding: "3px 6px",
                      borderRadius: "4px",
                      border: "1px solid var(--admin-line)",
                      background: featuredImage === preset.url ? "var(--admin-green-soft)" : "var(--admin-surface)",
                      color: featuredImage === preset.url ? "var(--admin-green)" : "var(--admin-ink)",
                      cursor: "pointer",
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Image Preview */}
            {featuredImage && (
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "150px",
                  borderRadius: "6px",
                  overflow: "hidden",
                  border: "1px solid var(--admin-line)",
                }}
              >
                <Image
                  src={featuredImage}
                  alt="Featured preview"
                  fill
                  sizes="300px"
                  style={{ objectFit: "cover" }}
                />
              </div>
            )}
          </div>

          {/* Author Meta Box */}
          <div className={styles.workspacePanel} style={{ padding: "18px" }}>
            <h3 style={{ margin: "0 0 14px 0", fontSize: "13px", fontWeight: 700 }}>
              Author Details
            </h3>

            <div style={{ marginBottom: "12px" }}>
              <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                Author Name
              </label>
              <input
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                style={{
                  width: "100%",
                  fontSize: "12px",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--admin-line)",
                  background: "var(--admin-surface)",
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                Author Role / Title
              </label>
              <input
                type="text"
                value={authorRole}
                onChange={(e) => setAuthorRole(e.target.value)}
                style={{
                  width: "100%",
                  fontSize: "12px",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--admin-line)",
                  background: "var(--admin-surface)",
                }}
              />
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
