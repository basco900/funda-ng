import "server-only";

import { createHmac, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { materializeAdminSession, type AdminSession } from "./auth";
import { createAdminClient } from "../supabase/admin";

export type AdminRequestMetadata = {
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string;
};

function securityPepper() {
  return process.env.FUNDA_ADMIN_SECURITY_PEPPER
    || process.env.SUPABASE_SECRET_KEY
    || "funda-admin-unconfigured-pepper";
}

export function hashAdminLoginIdentifier(email: string) {
  return createHmac("sha256", securityPepper())
    .update(email.trim().toLowerCase())
    .digest("hex");
}

export async function getAdminRequestMetadata(): Promise<AdminRequestMetadata> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const connectingIp = requestHeaders.get("cf-connecting-ip") || requestHeaders.get("x-real-ip");
  return {
    ipAddress: forwarded || connectingIp || null,
    userAgent: requestHeaders.get("user-agent")?.slice(0, 1000) || null,
    requestId: requestHeaders.get("x-request-id")?.slice(0, 200) || randomUUID(),
  };
}

export async function adminLoginRateLimited(email: string, metadata: AdminRequestMetadata) {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const emailHash = hashAdminLoginIdentifier(email);
    const { count: emailFailures, error: emailError } = await admin
      .from("admin_login_events")
      .select("id", { count: "exact", head: true })
      .eq("email_hash", emailHash)
      .in("outcome", ["invalid_credentials", "access_denied", "two_factor_failed"])
      .gte("created_at", since);
    if (emailError) return false;

    let ipFailures = 0;
    if (metadata.ipAddress) {
      const { count, error } = await admin
        .from("admin_login_events")
        .select("id", { count: "exact", head: true })
        .eq("ip_address", metadata.ipAddress)
        .in("outcome", ["invalid_credentials", "access_denied", "two_factor_failed"])
        .gte("created_at", since);
      if (!error) ipFailures = count ?? 0;
    }

    return (emailFailures ?? 0) >= 5 || ipFailures >= 12;
  } catch {
    // Supabase Auth still applies its own rate limits while the admin migration is pending.
    return false;
  }
}

export async function recordAdminLoginEvent(
  email: string,
  outcome: "succeeded" | "invalid_credentials" | "access_denied" | "rate_limited" | "two_factor_failed",
  metadata: AdminRequestMetadata,
) {
  try {
    const admin = createAdminClient();
    await admin.from("admin_login_events").insert({
      email_hash: hashAdminLoginIdentifier(email),
      outcome,
      ip_address: metadata.ipAddress,
      user_agent: metadata.userAgent,
    });
  } catch {
    // Authentication must remain available during the initial migration bootstrap.
  }
}

export type AdminAuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
};

export async function recordAdminAudit(
  adminSession: AdminSession,
  input: AdminAuditInput,
  metadata?: AdminRequestMetadata,
) {
  const request = metadata ?? await getAdminRequestMetadata();
  const adminUserId = await materializeAdminSession(adminSession);
  const client = createAdminClient();
  const { error } = await client.from("admin_audit_logs").insert({
    admin_user_id: adminUserId,
    actor_email: adminSession.email,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    old_value: input.oldValue ?? null,
    new_value: input.newValue ?? null,
    reason: input.reason ?? null,
    ip_address: request.ipAddress,
    user_agent: request.userAgent,
    request_id: request.requestId,
  });
  if (error) throw new Error("The administrative action could not be audited.");
}
