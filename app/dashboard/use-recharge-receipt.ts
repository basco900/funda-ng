"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { RechargeReceipt } from "@/lib/recharge-cards";
import type { TransactionItem } from "./dashboard-client";

export function withRechargeReceipt(tx: TransactionItem, receipt: RechargeReceipt): TransactionItem {
  return {
    ...tx, title: receipt.productName,
    status: receipt.status === "successful" ? "completed" : ["failed", "refunded", "reversed", "cancelled"].includes(receipt.status) ? "failed" : "processing",
    amount: receipt.amount, mode: "epin", quantity: receipt.quantity, unitAmount: receipt.unitAmount,
    faceValue: receipt.faceValue, originalAmount: receipt.faceValue, discountAmount: receipt.discount,
    deliveryStatus: receipt.deliveryStatus, pinCount: receipt.pinCount, pins: receipt.pins, refunded: receipt.refunded,
    cardName: receipt.cardName, createdAt: receipt.createdAt, providerReference: receipt.providerReference ?? undefined,
    cashback: receipt.cashback > 0 ? `+₦${receipt.cashback.toLocaleString("en-NG")}` : undefined,
  };
}

export function useRechargeReceipt(selected: TransactionItem | null, setSelected: Dispatch<SetStateAction<TransactionItem | null>>, setTransactions: Dispatch<SetStateAction<TransactionItem[]>>, setBalance: Dispatch<SetStateAction<number>>) {
  const id = selected?.mode === "epin" ? selected.id : null;
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/services/transactions/${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok || !body.purchase) throw new Error(body.error || "Could not load your recharge cards.");
        if (controller.signal.aborted) return;
        const purchase = body.purchase as RechargeReceipt;
        setFailure(null);
        setSelected((previous) => previous?.id === id ? withRechargeReceipt(previous, purchase) : previous);
        setTransactions((previous) => previous.map((tx) => tx.id === id ? withRechargeReceipt(tx, purchase) : tx));
        setBalance(purchase.balance);
        if (["failed", "refunded", "reversed", "cancelled"].includes(purchase.status) || (purchase.status === "successful" && purchase.pins?.length === purchase.quantity)) return;
      } catch (error) {
        if (controller.signal.aborted) return;
        setFailure({ id, message: error instanceof Error ? error.message : "Could not load your recharge cards." });
      }
      timer = setTimeout(() => { void refresh(); }, document.visibilityState === "visible" ? 15000 : 45000);
    };
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [id, setSelected, setTransactions, setBalance]);
  return failure?.id === id ? failure.message : null;
}
