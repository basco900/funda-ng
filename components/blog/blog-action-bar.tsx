"use client";

import { useState } from "react";

type Props = {
  postId: string;
  initialLikes: number;
  title: string;
  url: string;
};

export default function BlogActionBar({ postId, initialLikes, title, url }: Props) {
  const [likes, setLikes] = useState(initialLikes);
  const [hasLiked, setHasLiked] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleLike = async () => {
    if (hasLiked) return;
    setHasLiked(true);
    setLikes((prev) => prev + 1);

    try {
      await fetch(`/api/blog/likes/${postId}`, { method: "POST" });
    } catch {
      // optimistic
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  const encodedTitle = encodeURIComponent(title);
  const encodedUrl = encodeURIComponent(url);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        padding: "16px 20px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        margin: "36px 0",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Left: Like & Comment Jump */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          type="button"
          onClick={handleLike}
          disabled={hasLiked}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            border: hasLiked ? "1px solid rgba(220, 38, 38, 0.3)" : "1px solid var(--border)",
            background: hasLiked ? "#fef2f2" : "var(--surface-subtle)",
            color: hasLiked ? "#dc2626" : "var(--text-primary)",
            padding: "8px 14px",
            borderRadius: "20px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: hasLiked ? "default" : "pointer",
            transition: "all 0.2s",
          }}
        >
          <span>{hasLiked ? "❤️ Liked" : "🤍 Helpful"}</span>
          <span style={{ fontSize: "12px", opacity: 0.8 }}>({likes})</span>
        </button>

        <a
          href="#comments"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            border: "1px solid var(--border)",
            background: "var(--surface-subtle)",
            color: "var(--text-primary)",
            padding: "8px 14px",
            borderRadius: "20px",
            fontSize: "13px",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          💬 Discuss
        </a>
      </div>

      {/* Right: Social Share */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "12px", color: "var(--text-muted)", marginRight: "4px" }}>
          Share:
        </span>

        {/* WhatsApp */}
        <a
          href={`https://api.whatsapp.com/send?text=${encodedTitle}%20${encodedUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Share on WhatsApp"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "34px",
            height: "34px",
            borderRadius: "50%",
            background: "#25D366",
            color: "#ffffff",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 700,
          }}
        >
          WA
        </a>

        {/* Twitter / X */}
        <a
          href={`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}&via=fundang`}
          target="_blank"
          rel="noopener noreferrer"
          title="Share on X (Twitter)"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "34px",
            height: "34px",
            borderRadius: "50%",
            background: "#000000",
            color: "#ffffff",
            textDecoration: "none",
            fontSize: "13px",
            fontWeight: 700,
          }}
        >
          𝕏
        </a>

        {/* LinkedIn */}
        <a
          href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Share on LinkedIn"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "34px",
            height: "34px",
            borderRadius: "50%",
            background: "#0a66c2",
            color: "#ffffff",
            textDecoration: "none",
            fontSize: "13px",
            fontWeight: 700,
          }}
        >
          in
        </a>

        {/* Copy Link */}
        <button
          type="button"
          onClick={handleCopyLink}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            border: "1px solid var(--border)",
            background: "var(--surface-subtle)",
            color: "var(--text-primary)",
            padding: "7px 12px",
            borderRadius: "18px",
            fontSize: "12px",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {copied ? "✓ Copied!" : "🔗 Copy link"}
        </button>
      </div>
    </div>
  );
}
