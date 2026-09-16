import type { DataPlan, NetworkId, PurchaseInput, PurchaseResult, VtuVendor } from "../types";
import { ProviderRequestError, normalizePhone, providerMessage } from "../utils";

function configuration() {
  const base = process.env.MASKAWASUB_BASE_URL || "https://maskawasub.com/api";
  const key = process.env.MASKAWASUB_API_KEY || process.env.MASKAWASUB_API_TOKEN;
  if (!key) throw new Error("Maskawasub API key/token is not configured.");
  return { base: base.replace(/\/$/, ""), key };
}

async function call(path: string, init?: RequestInit) {
  const { base, key } = configuration();
  const fullUrl = path.startsWith("http") ? path : `${base}${path}`;
  const response = await fetch(fullUrl, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${key}`,
      ...init?.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = providerMessage(payload, `Maskawasub returned HTTP ${response.status}.`);
    throw new ProviderRequestError(message, response.status >= 400 && response.status < 500);
  }
  return payload;
}

const networkIds: Record<NetworkId, number> = {
  mtn: 1,
  glo: 2,
  "9mobile": 3,
  airtel: 4,
};

function normalizedNetworkName(value: unknown) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "").replace("etisalat", "9mobile");
}

function plansForNetwork(payload: any, network: NetworkId): Record<string, any>[] {
  const expected = normalizedNetworkName(network);
  for (const [key, value] of Object.entries(payload || {})) {
    if (!Array.isArray(value)) continue;
    const first = value[0];
    if (normalizedNetworkName(first?.plan_network) === expected || normalizedNetworkName(key.replace(/_PLAN$/i, "")) === expected) return value;
  }
  return [];
}

export const maskawasub: VtuVendor = {
  id: "maskawasub",
  isConfigured: () => {
    return Boolean(process.env.MASKAWASUB_API_KEY || process.env.MASKAWASUB_API_TOKEN);
  },

  async getDataPlans(network: NetworkId): Promise<DataPlan[]> {
    try {
      // 1. Try MSorg dynamic /network/ catalog endpoint
      const payload = await call("/network/");
      const livePlans = plansForNetwork(payload, network);
      if (livePlans.length > 0) {
        return livePlans
          .map((plan): DataPlan => {
            const rawPrice = plan.Ambassador_price ?? plan.Reseller_price ?? plan.TopUser_price ?? plan.price ?? plan.plan_amount;
            const numPrice = typeof rawPrice === "number" ? rawPrice : parseFloat(String(rawPrice || "0").replace(/[^0-9.]/g, ""));
            return {
              id: String(plan.dataplan_id ?? plan.id),
              name: `${plan.plan ?? "Data"} ${plan.plan_type ?? "Data Share"} (${plan.month_validate ?? "30 days"})`.trim(),
              amount: numPrice,
              network,
              vendor: "maskawasub",
              validity: plan.month_validate || "30 days",
              raw: plan,
            };
          })
          .filter((p) => p.id && Number.isFinite(p.amount) && p.amount > 0);
      }
    } catch {
      // Fall through to dashboard verified plans
    }

    // Default verified MTN Data Share plans from user dashboard
    if (network === "mtn") {
      return [
        { id: "462", name: "MTN 500MB Data Share (30 Days)", amount: 260, network: "mtn", vendor: "maskawasub", validity: "30 days" },
        { id: "370", name: "MTN 1GB Data Share (7 Days)", amount: 365, network: "mtn", vendor: "maskawasub", validity: "7 days" },
        { id: "512", name: "MTN 1GB Data Share (30 Days)", amount: 530, network: "mtn", vendor: "maskawasub", validity: "30 days" },
        { id: "371", name: "MTN 2GB Data Share (30 Days)", amount: 800, network: "mtn", vendor: "maskawasub", validity: "30 days" },
        { id: "373", name: "MTN 3GB Data Share (30 Days)", amount: 1150, network: "mtn", vendor: "maskawasub", validity: "30 days" },
        { id: "372", name: "MTN 5GB Data Share (30 Days)", amount: 1550, network: "mtn", vendor: "maskawasub", validity: "30 days" },
      ];
    }
    return [];
  },

  async purchase(input: PurchaseInput): Promise<PurchaseResult> {
    const destination = normalizePhone(input.phone);
    const cleanPhone = destination.startsWith("234") ? `0${destination.slice(3)}` : destination;

    // Convert plan ID to number if numeric
    const planIdStr = String(input.planId || "");
    const numericPlan = Number.parseInt(planIdStr, 10);
    const planValue = Number.isNaN(numericPlan) ? planIdStr : numericPlan;

    const payload = await call("/data/", {
      method: "POST",
      body: JSON.stringify({
        network: networkIds[input.network] || 1,
        mobile_number: cleanPhone,
        plan: planValue,
        Ported_number: true,
      }),
    });

    const statusStr = String(payload.Status || payload.status || "").toLowerCase();
    const isSuccess = statusStr === "successful" || statusStr === "success" || payload.status === true;
    const isFailed = statusStr === "failed" || statusStr === "error" || payload.status === false;

    if (isFailed && !isSuccess) {
      const msg = payload.msg || payload.message || payload.error || "Maskawasub transaction failed.";
      throw new ProviderRequestError(msg, true);
    }

    return {
      status: isSuccess ? "successful" : "pending",
      reference: input.reference,
      providerReference: String(payload.id || payload.ident || payload.reference || input.reference),
      message: payload.message || payload.msg || "Data delivered successfully via Maskawasub.",
      raw: payload,
    };
  },

  async requery(reference: string): Promise<PurchaseResult> {
    try {
      const payload = await call(`/data/${encodeURIComponent(reference)}/`);
      const statusStr = String(payload.Status || payload.status || "").toLowerCase();
      const isSuccess = statusStr === "successful" || statusStr === "success" || payload.status === true;
      return {
        status: isSuccess ? "successful" : "pending",
        reference,
        providerReference: String(payload.id || payload.ident || payload.reference || reference),
        message: payload.message || payload.msg || "Maskawasub transaction status received.",
        raw: payload,
      };
    } catch {
      return {
        status: "pending",
        reference,
        providerReference: reference,
        message: "Maskawasub transaction query in progress.",
      };
    }
  },
};
