import type { DataPlan, NetworkId, PurchaseInput, PurchaseResult, RechargePinItem, VtuVendor } from "../types";
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
    throw new ProviderRequestError(message, response.status >= 400 && response.status < 500 && ![408, 409, 429].includes(response.status));
  }
  return payload;
}

const MASKAWA_DISCO_IDS: Record<string, number> = {
  ikedc: 1,
  ikeja: 1,
  ekedc: 2,
  eko: 2,
  aedc: 3,
  abuja: 3,
  kedco: 4,
  kano: 4,
  eedc: 5,
  enugu: 5,
  phed: 6,
  port_harcourt: 6,
  portharcourt: 6,
  ibedc: 7,
  ibadan: 7,
  kaedco: 8,
  kaduna: 8,
  jed: 9,
  jos: 9,
  bedc: 10,
  benin: 10,
  yedc: 11,
  yola: 11,
};

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
    const network = input.network || "mtn";
    const netId = networkIds[network] || 1;

    if (input.type === "electricity") {
      const discoKey = (input.disco || "ikedc").toLowerCase();
      const discoId = MASKAWA_DISCO_IDS[discoKey] || 1;
      const payload = await call("/billpayment/", {
        method: "POST",
        body: JSON.stringify({
          disco_name: discoId,
          amount: input.amount,
          meter_number: input.meterNumber,
          MeterType: input.meterType === "postpaid" ? "Postpaid" : "Prepaid",
          Customer_Phone: cleanPhone || "08012345678",
        }),
      });

      const token = payload.token || payload.Token || payload.mainToken || payload.purchased_code;
      const units = payload.units || payload.Units;
      return {
        status: "successful",
        reference: input.reference,
        providerReference: String(payload.id || payload.ident || payload.reference || input.reference),
        message: payload.message || "Electricity token generated via Maskawasub.",
        token: token ? String(token) : undefined,
        units: units ? String(units) : undefined,
        raw: payload,
      };
    }

    if (input.type === "airtime" && input.mode === "epin") {
      const quantity = Math.max(1, Math.min(20, Number(input.quantity || 1)));
      const unitValue = Math.round(input.amount / quantity);
      const payload = await call("/rechargepin/", {
        method: "POST",
        body: JSON.stringify({
          network: netId,
          network_amount: unitValue,
          quantity,
          name_on_card: (input.cardName || "Funda").slice(0, 20),
        }),
      });

      const statusStr = String(payload.Status || payload.status || "").toLowerCase();
      const isSuccess = statusStr === "successful" || statusStr === "success" || payload.status === true;
      const isFailed = statusStr === "failed" || statusStr === "error" || payload.status === false;

      const rawPins = Array.isArray(payload.data_pin)
        ? payload.data_pin
        : Array.isArray(payload.pins)
        ? payload.pins
        : payload.pin
        ? [{ pin: payload.pin, serial: payload.serial }]
        : [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pins: RechargePinItem[] = rawPins.map((item: any) => {
        const pinCode = String(typeof item === "string" ? item : item?.pin ?? item?.fields?.pin ?? item?.code ?? "").trim();
        const serial = item?.serial ?? item?.fields?.serial ?? item?.pk ? String(item?.serial ?? item?.fields?.serial ?? item?.pk) : undefined;
        return {
          pin: pinCode,
          serial,
          amount: unitValue,
          network,
          dialCode: `*311*${pinCode.replace(/\s+/g, "")}#`,
        };
      }).filter((p: RechargePinItem) => Boolean(p.pin));

      return {
        status: isSuccess ? "successful" : isFailed ? "failed" : "pending",
        reference: input.reference,
        providerReference: payload.id || payload.ident || payload.reference ? String(payload.id || payload.ident || payload.reference) : undefined,
        message: payload.message || payload.msg || `${quantity}x ₦${unitValue} ${network.toUpperCase()} recharge PIN generated via Maskawasub.`,
        pins,
        raw: payload,
      };
    }

    if (input.type === "airtime") {
      const payload = await call("/topup/", {
        method: "POST",
        body: JSON.stringify({
          network: netId,
          amount: input.amount,
          mobile_number: cleanPhone,
          Ported_number: true,
          airtime_type: "VTU",
        }),
      });

      const statusStr = String(payload.Status || payload.status || "").toLowerCase();
      const isSuccess = statusStr === "successful" || statusStr === "success" || payload.status === true;
      const isFailed = statusStr === "failed" || statusStr === "error" || payload.status === false;

      if (isFailed && !isSuccess) {
        const msg = payload.msg || payload.message || payload.error || "Maskawasub airtime purchase failed.";
        throw new ProviderRequestError(msg, true);
      }

      return {
        status: isSuccess ? "successful" : "pending",
        reference: input.reference,
        providerReference: String(payload.id || payload.ident || payload.reference || input.reference),
        message: payload.message || payload.msg || `₦${input.amount.toLocaleString("en-NG")} ${network.toUpperCase()} airtime delivered via Maskawasub.`,
        raw: payload,
      };
    }

    // Convert plan ID to number if numeric
    const planIdStr = String(input.planId || "");
    const numericPlan = Number.parseInt(planIdStr, 10);
    const planValue = Number.isNaN(numericPlan) ? planIdStr : numericPlan;

    const payload = await call("/data/", {
      method: "POST",
      body: JSON.stringify({
        network: netId,
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
