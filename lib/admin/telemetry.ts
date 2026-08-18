import "server-only";

import { createAdminClient } from "../supabase/admin";

const sensitiveKeys = /authorization|cookie|password|secret|token|api[-_]?key|otp|pin|card|cvv|account_number/i;

export function redactOperationalPayload(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[depth-limited]";
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactOperationalPayload(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 200).map(([key, item]) => [key, sensitiveKeys.test(key) ? "[redacted]" : redactOperationalPayload(item, depth + 1)]));
  if (typeof value === "string") return value.slice(0, 4000);
  return value;
}

export async function recordProviderApiCall(input: { requestId: string; provider?: string; transactionReference?: string; method: string; endpoint: string; request?: unknown; response?: unknown; httpStatus?: number; latencyMs?: number; outcome: "successful" | "failed" | "timeout" | "cancelled" }) {
  const client = createAdminClient();
  const endpoint = input.endpoint.split("?")[0].replace(/\b\d{6,}\b/g, "[id]").slice(0, 1000);
  const { error } = await client.from("api_request_logs").insert({ request_id: input.requestId.slice(0, 200), provider: input.provider ?? null, transaction_reference: input.transactionReference ?? null, method: input.method.toUpperCase().slice(0, 12), endpoint_redacted: endpoint, request_redacted: redactOperationalPayload(input.request) ?? {}, response_redacted: redactOperationalPayload(input.response) ?? {}, http_status: input.httpStatus ?? null, latency_ms: input.latencyMs ?? null, outcome: input.outcome });
  if (error) throw new Error("Provider API telemetry could not be recorded.");
}

export async function recordSystemHealth(input: { component: string; status: "operational" | "degraded" | "down" | "unknown"; latencyMs?: number; message?: string; metadata?: unknown }) {
  const client = createAdminClient();
  const { error } = await client.from("system_health_checks").insert({ component: input.component.slice(0, 100), status: input.status, latency_ms: input.latencyMs ?? null, message: input.message?.slice(0, 1000) ?? null, metadata: redactOperationalPayload(input.metadata) ?? {} });
  if (error) throw new Error("System health result could not be recorded.");
}

export async function recordWebhookDelivery(input: { provider: string; eventId?: string; eventType?: string; direction: "incoming" | "outgoing"; status: "received" | "processed" | "failed" | "retrying" | "ignored" | "unknown"; httpStatus?: number; payload?: unknown; errorMessage?: string; attemptCount?: number }) {
  const client = createAdminClient();
  const { error } = await client.from("webhook_delivery_logs").insert({ provider: input.provider.slice(0, 80), event_id: input.eventId?.slice(0, 200) ?? null, event_type: input.eventType?.slice(0, 120) ?? null, direction: input.direction, status: input.status, http_status: input.httpStatus ?? null, payload_redacted: redactOperationalPayload(input.payload) ?? {}, error_message: input.errorMessage?.slice(0, 2000) ?? null, attempt_count: input.attemptCount ?? 1, processed_at: input.status === "processed" ? new Date().toISOString() : null });
  if (error) throw new Error("Webhook telemetry could not be recorded.");
}
