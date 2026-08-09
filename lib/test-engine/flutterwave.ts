import { createHmac, timingSafeEqual } from "node:crypto";

const apiBase = "https://api.flutterwave.com/v3";

function secretKey() {
  if (!process.env.FLW_SECRET_KEY) throw new Error("Flutterwave secret key is not configured.");
  return process.env.FLW_SECRET_KEY;
}

export async function initializePayment(input: {
  reference: string;
  amount: number;
  email: string;
  phone: string;
  name: string;
  redirectUrl: string;
  meta: Record<string, string | number>;
}) {
  const response = await fetch(`${apiBase}/payments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      tx_ref: input.reference,
      amount: input.amount,
      currency: "NGN",
      redirect_url: input.redirectUrl,
      customer: { email: input.email, phone_number: input.phone, name: input.name },
      meta: input.meta,
      customizations: { title: "Orbit Bills", description: "Data and airtime purchase" },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status !== "success" || !payload.data?.link) {
    throw new Error(payload.message || "Flutterwave could not initialize checkout.");
  }
  return payload.data.link as string;
}

export async function verifyPayment(transactionId: string) {
  const response = await fetch(`${apiBase}/transactions/${encodeURIComponent(transactionId)}/verify`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status !== "success") throw new Error(payload.message || "Payment verification failed.");
  // Flutterwave metadata is merchant-defined and therefore intentionally dynamic.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return payload.data as Record<string, any>;
}

export function verifyWebhook(rawBody: string, signature: string | null) {
  const secret = process.env.FLW_SECRET_HASH;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}
