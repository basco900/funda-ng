import type { DataPlan, NetworkId, PurchaseResult, VtuVendor } from "../types";
import { ProviderRequestError, providerMessage } from "../utils";

const defaultBase = "https://gladtidingsapihub.com/api";

const vendorState = globalThis as typeof globalThis & { __gladUnavailablePlans?: Set<string> };
const unavailablePlans = vendorState.__gladUnavailablePlans ??= new Set<string>();

function planKey(network: NetworkId, planId: string | undefined) {
  return `${network}:${planId ?? ""}`;
}

function isPlanDisabled(network: NetworkId, planId: string) {
  const configured = new Set((process.env.GLADTIDINGS_DISABLED_PLAN_IDS || "").split(",").map((id) => id.trim()).filter(Boolean));
  return configured.has(planId) || unavailablePlans.has(planKey(network, planId));
}

function settings() {
  const token = process.env.GLADTIDINGS_API_TOKEN;
  if (!token) throw new Error("GladTidings is waiting for its API token.");
  return { base: (process.env.GLADTIDINGS_BASE_URL || defaultBase).replace(/\/$/, ""), token };
}

async function call(path: string, init?: RequestInit) {
  const { base, token } = settings();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Token ${token}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ProviderRequestError(providerMessage(payload, `GladTidings returned ${response.status}.`), response.status >= 400 && response.status < 500);
  }
  return payload;
}

// The authenticated dashboard API has several historical response shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function records(payload: any): Record<string, any>[] {
  if (Array.isArray(payload)) return payload;
  for (const key of ["results", "data", "plans", "networks"]) if (Array.isArray(payload?.[key])) return payload[key];
  return [];
}

function normalizedNetworkName(value: unknown) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "").replace("etisalat", "9mobile");
}

async function networkId(network: NetworkId) {
  const payload = await call("/network/");
  const plans = plansForNetwork(payload, network);
  const id = Number(plans[0]?.network);
  if (!Number.isFinite(id)) throw new Error(`GladTidings did not return a ${network} network ID.`);
  return id;
}

// GladTidings' /network/ endpoint returns plan arrays grouped as MTN_PLAN, GLO_PLAN, etc.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function plansForNetwork(payload: any, network: NetworkId): Record<string, any>[] {
  const expected = normalizedNetworkName(network);
  for (const [key, value] of Object.entries(payload || {})) {
    if (!Array.isArray(value)) continue;
    const first = value[0];
    if (normalizedNetworkName(first?.plan_network) === expected || normalizedNetworkName(key.replace(/_PLAN$/i, "")) === expected) return value;
  }
  return [];
}

// GladTidings returns different result fields for data, airtime, and history.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resultStatus(payload: Record<string, any>): PurchaseResult["status"] {
  const value = String(payload.Status ?? payload.status ?? payload.data?.status ?? "").toLowerCase();
  if (payload.status === true || ["success", "successful", "delivered", "completed"].includes(value)) return "successful";
  if (payload.status === false || ["failed", "failure", "reversed", "cancelled"].includes(value)) return "failed";
  return "pending";
}

export const gladtidings: VtuVendor = {
  id: "gladtidings",
  isConfigured: () => Boolean(process.env.GLADTIDINGS_API_TOKEN),

  async getDataPlans(network) {
    const payload = await call("/network/");
    return plansForNetwork(payload, network)
      .map((plan): DataPlan => ({
        id: String(plan.dataplan_id ?? plan.id),
        name: `${plan.plan ?? "Data"} - ${plan.plan_type ?? "Bundle"} - ${plan.month_validate ?? ""}`.trim(),
        amount: Number(plan.plan_amount ?? plan.amount ?? plan.price ?? plan.actual_price),
        network,
        vendor: "gladtidings",
      }))
      .filter((plan) => plan.id !== "undefined" && Number.isFinite(plan.amount) && plan.amount > 0 && plan.amount <= 100_000 && !/unavailable/i.test(plan.name)
        && !isPlanDisabled(network, plan.id));
  },

  async purchase(input) {
    const id = await networkId(input.network);
    let payload;
    try {
      payload = await call(input.type === "data" ? "/data/" : "/topup/", {
        method: "POST",
        body: JSON.stringify(input.type === "data" ? {
          network: id,
          mobile_number: input.phone,
          plan: input.planId && /^\d+$/.test(input.planId) ? Number(input.planId) : input.planId,
          Ported_number: true,
        } : {
          network: id,
          amount: input.amount,
          mobile_number: input.phone,
          Ported_number: true,
          airtime_type: "VTU",
        }),
      });
    } catch (error) {
      if (input.type === "data" && error instanceof ProviderRequestError && /not currently available|unavailable/i.test(error.message)) {
        unavailablePlans.add(planKey(input.network, input.planId));
        throw new ProviderRequestError(`${error.message} The plan has been removed from this test session; choose another bundle.`, true);
      }
      throw error;
    }
    return {
      status: resultStatus(payload),
      reference: input.reference,
      providerReference: String(payload.ident ?? payload.reference ?? payload.data?.reference ?? payload.id ?? ""),
      message: String(payload.message ?? payload.api_response ?? payload.data?.message ?? "GladTidings accepted the request."),
      raw: payload,
    };
  },

  async requery(reference) {
    const payload = await call(`/history/?search=${encodeURIComponent(reference)}`);
    const item = records(payload).find((entry) => String(entry.reference ?? entry.ident ?? entry.id) === reference) ?? records(payload)[0];
    if (!item) return { status: "pending", reference, message: "GladTidings has not returned a matching history record yet." };
    return {
      status: resultStatus(item),
      reference,
      providerReference: String(item.ident ?? item.reference ?? item.id ?? ""),
      message: String(item.message ?? item.api_response ?? "GladTidings history status received."),
      raw: item,
    };
  },
};
