import type { DataPlan, NetworkId, PurchaseInput, PurchaseResult, VtuVendor } from "../types";
import { ProviderRequestError, normalizePhone, providerMessage } from "../utils";

function configuration() {
  const base = process.env.ABS_VENDOR_BASE_URL || process.env.ABSVENDOR_BASE_URL || "https://absvendor.com";
  const key = process.env.ABS_VENDOR_API_KEY || process.env.ABSVENDOR_API_KEY;
  if (!key) throw new Error("ABS Vendor API key is not configured.");
  return { base: base.replace(/\/$/, ""), key };
}

async function call(path: string, init?: RequestInit) {
  const { base, key } = configuration();
  const fullUrl = path.startsWith("http") ? path : `${base}${path}`;
  const response = await fetch(fullUrl, {
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
    const message = providerMessage(payload, `ABS Vendor returned HTTP ${response.status}.`);
    throw new ProviderRequestError(message, response.status >= 400 && response.status < 500);
  }
  return payload;
}

const networkIds: Record<NetworkId, string> = {
  mtn: "MTN56TFD",
  airtel: "AIRYU78TFD",
  glo: "GLO536TFD",
  "9mobile": "9MOB67YT",
};

export const absvendor: VtuVendor = {
  id: "absvendor",
  isConfigured: () => {
    return Boolean(process.env.ABS_VENDOR_API_KEY || process.env.ABSVENDOR_API_KEY);
  },

  async getDataPlans(network: NetworkId): Promise<DataPlan[]> {
    try {
      const payload = await call("/api/partner/v1/data_plans.php");
      const list = Array.isArray(payload) ? payload : (payload.plans || payload.data || []);
      const targetNetworkId = networkIds[network];

      return list
        .filter((item: any) => {
          const itemNetId = String(item.network_id || "");
          const itemNetName = String(item.plan_network || item.network || "").toLowerCase();
          return itemNetId === targetNetworkId || itemNetName.includes(network.toLowerCase());
        })
        .map((item: any) => ({
          id: String(item.id || item.plan_id),
          name: String(item.plan_name || item.name || `${network.toUpperCase()} Data`),
          amount: parseFloat(item.plan_amount || item.price || item.amount || "0"),
          network,
          vendor: "absvendor" as const,
          validity: item.validity || (item.validity_type ? `${item.validity_type}` : "30 days"),
          raw: item,
        }));
    } catch (error) {
      console.error("[ABS Vendor] Error fetching live data plans:", error);
      // Fallback
      if (network === "mtn") {
        return [
          { id: "1Y5K5", name: "MTN 1GB Special 🔥- 30 days", amount: 299, network: "mtn", vendor: "absvendor", validity: "30 days" },
          { id: "BM5O7", name: "MTN 2GB Special (2×1GB) 🔥— 30 Days", amount: 600, network: "mtn", vendor: "absvendor", validity: "30 days" },
          { id: "VHXS2", name: "MTN 3GB Special (3×1GB) 🔥— 30 Days", amount: 900, network: "mtn", vendor: "absvendor", validity: "30 days" },
          { id: "525UN", name: "MTN 5GB Special (5×1GB) 🔥 — 30 Days", amount: 1500, network: "mtn", vendor: "absvendor", validity: "30 days" },
          { id: "3YM0B", name: "MTN 500MB Daily", amount: 190, network: "mtn", vendor: "absvendor", validity: "1 day" },
        ];
      }
      return [];
    }
  },

  async purchase(input: PurchaseInput): Promise<PurchaseResult> {
    const destination = normalizePhone(input.phone);
    const cleanPhone = destination.startsWith("234") ? `0${destination.slice(3)}` : destination;
    const isSandbox = process.env.ABS_VENDOR_SANDBOX === "true";
    const pin = process.env.ABS_VENDOR_PIN || "1234";

    const payload = await call("/api/partner/v1/data.php", {
      method: "POST",
      body: JSON.stringify({
        network: networkIds[input.network] || input.network.toUpperCase(),
        plan: input.planId,
        mobile_number: cleanPhone,
        pin,
        sandbox: isSandbox,
      }),
    });

    const statusStr = String(payload.Status || payload.status || payload.current_status || "").toLowerCase();
    const isSuccess = statusStr === "successful" || statusStr === "success" || payload.status === true;
    const isFailed = statusStr === "failed" || statusStr === "error" || payload.status === false;

    if (isFailed && !isSuccess) {
      const msg = payload.message || payload.msg || "ABS Vendor transaction failed.";
      throw new ProviderRequestError(msg, true);
    }

    return {
      status: isSuccess ? "successful" : "pending",
      reference: input.reference,
      providerReference: payload.transaction?.reference || payload.reference || payload.orderid || undefined,
      message: payload.message || payload.msg || "Data delivered successfully via ABS Vendor.",
      raw: payload,
    };
  },

  async requery(reference: string): Promise<PurchaseResult> {
    try {
      const payload = await call(`/api/partner/v1/requery.php?reference=${encodeURIComponent(reference)}`);
      const statusStr = String(payload.Status || payload.status || payload.current_status || "").toLowerCase();
      const isSuccess = statusStr === "successful" || statusStr === "success" || payload.status === true;
      return {
        status: isSuccess ? "successful" : "pending",
        reference,
        providerReference: payload.transaction?.reference || payload.reference || payload.orderid || reference,
        message: payload.message || payload.msg || "ABS Vendor status received.",
        raw: payload,
      };
    } catch {
      return {
        status: "pending",
        reference,
        providerReference: reference,
        message: "ABS Vendor query in progress.",
      };
    }
  },
};
