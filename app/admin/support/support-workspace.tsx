"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { AdminPageHeader } from "@/components/admin/page-pattern";
import AdminIcon from "../(console)/admin-icon";
import { AdminConfirm, AdminFeedback } from "../(console)/admin-ui";
import { adminReplyToThread, adminToggleThreadStatus, adminDeleteThread } from "./actions";
import styles from "../admin.module.css";

export type AdminSupportMessage = {
  id: string;
  thread_id: string;
  sender_type: "user" | "support" | "system";
  sender_name: string;
  message: string;
  telegram_message_id: number | null;
  created_at: string;
};

export type AdminSupportThread = {
  id: string;
  ticket_code: string;
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_phone: string | null;
  current_page: string | null;
  status: "open" | "resolved" | "archived";
  last_message: string | null;
  last_message_at: string;
  unread_support_count: number;
  created_at: string;
  messages?: AdminSupportMessage[];
};

type Props = {
  initialThreads: AdminSupportThread[];
  hasTelegramConfig: boolean;
};

export default function SupportWorkspace({ initialThreads, hasTelegramConfig }: Props) {
  const [threads, setThreads] = useState<AdminSupportThread[]>(initialThreads);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(initialThreads[0]?.id || null);
  const [activeTab, setActiveTab] = useState<"all" | "open" | "resolved">("all");
  const [search, setSearch] = useState("");
  const [replyInput, setReplyInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedThread = threads.find((t) => t.id === selectedThreadId);

  const filteredThreads = threads.filter((t) => {
    if (activeTab === "open" && t.status !== "open") return false;
    if (activeTab === "resolved" && t.status !== "resolved") return false;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const matchName = t.visitor_name?.toLowerCase().includes(q);
      const matchPhone = t.visitor_phone?.toLowerCase().includes(q);
      const matchCode = t.ticket_code?.toLowerCase().includes(q);
      const matchMsg = t.last_message?.toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchCode && !matchMsg) return false;
    }
    return true;
  });

  // Fetch full messages when selected thread changes
  useEffect(() => {
    if (!selectedThreadId) return;

    fetch(`/api/chat/messages?threadId=${encodeURIComponent(selectedThreadId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.messages) {
          setThreads((prev) =>
            prev.map((t) => (t.id === selectedThreadId ? { ...t, messages: data.messages } : t))
          );
        }
      })
      .catch(() => {});
  }, [selectedThreadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedThread?.messages]);

  const handleSendReply = () => {
    if (!selectedThreadId || !replyInput.trim()) return;

    const text = replyInput.trim();
    setReplyInput("");

    startTransition(async () => {
      const res = await adminReplyToThread(selectedThreadId, text);
      if (res.error) {
        setFeedback({ type: "error", text: res.error });
      } else if (res.message) {
        setThreads((prev) =>
          prev.map((t) =>
            t.id === selectedThreadId
              ? {
                  ...t,
                  last_message: text,
                  last_message_at: new Date().toISOString(),
                  messages: [...(t.messages || []), res.message],
                }
              : t
          )
        );
        setFeedback({ type: "success", text: "Reply sent to customer!" });
      }
    });
  };

  const handleToggleStatus = (status: "open" | "resolved") => {
    if (!selectedThreadId) return;

    startTransition(async () => {
      const res = await adminToggleThreadStatus(selectedThreadId, status);
      if (res.error) {
        setFeedback({ type: "error", text: res.error });
      } else {
        setThreads((prev) =>
          prev.map((t) => (t.id === selectedThreadId ? { ...t, status } : t))
        );
        setFeedback({ type: "success", text: `Thread marked as ${status}.` });
      }
    });
  };

  const handleDelete = () => {
    if (!deleteTargetId) return;

    startTransition(async () => {
      const res = await adminDeleteThread(deleteTargetId);
      if (res.error) {
        setFeedback({ type: "error", text: res.error });
      } else {
        setThreads((prev) => prev.filter((t) => t.id !== deleteTargetId));
        if (selectedThreadId === deleteTargetId) {
          setSelectedThreadId(null);
        }
        setFeedback({ type: "success", text: "Chat thread deleted." });
      }
      setDeleteTargetId(null);
    });
  };

  const openCount = threads.filter((t) => t.status === "open").length;

  return (
    <div className={styles.workspace}>
      <AdminPageHeader
        title={
          <div>
            <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>
              Live Chat & Support Desk
            </h1>
            <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--text-muted)" }}>
              Monitor real-time customer conversations from the web, synced seamlessly with Telegram.
            </p>
          </div>
        }
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: "20px",
                background: hasTelegramConfig ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                color: hasTelegramConfig ? "#10b981" : "#ef4444",
                border: `1px solid ${hasTelegramConfig ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)"}`,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: hasTelegramConfig ? "#10b981" : "#ef4444",
                }}
              />
              <span>{hasTelegramConfig ? "Telegram Relay Active" : "Telegram Config Missing"}</span>
            </span>
          </div>
        }
      />

      {feedback && (
        <AdminFeedback
          tone={feedback.type === "error" ? "error" : "success"}
          text={feedback.text}
          onClose={() => setFeedback(null)}
        />
      )}

      {/* Main Two-Column Layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "340px 1fr",
          gap: "20px",
          height: "calc(100vh - 220px)",
          minHeight: "550px",
        }}
      >
        {/* Left Column: Thread List */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "14px",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Search & Tabs */}
          <div style={{ padding: "14px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="Search ticket, name, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: "13px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--background)",
                  color: "var(--text-primary)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                style={{
                  flex: 1,
                  padding: "5px 0",
                  fontSize: "12px",
                  fontWeight: 600,
                  borderRadius: "6px",
                  border: "none",
                  background: activeTab === "all" ? "var(--brand-primary, #660033)" : "var(--background)",
                  color: activeTab === "all" ? "#ffffff" : "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                All ({threads.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("open")}
                style={{
                  flex: 1,
                  padding: "5px 0",
                  fontSize: "12px",
                  fontWeight: 600,
                  borderRadius: "6px",
                  border: "none",
                  background: activeTab === "open" ? "var(--brand-primary, #660033)" : "var(--background)",
                  color: activeTab === "open" ? "#ffffff" : "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                Open ({openCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("resolved")}
                style={{
                  flex: 1,
                  padding: "5px 0",
                  fontSize: "12px",
                  fontWeight: 600,
                  borderRadius: "6px",
                  border: "none",
                  background: activeTab === "resolved" ? "var(--brand-primary, #660033)" : "var(--background)",
                  color: activeTab === "resolved" ? "#ffffff" : "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                Resolved ({threads.length - openCount})
              </button>
            </div>
          </div>

          {/* Threads List Items */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
            {filteredThreads.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                No conversations found.
              </div>
            ) : (
              filteredThreads.map((t) => {
                const isSelected = t.id === selectedThreadId;
                const time = new Date(t.last_message_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedThreadId(t.id)}
                    style={{
                      padding: "12px 14px",
                      borderBottom: "1px solid var(--border)",
                      borderLeft: isSelected ? "4px solid var(--brand-primary, #660033)" : "4px solid transparent",
                      background: isSelected ? "var(--accent-subtle, rgba(102, 0, 51, 0.05))" : "transparent",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                      transition: "background 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontFamily: "monospace",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: "var(--background)",
                          border: "1px solid var(--border)",
                          color: "var(--brand-primary, #660033)",
                        }}
                      >
                        #{t.ticket_code}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{time}</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                        {t.visitor_name || "Guest Customer"}
                      </span>
                      {t.status === "open" ? (
                        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }} title="Open ticket" />
                      ) : (
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>✓ Done</span>
                      )}
                    </div>

                    <p
                      style={{
                        fontSize: "12px",
                        color: "var(--text-muted)",
                        margin: 0,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: "280px",
                      }}
                    >
                      {t.last_message || "No messages yet"}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Chat History & Reply Studio */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "14px",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {selectedThread ? (
            <>
              {/* Header Bar */}
              <div
                style={{
                  padding: "14px 20px",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "var(--surface)",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <h3 style={{ fontSize: "15px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                      {selectedThread.visitor_name || "Guest Customer"}
                    </h3>
                    <span
                      style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "12px",
                        background: selectedThread.status === "open" ? "rgba(16, 185, 129, 0.1)" : "var(--border)",
                        color: selectedThread.status === "open" ? "#10b981" : "var(--text-muted)",
                        fontWeight: 600,
                      }}
                    >
                      {selectedThread.status.toUpperCase()}
                    </span>
                  </div>

                  <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px", display: "flex", gap: "12px" }}>
                    {selectedThread.visitor_phone && <span>📞 {selectedThread.visitor_phone}</span>}
                    {selectedThread.visitor_email && <span>✉️ {selectedThread.visitor_email}</span>}
                    {selectedThread.current_page && <span>📍 {selectedThread.current_page}</span>}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {selectedThread.status === "open" ? (
                    <button
                      type="button"
                      onClick={() => handleToggleStatus("resolved")}
                      disabled={isPending}
                      className={styles.secondaryButton}
                      style={{ fontSize: "12px", padding: "6px 12px" }}
                    >
                      Mark Resolved
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleToggleStatus("open")}
                      disabled={isPending}
                      className={styles.secondaryButton}
                      style={{ fontSize: "12px", padding: "6px 12px" }}
                    >
                      Reopen Ticket
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setDeleteTargetId(selectedThread.id)}
                    className={styles.dangerButton}
                    style={{ fontSize: "12px", padding: "6px 10px" }}
                    title="Delete thread"
                  >
                    <AdminIcon name="trash" />
                  </button>
                </div>
              </div>

              {/* Messages Stream */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  background: "var(--background)",
                }}
              >
                {(selectedThread.messages || []).map((msg) => {
                  const isUser = msg.sender_type === "user";
                  const isSystem = msg.sender_type === "system";
                  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

                  if (isSystem) {
                    return (
                      <div key={msg.id} style={{ textAlign: "center", margin: "6px 0" }}>
                        <span style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "10px", background: "var(--border)", color: "var(--text-muted)" }}>
                          {msg.message}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: isUser ? "flex-start" : "flex-end",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: isUser ? "var(--brand-primary, #660033)" : "var(--text-muted)",
                          marginBottom: "2px",
                          marginInline: "4px",
                        }}
                      >
                        {msg.sender_name} {msg.telegram_message_id ? "(via Telegram)" : ""}
                      </span>

                      <div
                        style={{
                          maxWidth: "70%",
                          padding: "10px 14px",
                          borderRadius: isUser ? "16px 16px 16px 4px" : "16px 16px 4px 16px",
                          background: isUser ? "var(--surface)" : "var(--brand-primary, #660033)",
                          color: isUser ? "var(--text-primary)" : "#ffffff",
                          fontSize: "13px",
                          lineHeight: 1.5,
                          border: isUser ? "1px solid var(--border)" : "none",
                          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {msg.message}
                      </div>

                      <span style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px", marginInline: "4px" }}>
                        {time}
                      </span>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Box */}
              <div
                style={{
                  padding: "14px 20px",
                  borderTop: "1px solid var(--border)",
                  background: "var(--surface)",
                  display: "flex",
                  gap: "10px",
                }}
              >
                <textarea
                  value={replyInput}
                  onChange={(e) => setReplyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendReply();
                    }
                  }}
                  placeholder="Type reply to customer... (Enter to send, Shift+Enter for new line)"
                  rows={2}
                  style={{
                    flex: 1,
                    resize: "none",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    background: "var(--background)",
                    color: "var(--text-primary)",
                    fontSize: "13px",
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={handleSendReply}
                  disabled={!replyInput.trim() || isPending}
                  className={styles.primaryButton}
                  style={{ padding: "0 18px", alignSelf: "stretch" }}
                >
                  Send Reply
                </button>
              </div>
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px",
                textAlign: "center",
                color: "var(--text-muted)",
              }}
            >
              <div style={{ fontSize: "40px", marginBottom: "14px" }}>💬</div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 6px 0", color: "var(--text-primary)" }}>
                No conversation selected
              </h3>
              <p style={{ fontSize: "13px", maxWidth: "320px", margin: 0, lineHeight: 1.5 }}>
                Select a chat from the left or wait for a customer to start a conversation on the website.
              </p>
            </div>
          )}
        </div>
      </div>

      {deleteTargetId && (
        <AdminConfirm
          title="Delete Conversation Thread"
          body="Are you sure you want to delete this chat thread and all its messages? This action cannot be undone."
          confirmLabel="Delete Thread"
          tone="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTargetId(null)}
        />
      )}
    </div>
  );
}
