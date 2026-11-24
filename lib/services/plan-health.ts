import "server-only";

import { createAdminClient } from "../supabase/admin";

export type PlanHealthStatus = "healthy" | "advisory" | "degraded" | "outage" | "unverified";
export type HealthOverrideMode = "auto" | "healthy" | "advisory" | "outage";
export type VendorErrorKind = "subscriber_ineligible" | "plan_unavailable" | "provider_wallet_sim" | "unknown";

export type PlanProbeRecord = {
  ok: boolean;
  status: "successful" | "pending" | "failed";
  provider: string;
  latencyMs: number;
  message: string;
  checkedAt: string;
};

export type PlanHealthSnapshot = {
  status: PlanHealthStatus;
  overrideStatus?: HealthOverrideMode;
  customNotice?: string | null;
  catalogueAvailable: boolean | null;
  marginOk: boolean;
  recentTotal: number;
  recentSuccess: number;
  recentFailed: number;
  successRate: number | null;
  consecutiveFailures: number;
  errorKind: VendorErrorKind | null;
  lastError: string | null;
  lastErrorAt: string | null;
  lastSuccessAt: string | null;
  lastProbe?: PlanProbeRecord | null;
  updatedAt: string;
};

export type CustomerPlanHealth = {
  status: PlanHealthStatus;
  badge: string | null;
  notice: string | null;
  successRate: number | null;
};

export function classifyVendorError(
  message: string | null | undefined,
  planName?: string | null,
): { kind: VendorErrorKind; advisory: string } {
  const msg = String(message || "").trim();
  const plan = String(planName || "");

  if (
    /not available for this subscriber|not eligible|ineligible|not qualified|tariff|migrated|ported|already active|active bundle|not allowed for this line|sim is not|subscriber cannot|promo offer/i.test(
      msg,
    )
  ) {
    return {
      kind: "subscriber_ineligible",
      advisory: "Works only on eligible subscriber tariffs/SIMs",
    };
  }

  if (
    /insufficient|low balance|fund your wallet|wallet balance|no phone number added|active dispensing sim|no active sim|sim offline|merchant balance/i.test(
      msg,
    )
  ) {
    return {
      kind: "provider_wallet_sim",
      advisory: "Supplier balance or dispensing SIM pool needs attention",
    };
  }

  if (
    /invalid plan|plan.*not.*available|plan.*disabled|out of stock|discontinued|currently unavailable|unavailable right now|temporarily unavailable|service unavailable|mtn.*issue|airtel.*issue|glo.*issue|9mobile.*issue|sme.*down|gifting.*down|network.*down|failed on telco/i.test(
      msg,
    )
  ) {
    return {
      kind: "plan_unavailable",
      advisory: "Supplier or network route is reporting delivery issues",
    };
  }

  if (/\b(awoof|social|whatsapp|tiktok|youtube|pulse)\b/i.test(plan) && msg) {
    return {
      kind: "subscriber_ineligible",
      advisory: "Promo/targeted bundle may require an eligible SIM",
    };
  }

  return {
    kind: "unknown",
    advisory: msg || "Recent delivery failure recorded",
  };
}

export function looksPromoOrRestricted(planName: string | null | undefined): boolean {
  return /\b(awoof|social|whatsapp|tiktok|youtube|opera|instagram|facebook|yt\/ig|special|pulse)\b/i.test(
    String(planName || ""),
  );
}

export function deriveCustomerHealth(product: {
  name?: string | null;
  metadata?: Record<string, unknown> | null;
}): CustomerPlanHealth {
  const meta = (product.metadata ?? {}) as { health?: Partial<PlanHealthSnapshot> };
  const raw = meta.health;
  const override = raw?.overrideStatus && raw.overrideStatus !== "auto" ? raw.overrideStatus : null;
  const customNotice = typeof raw?.customNotice === "string" && raw.customNotice.trim() ? raw.customNotice.trim() : null;

  const status: PlanHealthStatus = override ?? (raw?.status as PlanHealthStatus | undefined) ?? (
    looksPromoOrRestricted(product.name) ? "advisory" : "healthy"
  );

  let badge: string | null = null;
  let notice: string | null = customNotice;

  if (status === "outage") {
    badge = "Unavailable";
    notice = notice ?? "Temporarily unavailable from supplier";
  } else if (status === "degraded") {
    badge = "Unstable";
    notice = notice ?? "High failure rate right now — failover active";
  } else if (status === "advisory") {
    badge = "Eligible SIMs";
    notice = notice ?? "Available for eligible subscriber numbers only";
  }

  return {
    status,
    badge,
    notice,
    successRate: typeof raw?.successRate === "number" ? raw.successRate : null,
  };
}

