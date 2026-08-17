import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const liveBaseUrl = "https://api.bachs.io";

function credentials() {
  const apiKey = process.env.BACHS_API_KEY?.trim();
  if (!apiKey) throw new Error("BACHS_API_KEY is not configured.");
  if (process.env.NODE_ENV === "production" && !apiKey.startsWith("sk_live_")) {
    throw new Error("Production requires a Bachs live API key.");
  }
  const defaultBaseUrl = apiKey.startsWith("sk_sandbox_") ? "https://sandbox-api.bachs.io" : liveBaseUrl;
  return { apiKey, baseUrl: process.env.BACHS_API_BASE_URL?.trim() || defaultBaseUrl };
}

export type BachsCheckout = {
  checkout_id: string;
  checkout_url: string;
  status: string;
  expires_at?: string;
};

export async function createBachsCheckout(input: {
  amount: string;
  email: string;
  name: string;
  phone?: string | null;
  reference: string;
  idempotencyKey: string;
  successUrl: string;
  cancelUrl: string;
  userId: string;
}) {
  const { apiKey, baseUrl } = credentials();
  const response = await fetch(`${baseUrl}/v1/checkout-sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      pricing: { currency: "NGN", amount: input.amount },
      customer: {
        email: input.email,
        name: input.name,
        ...(input.phone ? { phone_number: input.phone } : {}),
      },
      reference: input.reference,
      metadata: { purpose: "wallet_funding", funda_user_id: input.userId },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      expires_in_minutes: 60,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  const body = await response.json().catch(() => null) as {
    data?: BachsCheckout;
    detail?: string;
    message?: string;
    error?: string | { message?: string };
    errors?: Array<{ field?: string; message?: string }>;
  } | BachsCheckout | null;
  if (!response.ok || !body) {
    const errorValue = body && "error" in body ? body.error : undefined;
    const fieldError = body && "errors" in body ? body.errors?.find((item) => item.message)?.message : undefined;
    const message = body && "detail" in body && body.detail
      ? body.detail
      : typeof errorValue === "string"
        ? errorValue
        : errorValue?.message || (body && "message" in body ? body.message : undefined) || fieldError;
    throw new Error(message || `Bachs checkout failed (${response.status}).`);
  }
  const checkout = "data" in body && body.data ? body.data : body as BachsCheckout;
  if (!checkout.checkout_id || !checkout.checkout_url) throw new Error("Bachs returned an invalid checkout response.");
  return checkout;
}

export function verifyBachsWebhook(rawBody: string, timestamp: string | null, signature: string | null) {
  const secret = process.env.BACHS_WEBHOOK_SECRET?.trim();
  if (!secret || !timestamp || !signature || !/^\d+$/.test(timestamp) || !/^[a-f\d]{64}$/i.test(signature)) return false;
  const sentAt = Number(timestamp);
  if (!Number.isSafeInteger(sentAt) || Math.abs(Date.now() / 1000 - sentAt) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}
