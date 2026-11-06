import type { Metadata } from "next";
import Link from "next/link";
import DedicatedChatClient from "./dedicated-chat-client";

export const metadata: Metadata = {
  title: "Live Support Chat · Funda",
  description: "Chat directly with the Funda support team. Get help with electricity tokens, data bundles, exam pins, and wallet funding.",
};

export default function DedicatedChatPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--background)" }}>
      {/* Top Bar */}
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link
            href="/"
            style={{
              fontSize: "22px",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "var(--brand-primary, #660033)",
              textDecoration: "none",
            }}
          >
            funda<span style={{ color: "#d9b46a" }}>.</span>
          </Link>
          <span style={{ height: "16px", width: "1px", background: "var(--border)" }} />
          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
            Live Support Desk
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-muted)" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
            <span>Support Online</span>
          </div>
          <Link
            href="/dashboard"
            style={{
              fontSize: "13px",
              fontWeight: 600,
              padding: "6px 14px",
              borderRadius: "8px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              textDecoration: "none",
            }}
          >
            Go to Dashboard
          </Link>
        </div>
      </header>

      {/* Main Full-Height Chat Studio */}
      <main style={{ flex: 1, display: "flex", justifyContent: "center", padding: "24px 16px" }}>
        <div
          style={{
            width: "100%",
            maxWidth: "800px",
            height: "calc(100vh - 120px)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "20px",
            boxShadow: "var(--shadow-md)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <DedicatedChatClient />
        </div>
      </main>
    </div>
  );
}
