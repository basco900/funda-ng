"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  queueProviderRequery,
  resendTransactionReceipt,
  resolveTransactionConflict,
  runProviderRequeryNow,
} from "../../actions";
import { button, card, SectionTitle } from "@/components/admin/kit";
import { cn } from "@/lib/utils";
import AdminIcon from "../../admin-icon";

type Props = {
  transactionId: string;
  status: string;
  providerReference?: string | null;
  customerEmail?: string | null;
};

type Feedback = {
  tone: "success" | "warning" | "error";
  text: string;
};

export default function TransactionOperations({
  transactionId,
  status,
  providerReference,
  customerEmail,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [confirmMode, setConfirmMode] = useState<"settle_success" | "refund_fail" | null>(null);
  const [refInput, setRefInput] = useState(providerReference ?? "");
  const [reasonInput, setReasonInput] = useState("");

  const isTerminalSuccess = status === "successful";
  const isTerminalRefunded = ["refunded", "reversed", "cancelled"].includes(status);
  const isFinal = isTerminalSuccess || isTerminalRefunded;
  const canResolveConflict = !isTerminalSuccess && !isTerminalRefunded;

  const runLiveRequery = () => {
    setBusyAction("requery_now");
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await runProviderRequeryNow({
          transactionId,
          reason: "Operator triggered immediate provider requery.",
        });
        setFeedback({
          tone: result.ok ? "success" : "warning",
          text: result.message || "Provider check finished.",
        });
        router.refresh();
      } catch (err) {
        setFeedback({
          tone: "error",
          text: err instanceof Error ? err.message : "Could not check provider status.",
        });
      } finally {
        setBusyAction(null);
      }
    });
  };

  const runQueueRequery = () => {
    setBusyAction("requery_queue");
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await queueProviderRequery({
          transactionId,
          reason: "Operator queued background provider requery.",
        });
        setFeedback({
          tone: "success",
          text: result.message || "Requery job queued.",
        });
        router.refresh();
      } catch (err) {
        setFeedback({
          tone: "error",
          text: err instanceof Error ? err.message : "Failed to queue requery.",
        });
      } finally {
        setBusyAction(null);
      }
    });
  };

  const handleResendReceipt = () => {
    setBusyAction("resend_receipt");
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await resendTransactionReceipt({ transactionId });
        setFeedback({
          tone: result.ok ? "success" : "warning",
          text: result.message,
        });
      } catch (err) {
        setFeedback({
          tone: "error",
          text: err instanceof Error ? err.message : "Failed to dispatch receipt.",
        });
      } finally {
        setBusyAction(null);
      }
    });
  };

  const executeConflictResolution = (resolution: "settle_success" | "refund_fail") => {
    setBusyAction(resolution);
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await resolveTransactionConflict({
          transactionId,
          resolution,
          providerReference: refInput.trim() || undefined,
          reason: reasonInput.trim() || (resolution === "settle_success" ? "Confirmed delivery with provider." : "Failed transaction refunded to customer wallet."),
        });
        setConfirmMode(null);
        setReasonInput("");
        setFeedback({
          tone: result.ok ? "success" : "error",
          text: result.message,
        });
        router.refresh();
      } catch (err) {
        setFeedback({
          tone: "error",
          text: err instanceof Error ? err.message : "Conflict resolution failed.",
        });
      } finally {
        setBusyAction(null);
      }
    });
  };

  return (
    <section className={cn(card, "a-in p-5 sm:p-6")}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <SectionTitle title="Operations & Conflict Resolution" />
        <div className="flex flex-wrap items-center gap-2">
          {!isFinal ? (
            <>
              <button
                type="button"
                className={button.primary}
                disabled={pending}
                onClick={runLiveRequery}
              >
                <AdminIcon name="refresh" className={cn(busyAction === "requery_now" && "animate-spin")} />
                {busyAction === "requery_now" ? "Checking provider…" : "Requery now"}
              </button>
              <button
                type="button"
                className={button.secondary}
                disabled={pending}
                onClick={runQueueRequery}
              >
                <AdminIcon name="clock" />
                {busyAction === "requery_queue" ? "Queuing…" : "Queue requery"}
              </button>
            </>
          ) : null}
          {isTerminalSuccess ? (
            <button
              type="button"
              className={button.secondary}
              disabled={pending}
              onClick={handleResendReceipt}
            >
              <AdminIcon name="mail" />
              {busyAction === "resend_receipt" ? "Sending…" : customerEmail ? "Resend receipt" : "Dispatch receipt"}
            </button>
          ) : null}
        </div>
      </div>

      {canResolveConflict ? (
        <div className="mt-5 rounded-[8px] border border-[color:var(--a-border)] bg-zinc-50/70 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[11.5px] font-semibold tracking-wide text-zinc-500 uppercase">
                Provider reference
              </span>
              <input
                type="text"
                value={refInput}
                onChange={(e) => setRefInput(e.target.value)}
                placeholder="Vendor ref or gateway ID"
                className="h-9 w-full rounded-[8px] border border-a-line bg-a-surface px-3 font-mono text-[12.5px] text-zinc-900 outline-none transition-colors focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11.5px] font-semibold tracking-wide text-zinc-500 uppercase">
                Audit note
              </span>
              <input
                type="text"
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder="Reason for manual settlement or refund"
                className="h-9 w-full rounded-[8px] border border-a-line bg-a-surface px-3 text-[13px] text-zinc-900 outline-none transition-colors focus:border-primary"
              />
            </label>
          </div>

          {!confirmMode ? (
            <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] bg-emerald-600 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-40"
                disabled={pending}
                onClick={() => setConfirmMode("settle_success")}
              >
                <AdminIcon name="checkCircle" className="size-4" />
                Settle Delivered & Credit Cashback
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border border-rose-200 bg-rose-50 px-3.5 text-[13px] font-semibold text-rose-700 transition-colors hover:bg-rose-100 active:scale-[0.98] disabled:opacity-40"
                disabled={pending}
                onClick={() => setConfirmMode("refund_fail")}
              >
                <AdminIcon name="refund" className="size-4" />
                Mark Failed & Refund Wallet
              </button>
            </div>
          ) : (
            <div className="mt-3.5 flex flex-col gap-3 rounded-[8px] border border-amber-200 bg-amber-50/80 p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5 text-[13px] font-semibold text-amber-900">
                <AdminIcon name="alert" className="size-4 shrink-0 text-amber-600" />
                <span>
                  {confirmMode === "settle_success"
                    ? "Confirm settlement as delivered and release eligible cashback?"
                    : "Confirm failure and credit exact refund back to user wallet?"}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className={button.ghost}
                  disabled={pending}
                  onClick={() => setConfirmMode(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] px-3.5 text-[12.5px] font-semibold text-white transition-colors disabled:opacity-40",
                    confirmMode === "settle_success"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-rose-600 hover:bg-rose-700",
                  )}
                  disabled={pending}
                  onClick={() => executeConflictResolution(confirmMode)}
                >
                  {pending
                    ? "Processing…"
                    : confirmMode === "settle_success"
                      ? "Confirm Settle"
                      : "Confirm Refund"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {feedback ? (
        <div
          className={cn(
            "mt-4 flex items-center gap-2.5 rounded-[8px] border px-3.5 py-2.5 text-[13px] font-medium",
            feedback.tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800",
            feedback.tone === "warning" && "border-amber-200 bg-amber-50 text-amber-800",
            feedback.tone === "error" && "border-rose-200 bg-rose-50 text-rose-800",
          )}
        >
          <AdminIcon
            name={feedback.tone === "success" ? "checkCircle" : "alert"}
            className="size-4 shrink-0"
          />
          <span>{feedback.text}</span>
        </div>
      ) : null}
    </section>
  );
}
