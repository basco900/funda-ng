"use client";

import { useState } from "react";
import styles from "../../app/coupons/coupons.module.css";
import { CouponIcon } from "./icon";

/** Signed-in users share a code; it is reviewed before it appears. */
export default function ShareCode({ brand, brandName }: { brand: string; brandName: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ tone: "ok" | "error" | null; text: string; signIn?: boolean }>({ tone: null, text: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const response = await fetch("/api/coupons/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brand, code: form.get("code"), title: form.get("title"), conditions: form.get("conditions") }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (response?.status === 401) return setState({ tone: "error", text: "Sign in to share a code.", signIn: true });
    if (!response?.ok) return setState({ tone: "error", text: body?.error ?? "Couldn't save that code." });
    setState({ tone: "ok", text: "Thanks! We'll check it and add it shortly." });
    event.currentTarget.reset();
  };

  if (!open) {
    return (
      <button type="button" className={styles.ghostButton} onClick={() => setOpen(true)}>
        <CouponIcon name="plus" />
        Share a code
      </button>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label>
        Code
        <input name="code" required maxLength={40} placeholder="SAVE10" autoComplete="off" />
      </label>
      <label>
        What it gives
        <input name="title" required minLength={3} maxLength={140} placeholder={`10% off at ${brandName}`} />
      </label>
      <label>
        Conditions
        <input name="conditions" maxLength={300} placeholder="New customers, min ₦10,000" />
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className={styles.searchButton} disabled={busy}>
          {busy ? "Sending…" : "Share code"}
        </button>
        <button type="button" className={styles.ghostButton} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {state.tone ? (
        <p className={styles.notice} data-tone={state.tone}>
          {state.text} {state.signIn ? <a href={`/login?next=/coupons/${brand}`}>Sign in</a> : null}
        </p>
      ) : null}
    </form>
  );
}
