"use client";

import { useState, useTransition } from "react";
import { dismissPaymentReview, resolvePaymentReview } from "../../actions";
import styles from "../../../admin.module.css";

export default function ReviewActions({ reviewId, suggestedCustomer }: { reviewId: string; suggestedCustomer: string | null }) {
  const [customer, setCustomer] = useState(suggestedCustomer ?? "");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const run = (action: "credit" | "dismiss") => startTransition(async () => {
    const result = action === "credit"
      ? await resolvePaymentReview({ reviewId, customer, reason: note })
      : await dismissPaymentReview({ reviewId, reason: note });
    setMessage(result.message);
  });

  return (
    <div style={{ display: "grid", gap: 6, minWidth: 260 }}>
      <input
        value={customer}
        onChange={(event) => setCustomer(event.target.value)}
        placeholder="Customer email or ID"
        aria-label="Customer email or ID"
        className="h-8 rounded-[8px] border border-a-line bg-a-surface px-2.5 text-[12.5px] text-zinc-900 transition outline-none placeholder:text-zinc-400 hover:border-zinc-300 focus:border-primary/40"
      />
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Reason (required, min 5 characters)"
        aria-label="Resolution reason"
        className="h-8 rounded-[8px] border border-a-line bg-a-surface px-2.5 text-[12.5px] text-zinc-900 transition outline-none placeholder:text-zinc-400 hover:border-zinc-300 focus:border-primary/40"
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" className={styles.primaryButton} disabled={pending || !customer || note.trim().length < 5} onClick={() => run("credit")}>
          {pending ? "Working…" : "Credit Wallet"}
        </button>
        <button type="button" className={styles.secondaryButton} disabled={pending || note.trim().length < 5} onClick={() => run("dismiss")}>
          Dismiss
        </button>
      </div>
      {message ? <small>{message}</small> : null}
    </div>
  );
}
