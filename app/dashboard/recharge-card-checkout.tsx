"use client";

import { useEffect, useState } from "react";
import type { RechargeQuote } from "@/lib/recharge-cards";
import styles from "./dashboard.module.css";

const money = (value: number) => `₦${value.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function useRechargeAvailability(enabled: boolean) {
  const [offers, setOffers] = useState<Array<{ network: string; denomination: number; maxQuantity: number }> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void fetch("/api/services/recharge-cards/catalog", { cache: "no-store", signal: controller.signal }).then((response) => response.json()).then((body) => { if (!controller.signal.aborted) setOffers(Array.isArray(body.offers) ? body.offers : []); }).catch(() => { if (!controller.signal.aborted) setOffers([]); });
    return () => controller.abort();
  }, [enabled]);
  return offers;
}

export function useRechargeQuote(network: string, denomination: number, quantity: number, enabled: boolean) {
  const [revision, setRevision] = useState(0);
  const key = `${network}:${denomination}:${quantity}:${revision}`;
  const [state, setState] = useState<{ key: string; quote?: RechargeQuote; error?: string }>({ key: "" });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/services/recharge-cards/quote", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ network, denomination, quantity }), signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not price your recharge cards.");
        if (!controller.signal.aborted) setState({ key, quote: body as RechargeQuote });
      } catch (error) {
        if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : "Recharge-card pricing is unavailable." });
      }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [network, denomination, quantity, enabled, key]);
  return { quote: enabled && state.key === key ? state.quote : undefined, error: enabled && state.key === key ? state.error : undefined, busy: enabled && state.key !== key, refresh: () => setRevision((value) => value + 1) };
}

export function RechargePriceSummary({ quote, busy, error, onRetry }: { quote?: RechargeQuote; busy: boolean; error?: string; onRetry: () => void }) {
  return (
    <div className={styles.orderSummaryCard} aria-busy={busy} style={{ minHeight: 164 }}>
      {quote ? <>
        <div className={styles.orderSummaryRow}><span>{quote.quantity} × {money(quote.denomination)}</span><span>{money(quote.faceValue)}</span></div>
        <div className={styles.orderSummaryRow}><span>Discount</span><span>−{money(quote.discount)}</span></div>
        <div className={styles.orderSummaryRow}><span>Cashback on completion</span><span>{money(quote.cashback)}</span></div>
        <div className={styles.orderSummaryTotal}><span>Pay from wallet</span><strong>{money(quote.payable)}</strong></div>
      </> : error ? <div role="alert" className={styles.rechargeQuoteError}><span>{error}</span><button type="button" className={styles.epinActionBtn} onClick={onRetry}>Try again</button></div> : <div role="status" className={styles.rechargeQuoteLoading}>{busy ? "Updating price…" : "Choose your cards"}</div>}
    </div>
  );
}