export async function refreshProductHealth(
  productId: string,
  latestEvent?: { outcome: "successful" | "failed" | "pending"; error?: string | null },
): Promise<PlanHealthSnapshot | null> {
  const client = createAdminClient();
  const { data: product, error } = await client
    .from("service_products")
    .select("id,name,provider_id,provider_product_code,provider_cost,selling_price,metadata")
    .eq("id", productId)
    .maybeSingle();

  if (error || !product) return null;

  const since14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: txRows }, { data: catalogueOffer }, { data: fallbackOffers }] = await Promise.all([
    client
      .from("service_transactions")
      .select("id,status,failure_reason,metadata,created_at")
      .eq("product_id", productId)
      .gte("created_at", since14d)
      .in("status", ["successful", "failed", "refunded", "reversed"])
      .order("created_at", { ascending: false })
      .limit(15),
    product.provider_id && product.provider_product_code
      ? client
          .from("provider_catalogue_items")
          .select("is_available,provider_cost")
          .eq("provider_id", product.provider_id)
          .eq("provider_product_code", product.provider_product_code)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    client
      .from("product_provider_offers")
      .select("provider_id,provider_product_code,provider_cost,priority,status")
      .eq("product_id", productId)
      .eq("status", "active")
      .order("priority", { ascending: true }),
  ]);

  const rows = txRows ?? [];
  let recentSuccess = 0;
  let recentFailed = 0;
  let consecutiveFailures = 0;
  let countingStreak = true;
  let lastError: string | null = null;
  let lastErrorAt: string | null = null;
  let lastSuccessAt: string | null = null;

  for (const row of rows) {
    if (row.status === "successful") {
      recentSuccess += 1;
      countingStreak = false;
      if (!lastSuccessAt) lastSuccessAt = String(row.created_at);
    } else {
      recentFailed += 1;
      if (countingStreak) consecutiveFailures += 1;
      if (!lastError) {
        const meta = (row.metadata ?? {}) as { providerMessage?: string };
        lastError = row.failure_reason || meta.providerMessage || "Delivery failed";
        lastErrorAt = String(row.created_at);
      }
    }
  }

  if (latestEvent?.outcome === "failed" && latestEvent.error) {
    lastError = latestEvent.error;
    lastErrorAt = new Date().toISOString();
  } else if (latestEvent?.outcome === "successful") {
    lastSuccessAt = new Date().toISOString();
  }

  const recentTotal = recentSuccess + recentFailed;
  const successRate = recentTotal > 0 ? Math.round((recentSuccess / recentTotal) * 100) : null;
  const classified = lastError ? classifyVendorError(lastError, product.name) : null;

  const catalogueAvailable = catalogueOffer ? Boolean(catalogueOffer.is_available) : null;
  const hasActiveFallback = (fallbackOffers ?? []).some(
    (offer) => offer.provider_id !== product.provider_id || offer.provider_product_code !== product.provider_product_code,
  );
  const liveCost = catalogueOffer ? Number(catalogueOffer.provider_cost) : Number(product.provider_cost ?? 0);
  const marginOk = Number(product.selling_price ?? 0) >= liveCost;

  const existingMeta = ((product.metadata ?? {}) as Record<string, unknown>) || {};
  const prevHealth = (existingMeta.health as Partial<PlanHealthSnapshot> | undefined) ?? {};

  let computedStatus: PlanHealthStatus = "healthy";
  if (catalogueAvailable === false && !hasActiveFallback) {
    computedStatus = "outage";
    if (!lastError) lastError = "Plan is no longer present in live supplier catalogue sync.";
  } else if (!product.provider_id || !product.provider_product_code) {
    computedStatus = "unverified";
  } else if (classified?.kind === "subscriber_ineligible") {
    if (recentTotal >= 5 && (successRate ?? 100) < 35 && consecutiveFailures >= 4) {
      computedStatus = "degraded";
    } else {
      computedStatus = "advisory";
    }
  } else if (consecutiveFailures >= 3 || (recentTotal >= 4 && (successRate ?? 100) <= 25)) {
    computedStatus = "outage";
  } else if (
    consecutiveFailures >= 2 ||
    (recentTotal >= 3 && (successRate ?? 100) < 75) ||
    classified?.kind === "plan_unavailable" ||
    !marginOk
  ) {
    computedStatus = "degraded";
  } else if (prevHealth.lastProbe && !prevHealth.lastProbe.ok) {
    computedStatus = "degraded";
  } else if (looksPromoOrRestricted(product.name)) {
    computedStatus = "advisory";
  }

  const snapshot: PlanHealthSnapshot = {
    status: computedStatus,
    overrideStatus: prevHealth.overrideStatus ?? "auto",
    customNotice: prevHealth.customNotice ?? null,
    catalogueAvailable,
    marginOk,
    recentTotal,
    recentSuccess,
    recentFailed,
    successRate,
    consecutiveFailures,
    errorKind: classified?.kind ?? prevHealth.errorKind ?? null,
    lastError,
    lastErrorAt,
    lastSuccessAt,
    lastProbe: prevHealth.lastProbe ?? null,
    updatedAt: new Date().toISOString(),
  };

  await client
    .from("service_products")
    .update({
      metadata: {
        ...existingMeta,
        health: snapshot,
      },
    })
    .eq("id", productId);

  return snapshot;
}

export async function verifyAllDataBundlesHealth(): Promise<{
  checked: number;
  healthy: number;
  advisory: number;
  degraded: number;
  outage: number;
  missingFromCatalogue: number;
  marginWarnings: number;
}> {
  const client = createAdminClient();
  const { data: bundles } = await client
    .from("service_products")
    .select("id")
    .eq("service_type", "data");

  const summary = {
    checked: 0,
    healthy: 0,
    advisory: 0,
    degraded: 0,
    outage: 0,
    missingFromCatalogue: 0,
    marginWarnings: 0,
  };

  for (const bundle of bundles ?? []) {
    const snap = await refreshProductHealth(String(bundle.id));
    if (!snap) continue;
    summary.checked += 1;
    const effective = snap.overrideStatus && snap.overrideStatus !== "auto" ? snap.overrideStatus : snap.status;
    if (effective === "healthy") summary.healthy += 1;
    else if (effective === "advisory") summary.advisory += 1;
    else if (effective === "degraded") summary.degraded += 1;
    else if (effective === "outage") summary.outage += 1;
    if (snap.catalogueAvailable === false) summary.missingFromCatalogue += 1;
    if (!snap.marginOk) summary.marginWarnings += 1;
  }

  return summary;
}
