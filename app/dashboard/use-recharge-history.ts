"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { TransactionItem } from "./dashboard-client";

type Order = { id: string; reference: string; providerReference?: string; amount: number; discount: number; cashback: number; status: string; destination: string; createdAt: string; productName: string; quantity: number; unitAmount: number; faceValue: number; deliveryStatus: string; pinCount: number };

export function useRechargeHistory(enabled: boolean, search: string, setTransactions: Dispatch<SetStateAction<TransactionItem[]>>) {
  const [state, setState] = useState<{ key: string; cursor: string | null; loading: boolean; error?: string }>({ key: "\u0000", cursor: null, loading: false });
  const generation = useRef(0);
  const key = search.trim();
  const load = useCallback(async (cursor: string | null, signal?: AbortSignal) => {
    const request = ++generation.current;
    setState((previous) => ({ ...previous, key, loading: true, error: undefined }));
    try {
      const params = new URLSearchParams();
      if (key) params.set("q", key);
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/services/recharge-cards/orders?${params}`, { cache: "no-store", signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load your recharge cards.");
      if (signal?.aborted || request !== generation.current) return;
      const orders = (body.orders ?? []) as Order[];
      setTransactions((previous) => {
        const byId = new Map(previous.map((tx) => [tx.id, tx]));
        for (const row of orders) {
          const when = new Date(row.createdAt);
          byId.set(row.id, { ...byId.get(row.id), id: row.id, title: row.productName, category: "airtime", type: "debit", mode: "epin", amount: row.amount, date: when.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" }), time: when.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" }), status: row.status === "successful" ? "completed" : ["failed", "refunded", "reversed", "cancelled"].includes(row.status) ? "failed" : "processing", meta: row.destination, reference: row.reference, providerReference: row.providerReference, createdAt: row.createdAt, quantity: row.quantity, unitAmount: row.unitAmount, faceValue: row.faceValue, originalAmount: row.faceValue, discountAmount: row.discount, deliveryStatus: row.deliveryStatus, pinCount: row.pinCount, cashback: row.cashback > 0 ? `+₦${row.cashback}` : undefined });
        }
        return [...byId.values()].sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));
      });
      setState({ key, cursor: body.nextCursor ?? null, loading: false });
    } catch (error) {
      if (!signal?.aborted && request === generation.current) setState((previous) => ({ ...previous, key, loading: false, error: error instanceof Error ? error.message : "Could not load your recharge cards." }));
    }
  }, [key, setTransactions]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => { void load(null, controller.signal); }, 200);
    return () => { clearTimeout(timer); controller.abort(); generation.current += 1; };
  }, [enabled, load]);
  return { loading: enabled && (state.key !== key || state.loading), error: state.key === key ? state.error : undefined, hasMore: state.key === key && state.cursor !== null, loadMore: () => { if (!state.loading) void load(state.cursor); }, retry: () => { void load(null); } };
}
