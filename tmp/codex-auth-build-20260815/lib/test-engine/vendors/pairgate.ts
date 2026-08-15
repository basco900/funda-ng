import type { DataPlan, NetworkId, PurchaseInput, PurchaseResult, VtuVendor } from "../types";
import { ProviderRequestError, providerMessage } from "../utils";

const planTypes = ["CG", "CG_LITE", "SME", "GIFTING", "AWOOF"] as const;

function configuration() {
  const key = process.env.PAIRGATE_API_KEY;
  if (!key) throw new Error("Pairgate is waiting for its API key.");
  return {
    base: (process.env.PAIRGATE_BASE_URL || "https://pairgate.com/api/v1").replace(/\/$/, ""),
    key,
    testMode: process.env.PAIRGATE_TEST_MODE !== "false",
  };
}

async function call(path: string, init?: RequestInit) {
  const { base, key } = configuration();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Cache-Control": "no-cache",
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || payload.status === "error") {
    throw new ProviderRequestError(
      providerMessage(payload, `Pairgate returned ${response.status}.`),
      response.status >= 400 && response.status < 500,
    );
  }
  return payload;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resultStatus(payload: Record<string, any>): PurchaseResult["status"] {
  if (payload.data?.test_mode === true) return "successful";
  const status = String(payload.data?.status ?? payload.status ?? "").toLowerCase();
  if (["successful", "success", "completed", "delivered"].includes(status)) return "successful";
  if (["failed", "failure", "reversed", "cancelled"].includes(status)) return "failed";
  return "pending";
}

export const pairgate: VtuVendor = {
  id: "pairgate",
  isConfigured: () => Boolean(process.env.PAIRGATE_API_KEY),

  async getDataPlans(network: NetworkId) {
    const { testMode } = configuration();
    const settled = await Promise.allSettled(planTypes.map(async (planType) => {
      const query = new URLSearchParams({ provider_id: network, plan_type: planType });
      const payload = await call(`${testMode ? "/test" : ""}/data-plans?${query}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const grouped = (payload.data ?? {}) as Record<string, Record<string, any>[]>;
      const plans = Object.values(grouped).find(Array.isArray) ?? [];
      return plans.map((plan): DataPlan => ({
        id: String(plan.plan_id),
        name: `${String(plan.name || "Data bundle")} - ${planType}`,
        amount: Number(plan.price),
        network,
        vendor: "pairgate",
      }));
    }));
    const plans = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    if (!plans.length) {
      const rejected = settled.find((result) => result.status === "rejected");
      if (rejected?.status === "rejected") throw rejected.reason;
    }
    return [...new Map(plans.filter((plan) => plan.id !== "undefined" && Number.isFinite(plan.amount) && plan.amount > 0)
      .map((plan) => [plan.id, plan])).values()].sort((a, b) => a.amount - b.amount);
  },

  async purchase(input: PurchaseInput) {
    const { testMode } = configuration();
    const payload = await call(`${testMode ? "/test" : ""}/${input.type}/purchase`, {
      method: "POST",
      body: JSON.stringify(input.type === "data" ? {
        provider_id: input.network,
        plan_id: input.planId,
        recipient: input.phone,
        reference: input.reference,
      } : {
        provider_id: input.network,
        amount: input.amount,
        recipient: input.phone,
        reference: input.reference,
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as Record<string, any>;
    const providerReference = String(payload.data?.reference_code ?? input.reference);
    return {
      status: resultStatus(payload),
      reference: providerReference,
      providerReference,
      message: String(payload.data?.message ?? (testMode ? "Pairgate test passed; no provider balance was deducted and nothing was delivered." : "Pairgate accepted the request.")),
      raw: payload,
    };
  },

  async requery(reference: string) {
    const { testMode } = configuration();
    const query = new URLSearchParams({ reference_code: reference });
    // Pairgate test purchases are completed immediately and do not issue a transaction code.
    if (testMode) return { status: "successful", reference, providerReference: reference, message: "Pairgate test purchase completed without delivery or provider deduction." };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = await call(`/transaction/status?${query}`) as Record<string, any>;
    return {
      status: resultStatus(payload),
      reference,
      providerReference: String(payload.data?.reference_code ?? reference),
      message: String(payload.data?.message ?? `Pairgate transaction is ${payload.data?.status ?? "pending"}.`),
      raw: payload,
    };
  },
};
