import { z } from "zod";
import type { RechargePinItem } from "./test-engine/types";

export const RECHARGE_DENOMINATIONS = [100, 200, 500, 1000] as const;
export const RECHARGE_MAX_QUANTITY = 20;
// Only adapters with an actual recharge-card implementation belong here.
export const RECHARGE_PROVIDERS = ["maskawasub"] as const;

export const rechargeSelectionSchema = z.object({
  network: z.enum(["mtn", "airtel", "glo", "9mobile"]),
  denomination: z.number().refine((value) => (RECHARGE_DENOMINATIONS as readonly number[]).includes(value), "Choose a valid recharge-card denomination."),
  quantity: z.number().int().min(1).max(RECHARGE_MAX_QUANTITY),
});

export const rechargePurchaseSchema = z.object({
  serviceType: z.literal("airtime"),
  mode: z.literal("epin"),
  network: rechargeSelectionSchema.shape.network,
  amount: z.number().positive().max(20000),
  quantity: rechargeSelectionSchema.shape.quantity,
  cardName: z.string().trim().min(1).max(20).default("Funda"),
  quoteId: z.string().regex(/^[a-f0-9]{64}$/, "Refresh your recharge-card price before paying."),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,160}$/),
}).transform((input) => ({ ...input, denomination: input.amount / input.quantity }))
  .refine((input) => (RECHARGE_DENOMINATIONS as readonly number[]).includes(input.denomination), "The total must equal denomination × quantity.");

export type RechargeSelection = z.infer<typeof rechargeSelectionSchema>;
export type RechargeQuote = RechargeSelection & {
  quoteId: string;
  faceValue: number;
  discount: number;
  discountPercentage: number;
  cashback: number;
  cashbackPercentage: number;
  payable: number;
  ruleId: string;
};

export type RechargeReceipt = {
  transactionId: string; reference: string; providerReference?: string | null; status: string;
  amount: number; balance: number; reused: boolean; refunded: boolean; productName: string;
  destination: string; serviceType: "airtime"; mode: "epin"; network: string;
  quantity: number; unitAmount: number; faceValue: number; discount: number;
  cashback: number; quotedCashback: number; deliveryStatus: string; pinCount: number;
  pins?: RechargePinItem[]; cardName: string; createdAt: string; message: string;
};

export function rechargePrice(faceValue: number, discountPercentage: number, cashbackPercentage: number) {
  if (!Number.isFinite(faceValue) || faceValue <= 0 || !Number.isFinite(discountPercentage) || discountPercentage < 0 || discountPercentage >= 100 || !Number.isFinite(cashbackPercentage) || cashbackPercentage < 0 || cashbackPercentage > 100) {
    throw new Error("Recharge-card pricing is invalid.");
  }
  const faceKobo = Math.round(faceValue * 100);
  const discountKobo = Math.round(faceKobo * discountPercentage / 100);
  const payableKobo = faceKobo - discountKobo;
  if (payableKobo <= 0) throw new Error("Recharge-card pricing is invalid.");
  return { faceValue: faceKobo / 100, discount: discountKobo / 100, payable: payableKobo / 100, cashback: Math.round(payableKobo * cashbackPercentage / 100) / 100 };
}

export function rechargeMargin(payable: number, cashback: number, providerCost: number) {
  return (Math.round(payable * 100) - Math.round(cashback * 100) - Math.round(providerCost * 100)) / 100;
}

export type AirtimeRule = {
  id: string; network: string; mode: string; min_amount: number; max_amount: number;
  priority: number; primary_provider: string; fallback_provider: string | null;
  discount_percentage: number; cashback_percentage: number;
};

/** Specific scope wins, then priority, then the narrower range; IDs break ties predictably. */
export function matchingAirtimeRule(rules: AirtimeRule[], network: string, mode: string, amount: number) {
  const specificity = (rule: AirtimeRule) => (rule.network === network ? 2 : 0) + (rule.mode === mode ? 1 : 0);
  return rules.filter((rule) => (rule.network === network || rule.network === "all") && (rule.mode === mode || rule.mode === "all") && Number(rule.min_amount) <= amount && Number(rule.max_amount) >= amount)
    .sort((a, b) => specificity(b) - specificity(a) || Number(b.priority) - Number(a.priority) || (Number(a.max_amount) - Number(a.min_amount)) - (Number(b.max_amount) - Number(b.min_amount)) || a.id.localeCompare(b.id))[0];
}

export function validateRechargePins(input: RechargePinItem[] | undefined, expected: RechargeSelection): { pins: RechargePinItem[]; issue: string | null } {
  const pins: RechargePinItem[] = [];
  const seen = new Set<string>();
  let issue: string | null = null;
  if (input !== undefined && !Array.isArray(input)) return { pins, issue: "invalid_pin_batch" };
  for (const item of input ?? []) {
    if (!item || typeof item !== "object") { issue = "invalid_pin_batch"; continue; }
    const pin = String(item.pin ?? "").replace(/[\s-]/g, "");
    if (!/^\d{10,20}$/.test(pin) || Number(item.amount) !== expected.denomination || (item.network && String(item.network).toLowerCase() !== expected.network)) {
      issue = "invalid_pin_batch";
      continue;
    }
    if (seen.has(pin)) { issue = "duplicate_pin_batch"; continue; }
    seen.add(pin);
    pins.push({ pin, amount: expected.denomination, network: expected.network, ...(item.serial ? { serial: String(item.serial).slice(0, 120) } : {}), dialCode: `*311*${pin}#` });
  }
  if (pins.length !== expected.quantity) issue ??= pins.length ? "partial_pin_batch" : "missing_pin_batch";
  return { pins, issue };
}

/** Free-form case notes must never become a second bearer-PIN store. */
export function redactRechargeEvidence(value: string) {
  return value.replace(/(?<!\d)(?:\d[\s-]*){9,19}\d(?!\d)/g, "[number redacted]");
}

export function rechargeDeliveryLabel(value: string) {
  return ({ ready: "PINs ready", awaiting_provider: "Awaiting provider", missing_pin_batch: "PINs missing", partial_pin_batch: "Partial delivery", invalid_pin_batch: "Invalid PIN batch", duplicate_pin_batch: "Duplicate PINs", pin_conflict: "PIN ownership conflict", manual_recovery: "Provider recovery needed", late_delivery_conflict: "Late delivery conflict", provider_status_conflict: "Provider status conflict", refunded: "Refunded" } as Record<string, string>)[value] ?? "Under review";
}

export function parseRechargePinBatch(value: string, expected: RechargeSelection) {
  if (value.length > 20000) throw new Error("The PIN batch is too large.");
  let rows: unknown;
  if (value.trim().startsWith("[")) {
    try { rows = JSON.parse(value); } catch { throw new Error("The PIN batch is not valid JSON."); }
  } else {
    rows = value.trim().split(/\r?\n/).filter(Boolean).map((line) => {
      const [pin, serial] = line.split(",").map((field) => field.trim());
      return { pin, serial, amount: expected.denomination, network: expected.network };
    });
  }
  const parsed = z.array(z.object({ pin: z.string(), serial: z.string().max(120).optional(), amount: z.coerce.number().default(expected.denomination), network: z.string().default(expected.network) })).max(20).parse(rows);
  const batch = validateRechargePins(parsed, expected);
  if (batch.issue) throw new Error(`Provide exactly ${expected.quantity} unique, valid ${expected.network.toUpperCase()} ₦${expected.denomination} PINs.`);
  return batch.pins;
}
