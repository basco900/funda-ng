"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/page-pattern";
import AdminIcon from "../../(console)/admin-icon";
import { AdminConfirm, AdminFeedback } from "../../(console)/admin-ui";
import { deleteComment, replyToComment } from "../actions";
import styles from "../../admin.module.css";

export type AdminCommentItem = {
  id: string;
  post_id: string;
  parent_id: string | null;
  author_name: string;
  author_email: string | null;
  content: string;
  is_admin_reply: boolean;
  is_approved: boolean;
  likes_count: number;
  created_at: string;
  post?: {
    id: string;
    title: string;
    slug: string;
  } | null;
};

export default function CommentsClient({ initialComments }: { initialComments: AdminCommentItem[] }) {
  const [comments, setComments] = useState(initialComments);
  const [search, setSearch] = useState("");
  const [replyTarget, setReplyTarget] = useState<AdminCommentItem | null>(null);
  const [replyText, setReplyText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminCommentItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const filtered = comments.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.author_name.toLowerCase().includes(q) ||
      (c.author_email && c.author_email.toLowerCase().includes(q)) ||
      c.content.toLowerCase().includes(q) ||
      (c.post?.title && c.post.title.toLowerCase().includes(q))
    );
  });

  const handleDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      const res = await deleteComment(deleteTarget.id);
      if (res.success) {
        setComments((prev) => prev.filter((c) => c.id !== deleteTarget.id));
        setFeedback({ type: "success", text: "Comment deleted successfully." });
      } else {
        setFeedback({ type: "error", text: res.error || "Failed to delete comment." });
      }
      setDeleteTarget(null);
    });
  };

  const handleSendReply = () => {
    if (!replyTarget || !replyText.trim()) return;
    startTransition(async () => {
      const res = await replyToComment(replyTarget.post_id, replyTarget.id, replyText);
      if (res.success && res.reply) {
        setComments((prev) => [
          {
            ...res.reply,
            post: replyTarget.post,
          },
          ...prev,
        ]);
        setFeedback({ type: "success", text: "Admin reply posted successfully." });
        setReplyTarget(null);
        setReplyText("");
      } else {
        setFeedback({ type: "error", text: res.error || "Failed to post reply." });
      }
    });
  };

  return (
    <div className={styles.workspacePage}>
      <AdminPageHeader
        title="Community Comments & Q&A"
        actions={
          <Link href="/admin/blog" className={styles.secondaryButton}>
            ← Back to Articles
          </Link>
        }
        stats={[
          {
            icon: "mail",
            tone: "primary",
            value: comments.length,
            label: "Total Comments",
            note: "across all published blog posts",
          },
          {
            icon: "spark",
            tone: "emerald",
            value: comments.filter((c) => c.is_admin_reply).length,
            label: "Admin Replies",
            note: "official team responses",
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
                <h2>Reader Questions & Discussions</h2>
                <span className={styles.countPill}>{filtered.length}</span>
              </div>
              <p className={styles.directorySub}>
                Moderate questions, reply as Funda Admin, and engage with users.
              </p>
            </div>

            <div className={styles.directoryTools}>
              <label className={styles.directorySearch}>
                <AdminIcon name="search" />
                <input
                  placeholder="Search comments or readers..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
          </div>
        </div>

        <div className={styles.tableResponsive}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Author</th>
                <th>Comment / Question</th>
                <th>Article</th>
                <th>Date</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.tableEmpty}>
                    No comments found.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div>
                        <strong>{c.author_name}</strong>
                        {c.is_admin_reply && (
                          <span
                            style={{
                              marginLeft: "6px",
                              fontSize: "10px",
                              background: "var(--admin-green-soft)",
                              color: "var(--admin-green)",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontWeight: 700,
                            }}
                          >
                            Staff
                          </span>
                        )}
                        <div style={{ fontSize: "11px", color: "var(--admin-muted)" }}>
                          {c.author_email || "Anonymous"}
                        </div>
                      </div>
                    </td>

                    <td>
                      <p
                        style={{
                          fontSize: "12px",
                          lineHeight: "1.5",
                          margin: 0,
                          maxWidth: "460px",
                          color: "var(--admin-ink)",
                        }}
                      >
                        {c.content}
                      </p>
                    </td>

                    <td>
                      {c.post ? (
                        <Link
                          href={`/blog/${c.post.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontSize: "12px",
                            fontWeight: 500,
                            color: "var(--admin-green)",
                            textDecoration: "none",
                          }}
                        >
                          {c.post.title.length > 40
                            ? c.post.title.substring(0, 40) + "..."
                            : c.post.title}
                        </Link>
                      ) : (
                        <span style={{ fontSize: "12px", color: "var(--admin-muted)" }}>
                          Article
                        </span>
                      )}
                    </td>

                    <td>
                      <span style={{ fontSize: "11px", color: "var(--admin-muted)" }}>
                        {new Date(c.created_at).toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
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
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          style={{ padding: "4px 8px", fontSize: "11px" }}
                          onClick={() => {
                            setReplyTarget(c);
                            setReplyText("");
                          }}
                        >
                          Reply
                        </button>

                        <button
                          type="button"
                          className={styles.iconAction}
                          title="Delete comment"
                          onClick={() => setDeleteTarget(c)}
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

      {/* Reply Modal */}
      {replyTarget && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setReplyTarget(null)}>
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label="Reply to comment"
            style={{ maxWidth: 480 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className={styles.modalHeader}>
              <div>
                <h2>Reply to {replyTarget.author_name}</h2>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setReplyTarget(null)}
                aria-label="Close"
              >
                <AdminIcon name="close" />
              </button>
            </header>

            <div className={styles.modalBody}>
              <div
                style={{
                  background: "var(--admin-surface-soft)",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  marginBottom: "14px",
                  fontSize: "12px",
                  fontStyle: "italic",
                  borderLeft: "3px solid var(--admin-green)",
                }}
              >
                &ldquo;{replyTarget.content}&rdquo;
              </div>

              <label style={{ display: "block" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                  Your Official Response
                </span>
                <textarea
                  rows={4}
                  required
                  placeholder="Type an official helpful response as Funda Admin..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  style={{
                    width: "100%",
                    fontSize: "13px",
                    fontFamily: "inherit",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: "1px solid var(--admin-line)",
                    background: "var(--admin-surface)",
                  }}
                />
              </label>
            </div>

            <footer className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setReplyTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={isPending || !replyText.trim()}
                onClick={handleSendReply}
              >
                {isPending ? "Posting..." : "Post Official Reply"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <AdminConfirm
          title="Delete Comment"
          body={
            <>
              Are you sure you want to delete this comment by{" "}
              <strong>{deleteTarget.author_name}</strong>?
            </>
          }
          confirmLabel="Delete Comment"
          pending={isPending}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
