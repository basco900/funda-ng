import Link from "next/link";

export default function BlogFooter() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--border)",
        background: "var(--surface)",
        padding: "60px 20px 40px 20px",
        marginTop: "80px",
      }}
    >
      <div
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "40px",
          marginBottom: "48px",
        }}
      >
        {/* Col 1: Brand & Mission */}
        <div>
          <Link
            href="/"
            style={{
              fontSize: "24px",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "var(--brand-primary, #660033)",
              textDecoration: "none",
              display: "inline-block",
              marginBottom: "12px",
            }}
          >
            funda<span style={{ color: "#d9b46a" }}>.</span>
          </Link>
          <p
            style={{
              fontSize: "14px",
              color: "var(--text-muted)",
              lineHeight: 1.6,
              margin: 0,
              maxWidth: "320px",
            }}
          >
            The smart Nigerian platform for affordable data bundles, airtime top-ups, electricity tokens, exam scratch cards, and seamless bill payments.
          </p>
        </div>

        {/* Col 2: Blog Categories */}
        <div>
          <h4
            style={{
              fontSize: "13px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--text-primary)",
              marginBottom: "16px",
            }}
          >
            Top Categories
          </h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
            <li>
              <Link
                href="/blog/category/telecoms-data"
                style={{ fontSize: "14px", color: "var(--text-muted)", textDecoration: "none" }}
                className="hover:text-[var(--brand-primary)]"
              >
                Telecoms & Data Hacks
              </Link>
            </li>
            <li>
              <Link
                href="/blog/category/electricity-utilities"
                style={{ fontSize: "14px", color: "var(--text-muted)", textDecoration: "none" }}
                className="hover:text-[var(--brand-primary)]"
              >
                Electricity & Meter Guides
              </Link>
            </li>
            <li>
              <Link
                href="/blog/category/fintech-payments"
                style={{ fontSize: "14px", color: "var(--text-muted)", textDecoration: "none" }}
                className="hover:text-[var(--brand-primary)]"
              >
                FinTech & Virtual Accounts
              </Link>
            </li>
            <li>
              <Link
                href="/blog/category/education-exams"
                style={{ fontSize: "14px", color: "var(--text-muted)", textDecoration: "none" }}
                className="hover:text-[var(--brand-primary)]"
              >
                WAEC, NECO & JAMB
              </Link>
            </li>
            <li>
              <Link
                href="/blog/category/cable-tv"
                style={{ fontSize: "14px", color: "var(--text-muted)", textDecoration: "none" }}
                className="hover:text-[var(--brand-primary)]"
              >
                DStv & GOtv Solvers
              </Link>
            </li>
          </ul>
        </div>

        {/* Col 3: Quick Utilities */}
        <div>
          <h4
            style={{
              fontSize: "13px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--text-primary)",
              marginBottom: "16px",
            }}
          >
            Funda Utilities
          </h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
            <li>
              <Link
                href="/dashboard"
                style={{ fontSize: "14px", color: "var(--text-muted)", textDecoration: "none" }}
                className="hover:text-[var(--brand-primary)]"
              >
                Buy Cheap MTN/Airtel Data
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard"
                style={{ fontSize: "14px", color: "var(--text-muted)", textDecoration: "none" }}
                className="hover:text-[var(--brand-primary)]"
              >
                Generate Electricity Token
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard"
                style={{ fontSize: "14px", color: "var(--text-muted)", textDecoration: "none" }}
                className="hover:text-[var(--brand-primary)]"
              >
                Buy WAEC & NECO Scratch Card
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard"
                style={{ fontSize: "14px", color: "var(--text-muted)", textDecoration: "none" }}
                className="hover:text-[var(--brand-primary)]"
              >
                Recharge Cable TV
              </Link>
            </li>
          </ul>
        </div>

        {/* Col 4: Platform & Support */}
        <div>
          <h4
            style={{
              fontSize: "13px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--text-primary)",
              marginBottom: "16px",
            }}
          >
            Platform
          </h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
            <li>
              <Link
                href="/services"
                style={{ fontSize: "14px", color: "var(--text-muted)", textDecoration: "none" }}
                className="hover:text-[var(--brand-primary)]"
              >
                Services Overview
              </Link>
            </li>
            <li>
              <Link
                href="/faq"
                style={{ fontSize: "14px", color: "var(--text-muted)", textDecoration: "none" }}
                className="hover:text-[var(--brand-primary)]"
              >
                Frequently Asked Questions
              </Link>
            </li>
            <li>
              <Link
                href="/contact"
                style={{ fontSize: "14px", color: "var(--text-muted)", textDecoration: "none" }}
                className="hover:text-[var(--brand-primary)]"
              >
                Contact Support
              </Link>
            </li>
            <li>
              <Link
                href="/policies"
                style={{ fontSize: "14px", color: "var(--text-muted)", textDecoration: "none" }}
                className="hover:text-[var(--brand-primary)]"
              >
                Privacy & Security
              </Link>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom Bar */}
      <div
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
          paddingTop: "24px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "14px",
          fontSize: "13px",
          color: "var(--text-muted)",
        }}
      >
        <div>
          © {new Date().getFullYear()} Funda Technologies Ltd. All rights reserved. Built with precision for Nigeria.
        </div>
        <div style={{ display: "flex", gap: "18px" }}>
          <Link href="/terms" style={{ color: "inherit", textDecoration: "none" }}>Terms of Use</Link>
          <Link href="/privacy" style={{ color: "inherit", textDecoration: "none" }}>Privacy Policy</Link>
          <Link href="/refunds" style={{ color: "inherit", textDecoration: "none" }}>Refund Policy</Link>
        </div>
      </div>
    </footer>
  );
}
