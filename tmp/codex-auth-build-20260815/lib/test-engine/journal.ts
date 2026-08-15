import type { NetworkId, PurchaseResult, ServiceType, VendorId } from "./types";

export type TestOrder = {
  reference: string;
  email: string;
  phone: string;
  type: ServiceType;
  network: NetworkId;
  vendor: VendorId;
  planId?: string;
  planName?: string;
  amount: number;
  status: "awaiting_payment" | "paid" | "processing" | "complete" | "failed";
  transactionId?: string;
  result?: PurchaseResult;
  createdAt: string;
};

const globalJournal = globalThis as typeof globalThis & { __testOrders?: Map<string, TestOrder> };
export const testOrders = globalJournal.__testOrders ??= new Map<string, TestOrder>();
