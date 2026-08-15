import { createHash } from "node:crypto";

export class ProviderRequestError extends Error {
  constructor(message: string, public readonly definitive = false) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

export function providerMessage(payload: Record<string, unknown>, fallback: string) {
  for (const key of ["message", "msg", "errors", "error", "detail", "api_response"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value)) {
      const message = value.find((item) => typeof item === "string" && item.trim());
      if (typeof message === "string") return message;
    }
    if (value && typeof value === "object") return JSON.stringify(value);
  }
  return fallback;
}

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("234") && digits.length === 13) return `0${digits.slice(3)}`;
  return digits;
}

export function isNigerianPhone(value: string) {
  return /^0[789][01]\d{8}$/.test(normalizePhone(value));
}

export function serviceReference(prefix = "test") {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `${prefix}_${stamp}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function vtpassReference(seed: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const date = `${value("year")}${value("month")}${value("day")}${value("hour")}${value("minute")}`;
  return `${date}${createHash("sha256").update(seed).digest("hex").slice(0, 12)}`;
}

export function safeError(error: unknown) {
  return error instanceof Error ? error.message : "An unexpected provider error occurred.";
}
