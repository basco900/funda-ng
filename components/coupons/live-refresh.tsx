"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "../../app/coupons/coupons.module.css";
import { CouponIcon } from "./icon";

/** Asks for a fresh look at one brand (rate-limited and budgeted on the server). */
export default function LiveRefresh({ slug }: { slug: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const run = async () => {
    setState("busy");
    const response = await fetch(`/api/coupons/brands/${slug}/refresh`, { method: "POST" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { error?: string; found?: number; fresh?: boolean } | null;
    if (!response?.ok) {
      setState("error");
      setMessage(body?.error ?? "Couldn't search right now.");
      return;
    }
    setState("done");
    setMessage(body?.fresh ? "Checked recently. Nothing new yet." : body?.found ? `Found ${body.found} new ${body.found === 1 ? "offer" : "offers"}.` : "Nothing new right now.");
    router.refresh();
  };

  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 10 }}>
      <button type="button" className={styles.ghostButton} onClick={run} disabled={state === "busy"}>
        <CouponIcon name="refresh" />
        {state === "busy" ? "Searching the web…" : "Search again"}
      </button>
      {message ? <p className={styles.notice} data-tone={state === "error" ? "error" : "ok"}>{message}</p> : null}
    </div>
  );
}
