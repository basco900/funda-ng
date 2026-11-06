"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { AdminPageHeader } from "@/components/admin/page-pattern";
import AdminIcon from "../(console)/admin-icon";
import { AdminConfirm, AdminFeedback } from "../(console)/admin-ui";
import { deleteBlogPost, togglePostStatus } from "./actions";
import styles from "../admin.module.css";

export type BlogPostRow = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  category_slug: string;
  tags: string[];
  author_name: string;
  status: "published" | "draft" | "scheduled" | "archived";
  published_at: string | null;
  reading_time_minutes: number;
  views_count: number;
  likes_count: number;
  is_featured: boolean;
  featured_image: string | null;
  created_at: string;
};

export type BlogCategoryRow = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
};

type Props = {
  posts: BlogPostRow[];
  categories: BlogCategoryRow[];
  totalCommentsCount: number;
};

export default function BlogWorkspace({ posts, categories, totalCommentsCount }: Props) {
  const [items, setItems] = useState<BlogPostRow[]>(posts);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<BlogPostRow | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const publishedCount = items.filter((p) => p.status === "published").length;
  const draftsCount = items.filter((p) => p.status === "draft").length;
  const totalViews = items.reduce((acc, p) => acc + (p.views_count || 0), 0);
  const totalLikes = items.reduce((acc, p) => acc + (p.likes_count || 0), 0);

  const filteredPosts = items.filter((post) => {
    if (statusFilter !== "all" && post.status !== statusFilter) return false;
    if (categoryFilter !== "all" && post.category_slug !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = post.title.toLowerCase().includes(q);
      const matchExcerpt = post.excerpt.toLowerCase().includes(q);
      const matchTag = post.tags.some((t) => t.toLowerCase().includes(q));
      if (!matchTitle && !matchExcerpt && !matchTag) return false;
    }
    return true;
  });

  const handleToggleStatus = (post: BlogPostRow) => {
    startTransition(async () => {
      const res = await togglePostStatus(post.id, post.status);
      if (res.success && res.newStatus) {
        setItems((prev) =>
          prev.map((p) => (p.id === post.id ? { ...p, status: res.newStatus as any } : p))
        );
        setFeedback({
          type: "success",
          text: `"${post.title}" is now ${res.newStatus}.`,
        });
      } else {
        setFeedback({ type: "error", text: res.error || "Failed to update status." });
      }
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      const res = await deleteBlogPost(deleteTarget.id);
      if (res.success) {
        setItems((prev) => prev.filter((p) => p.id !== deleteTarget.id));
        setFeedback({ type: "success", text: `Deleted "${deleteTarget.title}".` });
      } else {
        setFeedback({ type: "error", text: res.error || "Failed to delete post." });
      }
      setDeleteTarget(null);
    });
  };

  const getCategoryName = (slug: string) => {
    const found = categories.find((c) => c.slug === slug);
    return found ? found.name : slug;
  };

  return (
    <div className={styles.workspacePage}>
      <AdminPageHeader
        title="Blog & Content Hub"
        actions={
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <Link href="/admin/blog/comments" className={styles.secondaryButton}>
              <AdminIcon name="mail" />
              Comments ({totalCommentsCount})
            </Link>
            <Link href="/admin/blog/new" className={styles.primaryButton}>
              <AdminIcon name="plus" />
              New Blog Post
            </Link>
          </div>
        }
        stats={[
          {
            icon: "megaphone",
            tone: "primary",
            value: items.length,
            label: "Total Articles",
            note: `${publishedCount} published, ${draftsCount} drafts`,
          },
          {
            icon: "pulse",
            tone: "emerald",
            value: totalViews.toLocaleString(),
            label: "Total Page Views",
            note: "all-time readership",
          },
          {
            icon: "spark",
            tone: "amber",
            value: totalLikes.toLocaleString(),
            label: "Article Reactions",
            note: "reader upvotes",
          },
          {
            icon: "mail",
            tone: "slate",
            value: totalCommentsCount,
            label: "Comments & Q&A",
            note: "community feedback",
          },
        ]}
      />

      {feedback && (
        <AdminFeedback
          tone={feedback.type}
          text={feedback.text}
          onClose={() => setFeedback(null)}
        />
      )}

      <section className={styles.workspacePanel}>
        <div className={styles.directoryHeader}>
          <div className={styles.directoryTop}>
            <div>
              <div className={styles.directoryTitle}>
                <h2>Published & Draft Posts</h2>
                <span className={styles.countPill}>{filteredPosts.length}</span>
              </div>
              <p className={styles.directorySub}>
                Manage articles, featured media, live publishing, and AI content generation.
              </p>
            </div>

            <div className={styles.directoryTools}>
              {/* Category filter */}
              <select
                className={styles.compactSelect}
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filter by category"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>

              {/* Status filter */}
              <select
                className={styles.compactSelect}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by status"
              >
                <option value="all">All Statuses</option>
                <option value="published">Published</option>
                <option value="draft">Drafts</option>
              </select>

              {/* Search input */}
              <label className={styles.directorySearch}>
                <AdminIcon name="search" />
                <input
                  placeholder="Search articles, tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </label>
            </div>
          </div>
        </div>

        <div className={styles.tableResponsive}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: "60px" }}>Cover</th>
                <th>Title & Excerpt</th>
                <th>Category</th>
                <th>Author</th>
                <th>Readership</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPosts.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.tableEmpty}>
                    No blog posts match your search or filter.
                  </td>
                </tr>
              ) : (
                filteredPosts.map((post) => (
                  <tr key={post.id}>
                    <td>
                      <div
                        style={{
                          width: "48px",
                          height: "36px",
                          position: "relative",
                          borderRadius: "4px",
                          overflow: "hidden",
                          background: "#eee",
                        }}
                      >
                        {post.featured_image ? (
                          <Image
                            src={post.featured_image}
                            alt=""
                            fill
                            sizes="48px"
                            style={{ objectFit: "cover" }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "100%",
                              height: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#888",
                              fontSize: "11px",
                            }}
                          >
                            Post
                          </div>
                        )}
                      </div>
                    </td>

                    <td>
                      <div style={{ maxWidth: "420px" }}>
                        <Link
                          href={`/admin/blog/${post.id}/edit`}
                          style={{
                            fontWeight: 600,
                            color: "var(--admin-ink)",
                            textDecoration: "none",
                            display: "block",
                            marginBottom: "2px",
                            fontSize: "13px",
                          }}
                        >
                          {post.title}
                          {post.is_featured && (
                            <span
                              style={{
                                marginLeft: "6px",
                                fontSize: "10px",
                                fontWeight: 700,
                                background: "var(--admin-gold-soft)",
                                color: "var(--admin-gold-ink)",
                                padding: "2px 6px",
                                borderRadius: "4px",
                              }}
                            >
                              Featured
                            </span>
                          )}
                        </Link>
                        <p
                          style={{
                            fontSize: "11px",
                            color: "var(--admin-muted)",
                            margin: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {post.excerpt}
                        </p>
                      </div>
                    </td>

                    <td>
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: "11px",
                          fontWeight: 500,
                          padding: "2px 8px",
                          borderRadius: "12px",
                          background: "var(--admin-surface-soft)",
                          color: "var(--admin-ink)",
                          border: "1px solid var(--admin-line)",
                        }}
                      >
                        {getCategoryName(post.category_slug)}
                      </span>
                    </td>

                    <td>
                      <div style={{ fontSize: "12px" }}>
                        <strong>{post.author_name}</strong>
                        <div style={{ fontSize: "10px", color: "var(--admin-muted)" }}>
                          {post.reading_time_minutes} min read
                        </div>
                      </div>
                    </td>

                    <td>
                      <div style={{ fontSize: "12px" }}>
                        <span>👁 {post.views_count.toLocaleString()}</span>
                        <span style={{ marginLeft: "8px", color: "var(--admin-muted)" }}>
                          ♥ {post.likes_count}
                        </span>
                      </div>
                    </td>

                    <td>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(post)}
                        disabled={isPending}
                        title="Click to toggle status"
                        style={{
                          border: "none",
                          cursor: "pointer",
                          padding: "3px 8px",
                          borderRadius: "12px",
                          fontSize: "11px",
                          fontWeight: 600,
                          background:
                            post.status === "published"
                              ? "var(--admin-emerald-soft)"
                              : "var(--admin-amber-soft)",
                          color:
                            post.status === "published"
                              ? "var(--admin-emerald)"
                              : "var(--admin-amber)",
                        }}
                      >
                        {post.status === "published" ? "Published" : "Draft"}
                      </button>
                    </td>

                    <td style={{ textAlign: "right" }}>
                      <div
                        style={{
                          display: "inline-flex",
                          gap: "6px",
                          alignItems: "center",
                          justifyContent: "flex-end",
                        }}
                      >
                        <Link
                          href={`/blog/${post.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className={styles.iconAction}
                          title="View live blog post"
                        >
                          <AdminIcon name="external" />
                        </Link>

                        <Link
                          href={`/admin/blog/${post.id}/edit`}
                          className={styles.iconAction}
                          title="Edit post"
                        >
                          <AdminIcon name="pencil" />
                        </Link>

                        <button
                          type="button"
                          className={styles.iconAction}
                          title="Delete post"
                          onClick={() => setDeleteTarget(post)}
                        >
                          <AdminIcon name="trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {deleteTarget && (
        <AdminConfirm
          title="Delete Blog Post"
          body={
            <>
              Are you sure you want to permanently delete{" "}
              <strong>&ldquo;{deleteTarget.title}&rdquo;</strong>? This action will remove the
              article, its comments, and live URL immediately.
            </>
          }
          confirmLabel="Delete Post"
          pending={isPending}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
