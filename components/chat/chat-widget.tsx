"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";

export type ChatMessage = {
  id: string;
  thread_id: string;
  sender_type: "user" | "support" | "system";
  sender_name: string;
  message: string;
  created_at: string;
  is_read: boolean;
};

export type ChatThread = {
  id: string;
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_phone: string | null;
  status: "open" | "closed" | "resolved" | "archived";
  last_message: string | null;
  last_message_at: string;
  unread_user_count: number;
};

function getOrCreateGuestId(): string {
  if (typeof window === "undefined") return "temp-guest";
  let guestId = localStorage.getItem("funda_chat_guest_id");
  if (!guestId) {
    guestId = "gst_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem("funda_chat_guest_id", guestId);
  }
  return guestId;
}

export default function ChatWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const openRechargeSupport = (event: Event) => {
      const reference = (event as CustomEvent<{ reference?: unknown }>).detail?.reference;
      if (typeof reference !== "string" || reference.length > 160) return;
      setInputText(`I need help with recharge-card order ${reference}. `);
      setIsOpen(true);
    };
    window.addEventListener("funda:recharge-support", openRechargeSupport);
    return () => window.removeEventListener("funda:recharge-support", openRechargeSupport);
  }, []);

  // Intake state for first-time visitors
  const [userName, setUserName] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [hasIdentified, setHasIdentified] = useState(false);
  const [isStartingChat, setIsStartingChat] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastFetchedTimeRef = useRef<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 1. Initial Load: Check for existing thread
  useEffect(() => {
    const guestId = getOrCreateGuestId();
    const savedName = localStorage.getItem("funda_chat_user_name");
    const savedPhone = localStorage.getItem("funda_chat_user_phone");

    if (savedName) setUserName(savedName);
    if (savedPhone) setUserPhone(savedPhone);
    if (savedName || savedPhone) setHasIdentified(true);

    fetch(`/api/chat/thread?guestId=${encodeURIComponent(guestId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.thread) {
          setThread(data.thread);
          if (data.thread.visitor_name) {
            setUserName(data.thread.visitor_name);
            setHasIdentified(true);
          }
          if (data.thread.unread_user_count) {
            setUnreadCount(data.thread.unread_user_count);
          }
        }
      })
      .catch(() => {});
  }, []);

  // 2. Fetch full messages when thread is active and window is opened
  const fetchMessages = useCallback(async (threadId: string, isFull = false) => {
    try {
      const url = isFull || !lastFetchedTimeRef.current
        ? `/api/chat/messages?threadId=${encodeURIComponent(threadId)}`
        : `/api/chat/messages?threadId=${encodeURIComponent(threadId)}&since=${encodeURIComponent(lastFetchedTimeRef.current)}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data.messages && data.messages.length > 0) {
        if (isFull || !lastFetchedTimeRef.current) {
          setMessages(data.messages);
        } else {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newOnes = data.messages.filter((m: ChatMessage) => !existingIds.has(m.id));
            return [...prev, ...newOnes];
          });
        }

        const lastMsg = data.messages[data.messages.length - 1];
        lastFetchedTimeRef.current = lastMsg.created_at;
        setUnreadCount(0);
      }
    } catch {
      // transient network error
    }
  }, []);

  // 3. Active Polling Engine
  useEffect(() => {
    if (isOpen && thread?.id) {
      // Fetch immediately on open
      fetchMessages(thread.id, true);

      // Poll every 2.5 seconds when chat is open
      pollIntervalRef.current = setInterval(() => {
        fetchMessages(thread.id, false);
      }, 2500);
    } else if (!isOpen && thread?.id) {
      // Background poll every 15s for unread badge when chat is closed
      pollIntervalRef.current = setInterval(async () => {
        try {
          const guestId = getOrCreateGuestId();
          const res = await fetch(`/api/chat/thread?guestId=${encodeURIComponent(guestId)}`);
          const data = await res.json();
          if (data.thread?.unread_user_count) {
            setUnreadCount(data.thread.unread_user_count);
          }
        } catch {
          // silent
        }
      }, 15000);
    }

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isOpen, thread?.id, fetchMessages]);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // Handle Starting a Thread
  const handleStartChat = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsStartingChat(true);

    try {
      const guestId = getOrCreateGuestId();
      const res = await fetch("/api/chat/thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestId,
          visitorName: userName.trim() || "Visitor",
          visitorPhone: userPhone.trim() || null,
          currentPage: pathname,
        }),
      });

      const data = await res.json();
      if (data.thread) {
        setThread(data.thread);
        setHasIdentified(true);
        if (userName.trim()) localStorage.setItem("funda_chat_user_name", userName.trim());
        if (userPhone.trim()) localStorage.setItem("funda_chat_user_phone", userPhone.trim());
        await fetchMessages(data.thread.id, true);
      }
    } catch (err) {
      console.error("Failed to start chat:", err);
    } finally {
      setIsStartingChat(false);
    }
  };

  // Handle Sending a Message
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isSending) return;

    let activeThreadId = thread?.id;

    setIsSending(true);
    setInputText("");

    try {
      // If thread not created yet, create it on the fly
      if (!activeThreadId) {
        const guestId = getOrCreateGuestId();
        const tRes = await fetch("/api/chat/thread", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guestId,
            visitorName: userName.trim() || "Customer",
            visitorPhone: userPhone.trim() || null,
            currentPage: pathname,
          }),
        });
        const tData = await tRes.json();
        if (tData.thread) {
          setThread(tData.thread);
          activeThreadId = tData.thread.id;
          setHasIdentified(true);
        }
      }

      if (!activeThreadId) throw new Error("Could not initialize chat thread");

      // Optimistic message UI update
      const tempId = "temp-" + Date.now();
      const optimisticMsg: ChatMessage = {
        id: tempId,
        thread_id: activeThreadId,
        sender_type: "user",
        sender_name: userName.trim() || "Customer",
        message: text,
        created_at: new Date().toISOString(),
        is_read: false,
      };

      setMessages((prev) => [...prev, optimisticMsg]);
      scrollToBottom();

      // POST to backend -> triggers Telegram alert
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: activeThreadId,
          message: text,
          senderName: userName.trim() || "Customer",
          currentPage: pathname,
        }),
      });

      const json = await res.json();
      if (json.message) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? json.message : m)));
        lastFetchedTimeRef.current = json.message.created_at;
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const quickPrompts = [
    "⚡ Electricity token not received",
    "📶 Data delayed / balance issue",
    "🎓 WAEC / NECO pin question",
    "💳 Wallet funding help",
  ];

  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* CHAT MODAL WINDOW */}
      {/* ---------------------------------------------------------------- */}
      {isOpen && (
        <div
          data-funda-chat
          style={{
            position: "fixed",
            bottom: "96px",
            right: "24px",
            width: "min(390px, calc(100vw - 32px))",
            height: "min(580px, calc(100vh - 120px))",
            zIndex: 99999,
            borderRadius: "20px",
            background: "var(--surface, #ffffff)",
            border: "1px solid var(--border, rgba(0, 0, 0, 0.1))",
            boxShadow: "0 20px 50px rgba(0, 0, 0, 0.18), 0 4px 12px rgba(0, 0, 0, 0.08)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            animation: "chatWindowFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "16px 18px",
              background: "linear-gradient(135deg, #660033 0%, #4a0025 100%)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "50%",
                  background: "rgba(255, 255, 255, 0.15)",
                  border: "1px solid rgba(255, 255, 255, 0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: "16px",
                }}
              >
                f.
              </div>
              <div>
                <div style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "-0.01em", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>Funda Live Support</span>
                </div>
                <div style={{ fontSize: "12px", opacity: 0.85, display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      width: "7px",
                      height: "7px",
                      borderRadius: "50%",
                      background: "#10b981",
                      display: "inline-block",
                      boxShadow: "0 0 8px #10b981",
                    }}
                  />
                  <span>Online • Telegram connected</span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  background: "rgba(255, 255, 255, 0.15)",
                  border: "none",
                  borderRadius: "50%",
                  width: "28px",
                  height: "28px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                  cursor: "pointer",
                  transition: "background 0.15s ease",
                }}
                title="Minimize chat"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Body */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              background: "var(--background, #fafaf9)",
            }}
          >
            {/* If first time visitor and not identified */}
            {!hasIdentified && (!thread || messages.length === 0) ? (
              <div
                style={{
                  background: "var(--surface, #ffffff)",
                  border: "1px solid var(--border)",
                  borderRadius: "14px",
                  padding: "16px",
                  margin: "auto 0",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "6px" }}>
                  👋 Welcome to Funda!
                </div>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.5, margin: "0 0 14px 0" }}>
                  Tell us who you are so our team on Telegram can reply directly to your inquiry.
                </p>

                <form onSubmit={handleStartChat} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                      Your Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Samuel Okafor"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      required
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        fontSize: "13px",
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        color: "var(--text-primary)",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                      Phone or WhatsApp (Optional)
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. 08012345678"
                      value={userPhone}
                      onChange={(e) => setUserPhone(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        fontSize: "13px",
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        color: "var(--text-primary)",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isStartingChat}
                    style={{
                      marginTop: "6px",
                      padding: "10px",
                      borderRadius: "8px",
                      background: "var(--brand-primary, #660033)",
                      color: "#ffffff",
                      border: "none",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      boxShadow: "0 2px 6px rgba(102, 0, 51, 0.25)",
                    }}
                  >
                    {isStartingChat ? "Connecting..." : "Start Chatting →"}
                  </button>
                </form>
              </div>
            ) : (
              <>
                {/* Notice pill */}
                <div style={{ textAlign: "center", margin: "4px 0 8px 0" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "3px 10px",
                      borderRadius: "12px",
                      background: "var(--accent-subtle, rgba(102, 0, 51, 0.08))",
                      color: "var(--brand-primary, #660033)",
                      fontWeight: 600,
                    }}
                  >
                    ⚡ Messages route directly to our active support in Telegram
                  </span>
                </div>

                {/* Messages stream */}
                {messages.map((msg) => {
                  const isUser = msg.sender_type === "user";
                  const isSystem = msg.sender_type === "system";
                  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

                  if (isSystem) {
                    return (
                      <div key={msg.id} style={{ textAlign: "center", margin: "6px 0" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            padding: "4px 12px",
                            borderRadius: "12px",
                            background: "var(--border)",
                            color: "var(--text-muted)",
                            display: "inline-block",
                            maxWidth: "85%",
                            lineHeight: 1.4,
                          }}
                        >
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
                        alignItems: isUser ? "flex-end" : "flex-start",
                        marginBottom: "4px",
                      }}
                    >
                      {!isUser && (
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--brand-primary, #660033)", marginBottom: "3px", marginLeft: "4px" }}>
                          Funda Staff
                        </span>
                      )}
                      <div
                        style={{
                          maxWidth: "82%",
                          padding: "10px 14px",
                          borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                          background: isUser ? "var(--brand-primary, #660033)" : "var(--surface, #ffffff)",
                          color: isUser ? "#ffffff" : "var(--text-primary)",
                          fontSize: "13px",
                          lineHeight: 1.5,
                          border: isUser ? "none" : "1px solid var(--border)",
                          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                          wordBreak: "break-word",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {msg.message}
                      </div>
                      <span
                        style={{
                          fontSize: "10px",
                          color: "var(--text-muted)",
                          marginTop: "2px",
                          marginRight: isUser ? "4px" : "0",
                          marginLeft: isUser ? "0" : "4px",
                        }}
                      >
                        {time} {isUser && "✓"}
                      </span>
                    </div>
                  );
                })}

                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Quick Prompts (visible when few messages) */}
          {hasIdentified && messages.length <= 2 && (
            <div
              style={{
                padding: "8px 12px",
                background: "var(--surface)",
                borderTop: "1px solid var(--border)",
                display: "flex",
                gap: "6px",
                overflowX: "auto",
                whiteSpace: "nowrap",
              }}
            >
              {quickPrompts.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleSendMessage(q)}
                  style={{
                    fontSize: "11px",
                    padding: "4px 10px",
                    borderRadius: "14px",
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                  className="hover:border-[var(--brand-primary)]"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input Footer */}
          {hasIdentified && (
            <div
              style={{
                padding: "12px",
                background: "var(--surface, #ffffff)",
                borderTop: "1px solid var(--border)",
                display: "flex",
                alignItems: "flex-end",
                gap: "8px",
              }}
            >
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask us anything... (Enter to send)"
                rows={1}
                style={{
                  flex: 1,
                  resize: "none",
                  maxHeight: "90px",
                  padding: "9px 12px",
                  fontSize: "13px",
                  lineHeight: 1.4,
                  borderRadius: "10px",
                  border: "1px solid var(--border)",
                  background: "var(--background)",
                  color: "var(--text-primary)",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={!inputText.trim() || isSending}
                style={{
                  height: "38px",
                  width: "38px",
                  borderRadius: "10px",
                  background: inputText.trim() ? "var(--brand-primary, #660033)" : "var(--border)",
                  color: "#ffffff",
                  border: "none",
                  cursor: inputText.trim() ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.15s ease",
                  flexShrink: 0,
                }}
                title="Send message"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m22 2-7 20-4-9-9-4Z" />
                  <path d="M22 2 11 13" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* FLOATING LAUNCHER BUTTON */}
      {/* ---------------------------------------------------------------- */}
      <button
        type="button"
        data-funda-chat
        onClick={() => {
          setIsOpen((prev) => !prev);
          if (!isOpen) setUnreadCount(0);
        }}
        aria-label="Open Funda live support chat"
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 99998,
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          background: "linear-gradient(135deg, #660033 0%, #4a0025 100%)",
          color: "#ffffff",
          border: "2px solid rgba(255, 255, 255, 0.2)",
          boxShadow: "0 8px 24px rgba(102, 0, 51, 0.35), 0 2px 6px rgba(0, 0, 0, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease",
        }}
        className="hover:scale-105 active:scale-95"
      >
        {isOpen ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <div style={{ position: "relative" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
            </svg>
            {/* Live Green Online Dot */}
            <span
              style={{
                position: "absolute",
                top: "-2px",
                right: "-2px",
                width: "9px",
                height: "9px",
                borderRadius: "50%",
                background: "#10b981",
                border: "2px solid #660033",
              }}
            />
          </div>
        )}

        {/* Unread Message Badge */}
        {!isOpen && unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: "-4px",
              left: "-4px",
              background: "#ef4444",
              color: "#ffffff",
              fontSize: "11px",
              fontWeight: 800,
              padding: "2px 6px",
              borderRadius: "10px",
              border: "2px solid #ffffff",
              boxShadow: "0 2px 6px rgba(239, 68, 68, 0.4)",
              lineHeight: 1,
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      <style jsx global>{`
        @keyframes chatWindowFadeIn {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </>
  );
}
