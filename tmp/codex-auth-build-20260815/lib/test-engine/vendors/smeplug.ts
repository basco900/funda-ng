import type { DataPlan, NetworkId, PurchaseInput, PurchaseResult, VtuVendor } from "../types";
import { ProviderRequestError, providerMessage } from "../utils";

function configuration() {
  const base = process.env.SMEPLUG_BASE_URL || "https://smeplug.ng/api/v1";
  const key = process.env.SMEPLUG_SECRET_KEY || process.env.SMEPLUG_API_KEY;
  if (!key) throw new Error("SMEPlug is waiting for its private API key.");
  return { base: base.replace(/\/$/, ""), key };
}

async function call(path: string, init?: RequestInit) {
  const { base, key } = configuration();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...init?.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    let message = providerMessage(payload, `SMEPlug returned ${response.status}.`);
    if (/no phone number added|active sim/i.test(message)) {
      message = "Your SMEPlug account has no active dispensing SIM/number for this network. Add the network line in the SMEPlug dashboard, or use GladTidings for this purchase.";
    }
    throw new ProviderRequestError(message, response.status >= 400 && response.status < 500);
  }
  return payload;
}

const networkIds: Record<NetworkId, number> = { mtn: 1, airtel: 2, "9mobile": 3, glo: 4 };

// SMEPlug's exact response contract will be narrowed when its private docs arrive.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function statusOf(payload: Record<string, any>): PurchaseResult["status"] {
  if (payload.status === true && !payload.data?.current_status) return "successful";
  if (payload.status === false) return "failed";
  const status = String(payload.status ?? payload.data?.current_status ?? payload.data?.status ?? "").toLowerCase();
  if (["success", "successful", "delivered", "completed"].includes(status)) return "successful";
  if (["failed", "failure", "reversed", "cancelled"].includes(status)) return "failed";
  return "pending";
}

export const smeplug: VtuVendor = {
  id: "smeplug",
  isConfigured: () => Boolean(process.env.SMEPLUG_SECRET_KEY || process.env.SMEPLUG_API_KEY),
  async getDataPlans(network: NetworkId) {
    const payload = await call("/data/plans");
    const plans = payload.data?.[String(networkIds[network])] ?? [];
    if (!Array.isArray(plans)) throw new Error("SMEPlug plan response needs mapping after you provide its documentation.");
    // The official collection publishes string-valued IDs and prices.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return plans.map((plan: Record<string, any>): DataPlan => ({
      id: String(plan.id),
      name: String(plan.name),
      amount: Number(plan.price),
      network,
      vendor: "smeplug",
    }));
  },
  async purchase(input: PurchaseInput) {
    const path = input.type === "data" ? "/data/purchase" : "/airtime/purchase";
    const payload = await call(path, {
      method: "POST",
      body: JSON.stringify(input.type === "data" ? {
        network_id: networkIds[input.network],
        plan_id: input.planId && /^\d+$/.test(input.planId) ? Number(input.planId) : input.planId,
        phone: input.phone,
        customer_reference: input.reference,
      } : {
        network_id: networkIds[input.network],
        phone: input.phone,
        amount: input.amount,
        customer_reference: input.reference,
      }),
    });
    return {
      status: statusOf(payload),
      reference: input.reference,
      providerReference: String(payload.data?.reference ?? payload.reference ?? ""),
      message: payload.data?.msg ?? payload.message ?? "SMEPlug accepted the request.",
      raw: payload,
    };
  },
  async requery(reference: string) {
    const payload = await call(`/transactions/${encodeURIComponent(reference)}`);
    return {
      status: statusOf(payload),
      reference,
      providerReference: String(payload.reference ?? payload.data?.reference ?? ""),
      message: payload.response ?? payload.memo ?? payload.message ?? "SMEPlug transaction status received.",
      raw: payload,
    };
  },
};
