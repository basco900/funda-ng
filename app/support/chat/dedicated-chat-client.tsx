"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { ChatMessage, ChatThread } from "@/components/chat/chat-widget";

function getOrCreateGuestId(): string {
  if (typeof window === "undefined") return "temp-guest";
  let guestId = localStorage.getItem("funda_chat_guest_id");
  if (!guestId) {
    guestId = "gst_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem("funda_chat_guest_id", guestId);
  }
  return guestId;
}

export default function DedicatedChatClient() {
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
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
        }
      })
      .catch(() => {});
  }, []);

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
      }
    } catch {
      // transient
    }
  }, []);

  useEffect(() => {
    if (thread?.id) {
      fetchMessages(thread.id, true);

      pollIntervalRef.current = setInterval(() => {
        fetchMessages(thread.id, false);
      }, 2500);
    }

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [thread?.id, fetchMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
          currentPage: "/support/chat",
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
    } finally {
      setIsStartingChat(false);
    }
  };

  const handleSendMessage = async (customText?: string) => {
    const text = (customText || inputText).trim();
    if (!text || isSending) return;

    let activeThreadId = thread?.id;
    setIsSending(true);
    setInputText("");

    try {
      if (!activeThreadId) {
        const guestId = getOrCreateGuestId();
        const tRes = await fetch("/api/chat/thread", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guestId,
            visitorName: userName.trim() || "Customer",
            visitorPhone: userPhone.trim() || null,
            currentPage: "/support/chat",
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

      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: activeThreadId,
          message: text,
          senderName: userName.trim() || "Customer",
          currentPage: "/support/chat",
        }),
      });

      const json = await res.json();
      if (json.message) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? json.message : m)));
        lastFetchedTimeRef.current = json.message.created_at;
      }
    } finally {
      setIsSending(false);
    }
  };

  const quickPrompts = [
    "⚡ Electricity token query",
    "📶 Data top-up inquiry",
    "🎓 WAEC / NECO pin verification",
    "💳 Virtual account deposit check",
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
      {/* Top Header inside card */}
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--surface)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              background: "var(--brand-primary, #660033)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "18px",
            }}
          >
            f.
          </div>
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              Funda Customer Support
            </h2>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
              <span>Real-time Telegram relay active</span>
            </div>
          </div>
        </div>

        {thread?.id && (
          <span
            style={{
              fontSize: "12px",
              fontFamily: "monospace",
              background: "var(--background)",
              padding: "4px 8px",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
            }}
          >
            Ticket: #{thread.id.slice(0, 8)}
          </span>
        )}
      </div>

      {/* Messages Stream */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          background: "var(--background)",
        }}
      >
        {!hasIdentified && (!thread || messages.length === 0) ? (
          <div
            style={{
              maxWidth: "400px",
              margin: "auto",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "16px",
              padding: "24px",
              boxShadow: "var(--shadow-sm)",
              width: "100%",
            }}
          >
            <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 8px 0", color: "var(--text-primary)" }}>
              Start Conversation
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.5, margin: "0 0 18px 0" }}>
              Please enter your name and phone number so our team can follow up with your transaction if needed.
            </p>

            <form onSubmit={handleStartChat} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  Your Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Samuel Okafor"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--text-primary)",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                  Phone Number / WhatsApp
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 08012345678"
                  value={userPhone}
                  onChange={(e) => setUserPhone(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--text-primary)",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={isStartingChat}
                style={{
                  marginTop: "8px",
                  padding: "12px",
                  borderRadius: "8px",
                  background: "var(--brand-primary, #660033)",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                {isStartingChat ? "Connecting to Support..." : "Start Chat Now"}
              </button>
            </form>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const isUser = msg.sender_type === "user";
              const isSystem = msg.sender_type === "system";
              const time = new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

              if (isSystem) {
                return (
                  <div key={msg.id} style={{ textAlign: "center", margin: "10px 0" }}>
                    <span
                      style={{
                        fontSize: "12px",
                        padding: "4px 14px",
                        borderRadius: "14px",
                        background: "var(--border)",
                        color: "var(--text-muted)",
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
                  }}
                >
                  {!isUser && (
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--brand-primary, #660033)", marginBottom: "4px", marginLeft: "4px" }}>
                      Funda Support
                    </span>
                  )}
                  <div
                    style={{
                      maxWidth: "70%",
                      padding: "12px 16px",
                      borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                      background: isUser ? "var(--brand-primary, #660033)" : "var(--surface)",
                      color: isUser ? "#ffffff" : "var(--text-primary)",
                      fontSize: "14px",
                      lineHeight: 1.6,
                      border: isUser ? "none" : "1px solid var(--border)",
                      boxShadow: "0 1px 4px rgba(0, 0, 0, 0.05)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {msg.message}
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px", marginInline: "6px" }}>
                    {time} {isUser && "✓"}
                  </span>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Quick Prompts */}
      {hasIdentified && messages.length <= 2 && (
        <div
          style={{
            padding: "8px 24px",
            background: "var(--surface)",
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: "8px",
            overflowX: "auto",
          }}
        >
          {quickPrompts.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => handleSendMessage(q)}
              style={{
                fontSize: "12px",
                padding: "6px 14px",
                borderRadius: "16px",
                background: "var(--background)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              className="hover:border-[var(--brand-primary)]"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      {hasIdentified && (
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Type your message and press Enter..."
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: "10px",
              border: "1px solid var(--border)",
              background: "var(--background)",
              color: "var(--text-primary)",
              outline: "none",
              fontSize: "14px",
            }}
          />
          <button
            type="button"
            onClick={() => handleSendMessage()}
            disabled={!inputText.trim() || isSending}
            style={{
              padding: "12px 20px",
              borderRadius: "10px",
              background: inputText.trim() ? "var(--brand-primary, #660033)" : "var(--border)",
              color: "#ffffff",
              border: "none",
              fontSize: "14px",
              fontWeight: 600,
              cursor: inputText.trim() ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>Send</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
