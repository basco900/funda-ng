"use client";

import React, { type ReactNode } from "react";

/**
 * A fast, secure, zero-dependency Markdown parser tailored for Funda editorial articles.
 * Supports:
 * - # H1, ## H2, ### H3, #### H4
 * - **bold**, *italic*, \`inline code\`
 * - > Blockquote callouts
 * - Markdown tables (| header | header |)
 * - Bullet lists (- or *)
 * - Numbered lists (1., 2.)
 * - Code blocks (\`\`\`lang ... \`\`\`)
 * - Horizontal rules (---)
 * - Standard links [text](url)
 */
export default function MarkdownRenderer({ content }: { content: string }) {
  if (!content) return null;

  const lines = content.split(/\r?\n/);
  const elements: ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang = "";
  let inTable = false;
  let tableRows: string[][] = [];
  let inList = false;
  let listItems: string[] = [];
  let isNumberedList = false;

  const flushList = () => {
    if (!inList) return;
    if (isNumberedList) {
      elements.push(
        <ol key={`ol-${elements.length}`} style={{ paddingLeft: "24px", margin: "16px 0", lineHeight: 1.75 }}>
          {listItems.map((item, idx) => (
            <li key={idx} style={{ marginBottom: "8px" }}>
              {renderInline(item)}
            </li>
          ))}
        </ol>
      );
    } else {
      elements.push(
        <ul key={`ul-${elements.length}`} style={{ paddingLeft: "24px", margin: "16px 0", lineHeight: 1.75 }}>
          {listItems.map((item, idx) => (
            <li key={idx} style={{ marginBottom: "8px" }}>
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
    }
    inList = false;
    listItems = [];
  };

  const flushTable = () => {
    if (!inTable || tableRows.length === 0) return;
    const [headerRow, ...bodyRows] = tableRows;
    const cleanBodyRows = bodyRows.filter((row) => !row.every((cell) => cell.includes("---") || cell === ""));

    elements.push(
      <div key={`table-${elements.length}`} style={{ overflowX: "auto", margin: "24px 0" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "14px",
            lineHeight: 1.5,
            border: "1px solid var(--border)",
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          {headerRow && (
            <thead style={{ background: "var(--surface-subtle)" }}>
              <tr>
                {headerRow.map((cell, idx) => (
                  <th
                    key={idx}
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontWeight: 600,
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {cleanBodyRows.map((row, rIdx) => (
              <tr
                key={rIdx}
                style={{
                  borderBottom: rIdx < cleanBodyRows.length - 1 ? "1px solid var(--border-subtle)" : "none",
                  background: rIdx % 2 === 1 ? "var(--surface-subtle)" : "transparent",
                }}
              >
                {row.map((cell, cIdx) => (
                  <td key={cIdx} style={{ padding: "12px 16px" }}>
                    {renderInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    inTable = false;
    tableRows = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Code block toggle
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <div
            key={`code-${elements.length}`}
            style={{
              background: "#1e1e24",
              color: "#e2e8f0",
              padding: "16px 20px",
              borderRadius: "8px",
              margin: "20px 0",
              overflowX: "auto",
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: "13px",
              lineHeight: 1.6,
            }}
          >
            <pre style={{ margin: 0 }}>{codeBlockContent.join("\n")}</pre>
          </div>
        );
        inCodeBlock = false;
        codeBlockContent = [];
      } else {
        flushList();
        flushTable();
        inCodeBlock = true;
        codeBlockLang = trimmed.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(rawLine);
      continue;
    }

    // Markdown Table Detection
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushList();
      inTable = true;
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Unordered List
    if (/^[-*•]\s+/.test(trimmed)) {
      if (!inList || isNumberedList) {
        flushList();
        inList = true;
        isNumberedList = false;
      }
      listItems.push(trimmed.replace(/^[-*•]\s+/, ""));
      continue;
    }

    // Numbered List
    if (/^\d+\.\s+/.test(trimmed)) {
      if (!inList || !isNumberedList) {
        flushList();
        inList = true;
        isNumberedList = true;
      }
      listItems.push(trimmed.replace(/^\d+\.\s+/, ""));
      continue;
    }

    if (inList) {
      flushList();
    }

    // Blank line
    if (!trimmed) {
      continue;
    }

    // Horizontal Rule
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      elements.push(
        <hr
          key={`hr-${elements.length}`}
          style={{
            margin: "32px 0",
            border: "none",
            borderTop: "1px solid var(--border)",
          }}
        />
      );
      continue;
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      const quoteText = trimmed.replace(/^>\s*/, "");
      elements.push(
        <blockquote
          key={`quote-${elements.length}`}
          style={{
            margin: "24px 0",
            padding: "16px 20px",
            borderLeft: "4px solid var(--brand-primary, #660033)",
            background: "var(--accent-subtle, rgba(102, 0, 51, 0.04))",
            borderRadius: "0 8px 8px 0",
            fontStyle: "italic",
            color: "var(--text-primary)",
            lineHeight: 1.65,
          }}
        >
          {renderInline(quoteText)}
        </blockquote>
      );
      continue;
    }

    // Headings
    if (trimmed.startsWith("# ")) {
      elements.push(
        <h1
          key={`h1-${elements.length}`}
          style={{
            fontSize: "clamp(26px, 3.5vw, 36px)",
            fontWeight: 800,
            letterSpacing: "-0.025em",
            margin: "36px 0 16px 0",
            color: "var(--text-primary)",
            lineHeight: 1.25,
          }}
        >
          {renderInline(trimmed.slice(2))}
        </h1>
      );
      continue;
    }

    if (trimmed.startsWith("## ")) {
      elements.push(
        <h2
          key={`h2-${elements.length}`}
          style={{
            fontSize: "clamp(20px, 2.5vw, 26px)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            margin: "36px 0 14px 0",
            color: "var(--text-primary)",
            lineHeight: 1.3,
          }}
        >
          {renderInline(trimmed.slice(3))}
        </h2>
      );
      continue;
    }

    if (trimmed.startsWith("### ")) {
      elements.push(
        <h3
          key={`h3-${elements.length}`}
          style={{
            fontSize: "clamp(16px, 1.8vw, 20px)",
            fontWeight: 600,
            margin: "24px 0 10px 0",
            color: "var(--text-primary)",
            lineHeight: 1.4,
          }}
        >
          {renderInline(trimmed.slice(4))}
        </h3>
      );
      continue;
    }

    if (trimmed.startsWith("#### ")) {
      elements.push(
        <h4
          key={`h4-${elements.length}`}
          style={{
            fontSize: "15px",
            fontWeight: 600,
            margin: "18px 0 8px 0",
            color: "var(--text-primary)",
          }}
        >
          {renderInline(trimmed.slice(5))}
        </h4>
      );
      continue;
    }

    // Standard paragraph
    elements.push(
      <p
        key={`p-${elements.length}`}
        style={{
          margin: "16px 0",
          fontSize: "16px",
          lineHeight: "1.8",
          color: "var(--text-secondary, #222)",
        }}
      >
        {renderInline(trimmed)}
      </p>
    );
  }

  flushList();
  flushTable();

  return <div className="funda-markdown-body">{elements}</div>;
}

/**
 * Handles bold (**text**), italic (*text*), inline code (`code`), and links [text](url)
 */
function renderInline(text: string): ReactNode {
  if (!text) return null;

  // Split by inline markdown tokens
  const parts: ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    // Check for inline code `code`
    const codeMatch = remaining.match(/`([^`]+)`/);
    // Check for bold **text**
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    // Check for italic *text*
    const italicMatch = remaining.match(/\*([^*]+)\*/);
    // Check for link [text](url)
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);

    // Find the earliest match
    const matches = [
      codeMatch ? { type: "code", index: codeMatch.index!, match: codeMatch } : null,
      boldMatch ? { type: "bold", index: boldMatch.index!, match: boldMatch } : null,
      italicMatch ? { type: "italic", index: italicMatch.index!, match: italicMatch } : null,
      linkMatch ? { type: "link", index: linkMatch.index!, match: linkMatch } : null,
    ].filter((m): m is NonNullable<typeof m> => m !== null);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    matches.sort((a, b) => a.index - b.index);
    const earliest = matches[0];

    // Push preceding text
    if (earliest.index > 0) {
      parts.push(remaining.slice(0, earliest.index));
    }

    if (earliest.type === "code") {
      parts.push(
        <code
          key={`code-${keyIdx++}`}
          style={{
            background: "var(--surface-subtle, #f0f0f2)",
            padding: "2px 6px",
            borderRadius: "4px",
            fontSize: "13px",
            fontFamily: "ui-monospace, monospace",
            color: "var(--brand-primary, #660033)",
          }}
        >
          {earliest.match[1]}
        </code>
      );
      remaining = remaining.slice(earliest.index + earliest.match[0].length);
    } else if (earliest.type === "bold") {
      parts.push(
        <strong key={`b-${keyIdx++}`} style={{ fontWeight: 700, color: "var(--text-primary)" }}>
          {earliest.match[1]}
        </strong>
      );
      remaining = remaining.slice(earliest.index + earliest.match[0].length);
    } else if (earliest.type === "italic") {
      parts.push(<em key={`i-${keyIdx++}`}>{earliest.match[1]}</em>);
      remaining = remaining.slice(earliest.index + earliest.match[0].length);
    } else if (earliest.type === "link") {
      parts.push(
        <a
          key={`a-${keyIdx++}`}
          href={earliest.match[2]}
          target={earliest.match[2].startsWith("http") ? "_blank" : undefined}
          rel={earliest.match[2].startsWith("http") ? "noopener noreferrer" : undefined}
          style={{
            color: "var(--brand-primary, #660033)",
            textDecoration: "underline",
            fontWeight: 500,
          }}
        >
          {earliest.match[1]}
        </a>
      );
      remaining = remaining.slice(earliest.index + earliest.match[0].length);
    }
  }

  return <>{parts}</>;
}
