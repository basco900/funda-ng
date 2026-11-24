"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { button, card, EmptyNote, PageHeader, StatusBadge } from "@/components/admin/kit";
import { FilterChips, SearchField } from "@/components/admin/list-controls";
import { cn } from "@/lib/utils";
import AdminIcon from "../(console)/admin-icon";
import { AdminConfirm, AdminFeedback } from "../(console)/admin-ui";
import { adminReplyToThread, adminToggleThreadStatus, adminDeleteThread } from "./actions";

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
  const resolvedCount = threads.filter((t) => t.status === "resolved").length;
  const timeOf = (value: string) => new Date(value).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="space-y-6 pb-6">
      <PageHeader title="Support" actions={<StatusBadge value={hasTelegramConfig ? "Live" : "Offline"} label={hasTelegramConfig ? "Telegram Live" : "Telegram Offline"} />} />

      {feedback ? <AdminFeedback tone={feedback.type === "error" ? "error" : "success"} text={feedback.text} onClose={() => setFeedback(null)} /> : null}

      <div className="grid min-h-[560px] grid-cols-1 gap-5 lg:h-[calc(100dvh-220px)] lg:grid-cols-[340px_minmax(0,1fr)]">
        <section className={cn(card, "flex min-h-0 flex-col overflow-hidden")}>
          <div className="space-y-3 border-b border-a-line p-4">
            <SearchField value={search} onChange={setSearch} placeholder="Search tickets" className="sm:w-full" />
            <FilterChips
              label="Filter conversations"
              total={threads.length}
              value={activeTab === "all" ? "" : activeTab}
              onChange={(value) => setActiveTab((value || "all") as typeof activeTab)}
              options={[{ value: "open", label: "Open", count: openCount }, { value: "resolved", label: "Resolved", count: resolvedCount }]}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredThreads.length === 0 ? (
              <p className="px-6 py-12 text-center text-[13px] font-medium text-zinc-400">No Conversations</p>
            ) : (
              filteredThreads.map((t) => {
                const selected = t.id === selectedThreadId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedThreadId(t.id)}
                    className={cn(
                      "relative flex w-full items-start gap-3 border-b border-a-line px-4 py-3.5 text-left transition-colors last:border-b-0",
                      selected ? "bg-primary/[0.05] before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-primary" : "hover:bg-zinc-50",
                    )}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-a-primary-soft text-[12px] font-semibold text-primary">
                      {(t.visitor_name || "G").slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[14px] font-semibold text-zinc-900">{t.visitor_name || "Guest"}</span>
                        <span className="shrink-0 text-[11.5px] font-medium text-zinc-400 tabular-nums">{timeOf(t.last_message_at)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-[12.5px] text-zinc-500">{t.last_message || "No messages yet"}</span>
                        {t.unread_support_count > 0 ? (
                          <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-primary px-1 text-[10.5px] font-semibold text-white tabular-nums">{t.unread_support_count}</span>
                        ) : t.status === "resolved" ? (
                          <AdminIcon name="check" className="size-3.5 shrink-0 text-emerald-600" />
                        ) : null}
                      </span>
                      <span className="mt-1 block text-[11.5px] font-medium text-zinc-400">{t.ticket_code}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className={cn(card, "flex min-h-[480px] flex-col overflow-hidden")}>
          {selectedThread ? (
            <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-a-line px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-a-primary-soft text-[13px] font-semibold text-primary">
                    {(selectedThread.visitor_name || "G").slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-[16px] font-semibold tracking-[-0.02em] text-zinc-950">{selectedThread.visitor_name || "Guest"}</h2>
                      <StatusBadge value={selectedThread.status} size="sm" />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-zinc-500">
                      <span>{selectedThread.ticket_code}</span>
                      {selectedThread.visitor_phone ? (
                        <span className="inline-flex items-center gap-1.5">
                          <AdminIcon name="phone" className="size-3.5 text-zinc-400" />
                          {selectedThread.visitor_phone}
                        </span>
                      ) : null}
                      {selectedThread.visitor_email ? (
                        <span className="inline-flex items-center gap-1.5">
                          <AdminIcon name="mail" className="size-3.5 text-zinc-400" />
                          {selectedThread.visitor_email}
                        </span>
                      ) : null}
                      {selectedThread.current_page ? (
                        <span className="inline-flex items-center gap-1.5">
                          <AdminIcon name="external" className="size-3.5 text-zinc-400" />
                          {selectedThread.current_page}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {selectedThread.status === "open" ? (
                    <button type="button" className={button.secondary} onClick={() => handleToggleStatus("resolved")} disabled={isPending}>
                      <AdminIcon name="check" />
                      Resolve
                    </button>
                  ) : (
                    <button type="button" className={button.secondary} onClick={() => handleToggleStatus("open")} disabled={isPending}>
                      <AdminIcon name="refresh" />
                      Reopen
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteTargetId(selectedThread.id)}
                    aria-label="Delete conversation"
                    title="Delete conversation"
                    className="grid size-9 place-items-center rounded-full text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  >
                    <AdminIcon name="trash" className="size-4" />
                  </button>
                </div>
              </header>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-a-paper/60 px-5 py-5">
                {(selectedThread.messages || []).map((msg) => {
                  if (msg.sender_type === "system") {
                    return (
                      <p key={msg.id} className="text-center text-[12px] font-medium text-zinc-400">
                        {msg.message}
                      </p>
                    );
                  }
                  const mine = msg.sender_type !== "user";
                  return (
                    <div key={msg.id} className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
                      <span className="px-1 text-[11.5px] font-medium text-zinc-400">
                        {msg.sender_name}
                        {msg.telegram_message_id ? " · Telegram" : ""} · {timeOf(msg.created_at)}
                      </span>
                      <p
                        className={cn(
                          "max-w-[min(520px,85%)] rounded-[12px] px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap",
                          mine ? "rounded-br-[4px] bg-primary text-white" : "rounded-bl-[4px] border border-a-line bg-a-surface text-zinc-800",
                        )}
                      >
                        {msg.message}
                      </p>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <form
                className="flex items-end gap-2 border-t border-a-line p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSendReply();
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
                  placeholder="Reply to customer"
                  aria-label="Reply to customer"
                  rows={1}
                  className="max-h-40 min-h-10 flex-1 resize-none rounded-[8px] border border-a-line bg-a-surface px-3 py-2.5 text-[13px] text-zinc-900 transition outline-none placeholder:text-zinc-400 hover:border-zinc-300 focus:border-primary/40"
                />
                <button type="submit" className={cn(button.primary, "h-10")} disabled={isPending || !replyInput.trim()}>
                  <AdminIcon name="arrowUpRight" />
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-6">
              <EmptyNote icon="support" title="Pick a Conversation" />
            </div>
          )}
        </section>
      </div>

      {deleteTargetId ? (
        <AdminConfirm
          title="Delete conversation?"
          body="The thread and all its messages go. This can't be undone."
          confirmLabel="Delete"
          tone="danger"
          pending={isPending}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTargetId(null)}
        />
      ) : null}
    </div>
  );
}
