"use client";

import Link from "next/link";
import { useTheme } from "@/lib/theme";
import { MoonIcon, SunIcon } from "@/app/onboarding/icons";

export default function BlogNavHeader() {
  const { resolved, toggleTheme } = useTheme();

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        background: "rgba(251, 251, 250, 0.85)",
        borderBottom: "1px solid var(--border)",
      }}
      className="dark:bg-[rgba(10,10,10,0.85)]"
    >
      <div
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Brand */}
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

          <span
            style={{
              height: "18px",
              width: "1px",
              background: "var(--border)",
            }}
          />

          <Link
            href="/coupons"
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--text-primary)",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            Coupons
          </Link>
          <Link
            href="/blog"
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--text-primary)",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            Blog & Insights
          </Link>
        </div>

        {/* Navigation & CTAs */}
        <nav style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <Link
            href="/services"
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--text-muted)",
              textDecoration: "none",
            }}
            className="hidden sm:inline-block hover:text-[var(--text-primary)]"
          >
            Services
          </Link>

          <Link
            href="/faq"
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--text-muted)",
              textDecoration: "none",
            }}
            className="hidden sm:inline-block hover:text-[var(--text-primary)]"
          >
            Help & FAQ
          </Link>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text-primary)",
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            {resolved === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />}
          </button>

          <Link
            href="/dashboard"
            style={{
              background: "var(--brand-primary, #660033)",
              color: "#ffffff",
              padding: "8px 16px",
              borderRadius: "20px",
              fontSize: "13px",
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              boxShadow: "0 2px 8px rgba(102, 0, 51, 0.2)",
            }}
          >
            Open Funda →
          </Link>
        </nav>
      </div>
    </header>
  );
}
