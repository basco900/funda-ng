import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "../supabase/admin";

/** Abuse limits for the public coupon endpoints, and the anonymous voter identity. */

const windows = new Map<string, { count: number; resetAt: number }>();

/** Fixed-window limiter, per server instance: `max` actions per `windowMs`. */
export function allow(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || entry.resetAt < now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    if (windows.size > 20_000) for (const [k, v] of windows) if (v.resetAt < now) windows.delete(k);
    return true;
  }
  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

/** A stable, anonymous voter key: a random cookie, hashed so raw values never reach the database. */
export async function voterKey() {
  const jar = await cookies();
  let token = jar.get("funda_cv")?.value;
  if (!token || token.length < 20) {
    token = randomUUID();
    jar.set("funda_cv", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
  }
  return createHash("sha256").update(`coupon-voter:${token}`).digest("hex").slice(0, 48);
}

/** Live refreshes cost money: capped per day across the whole site (COUPON_LIVE_DAILY_LIMIT). */
export async function liveRefreshBudgetLeft() {
  const cap = Number(process.env.COUPON_LIVE_DAILY_LIMIT || 150);
  const client = createAdminClient();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await client.from("coupon_refresh_runs").select("id", { count: "exact", head: true }).eq("trigger", "live").gte("started_at", since);
  return Math.max(0, cap - (count ?? 0));
}
