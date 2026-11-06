"use client";

import { useState, useTransition } from "react";

export type BlogCommentItem = {
  id: string;
  post_id: string;
  parent_id: string | null;
  author_name: string;
  content: string;
  is_admin_reply: boolean;
  likes_count: number;
  created_at: string;
};

type Props = {
  postId: string;
  initialComments: BlogCommentItem[];
};

export default function BlogCommentsSection({ postId, initialComments }: Props) {
  const [comments, setComments] = useState<BlogCommentItem[]>(initialComments);
  const [authorName, setAuthorName] = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [content, setContent] = useState("");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorName.trim() || !content.trim()) {
      setStatusMessage({ type: "error", text: "Please enter your name and comment." });
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/blog/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postId,
            authorName,
            authorEmail,
            content,
            parentId: replyToId,
          }),
        });

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to submit comment.");
        }

        const data = await res.json();
        setComments((prev) => [...prev, data.comment]);
        setContent("");
        setReplyToId(null);
        setStatusMessage({
          type: "success",
          text: "Thank you! Your comment has been published.",
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error posting comment";
        setStatusMessage({ type: "error", text: msg });
      }
    });
  };

  // Group root comments and replies
  const rootComments = comments.filter((c) => !c.parent_id);
  const getReplies = (parentId: string) => comments.filter((c) => c.parent_id === parentId);

  return (
    <section
      id="comments"
      style={{
        marginTop: "48px",
        paddingTop: "36px",
        borderTop: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "28px" }}>
        <div>
          <h2 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 4px 0", color: "var(--text-primary)" }}>
            Questions & Comments ({comments.length})
          </h2>
          <p style={{ fontSize: "14px", color: "var(--text-muted)", margin: 0 }}>
            Have a question about this guide? Join the community conversation below.
          </p>
        </div>
      </div>

      {/* Comment Form */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "24px",
          marginBottom: "36px",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <h3 style={{ fontSize: "16px", fontWeight: 600, margin: "0 0 16px 0", color: "var(--text-primary)" }}>
          {replyToId ? "Reply to Comment" : "Leave a Comment or Question"}
        </h3>

        {replyToId && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "var(--surface-subtle)",
              padding: "8px 12px",
              borderRadius: "6px",
              marginBottom: "14px",
              fontSize: "12px",
            }}
          >
            <span>Replying to thread</span>
            <button
              type="button"
              onClick={() => setReplyToId(null)}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--brand-primary, #660033)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel Reply ✕
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                Your Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Ibrahim Bala"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--surface-subtle)",
                  fontSize: "14px",
                  color: "var(--text-primary)",
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                Email (Private, optional)
              </label>
              <input
                type="email"
                placeholder="name@example.com"
                value={authorEmail}
                onChange={(e) => setAuthorEmail(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--surface-subtle)",
                  fontSize: "14px",
                  color: "var(--text-primary)",
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
              Your Comment or Question *
            </label>
            <textarea
              required
              rows={4}
              placeholder="Share your thoughts, ask for clarification, or contribute your own experience..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                background: "var(--surface-subtle)",
                fontSize: "14px",
                lineHeight: "1.6",
                color: "var(--text-primary)",
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
          </div>

          {statusMessage && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "6px",
                marginBottom: "16px",
                fontSize: "13px",
                background: statusMessage.type === "success" ? "#ecfdf5" : "#fef2f2",
                color: statusMessage.type === "success" ? "#065f46" : "#991b1b",
                border: `1px solid ${statusMessage.type === "success" ? "#a7f3d0" : "#fecaca"}`,
              }}
            >
              {statusMessage.text}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            style={{
              background: "var(--brand-primary, #660033)",
              color: "#ffffff",
              border: "none",
              padding: "10px 22px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: isPending ? "not-allowed" : "pointer",
              transition: "opacity 0.2s",
              opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending ? "Posting..." : replyToId ? "Submit Reply" : "Post Comment"}
          </button>
        </form>
      </div>

      {/* Comments List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {rootComments.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "24px 0", fontSize: "14px" }}>
            No comments yet. Be the first to start the discussion!
          </p>
        ) : (
          rootComments.map((comment) => {
            const replies = getReplies(comment.id);
            return (
              <article
                key={comment.id}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  padding: "18px 20px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "50%",
                        background: "var(--brand-primary, #660033)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "13px",
                        fontWeight: 700,
                      }}
                    >
                      {comment.author_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <strong style={{ fontSize: "14px", color: "var(--text-primary)" }}>
                          {comment.author_name}
                        </strong>
                        {comment.is_admin_reply && (
                          <span
                            style={{
                              background: "rgba(102, 0, 51, 0.1)",
                              color: "var(--brand-primary, #660033)",
                              fontSize: "11px",
                              fontWeight: 700,
                              padding: "2px 6px",
                              borderRadius: "4px",
                            }}
                          >
                            Funda Staff
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {new Date(comment.created_at).toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setReplyToId(comment.id);
                      document.getElementById("comments")?.scrollIntoView({ behavior: "smooth" });
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--brand-primary, #660033)",
                      cursor: "pointer",
                    }}
                  >
                    Reply
                  </button>
                </div>

                <p style={{ margin: "8px 0 0 0", fontSize: "14px", lineHeight: "1.6", color: "var(--text-secondary)" }}>
                  {comment.content}
                </p>

                {/* Nested Replies */}
                {replies.length > 0 && (
                  <div
                    style={{
                      marginTop: "16px",
                      paddingLeft: "16px",
                      borderLeft: "2px solid var(--border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "14px",
                    }}
                  >
                    {replies.map((reply) => (
                      <div
                        key={reply.id}
                        style={{
                          background: reply.is_admin_reply ? "var(--accent-subtle, rgba(102, 0, 51, 0.04))" : "var(--surface-subtle)",
                          padding: "12px 14px",
                          borderRadius: "8px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                          <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                            {reply.author_name}
                          </strong>
                          {reply.is_admin_reply && (
                            <span
                              style={{
                                background: "var(--brand-primary, #660033)",
                                color: "#fff",
                                fontSize: "10px",
                                fontWeight: 700,
                                padding: "1px 5px",
                                borderRadius: "3px",
                              }}
                            >
                              Official Answer
                            </span>
                          )}
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            · {new Date(reply.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: "13px", lineHeight: "1.55", color: "var(--text-secondary)" }}>
                          {reply.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
