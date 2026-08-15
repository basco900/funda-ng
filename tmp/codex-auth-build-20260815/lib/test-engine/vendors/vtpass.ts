import type { DataPlan, NetworkId, PurchaseResult, VtuVendor } from "../types";
import { safeError, vtpassReference } from "../utils";

const dataServices: Record<NetworkId, string> = {
  mtn: "mtn-data",
  airtel: "airtel-data",
  glo: "glo-data",
  "9mobile": "etisalat-data",
};

const airtimeServices: Record<NetworkId, string> = {
  mtn: "mtn",
  airtel: "airtel",
  glo: "glo",
  "9mobile": "etisalat",
};

function baseUrl() {
  return process.env.VTPASS_ENV === "live" ? "https://vtpass.com/api" : "https://sandbox.vtpass.com/api";
}

function headers(method: "GET" | "POST") {
  const apiKey = process.env.VTPASS_API_KEY;
  const publicKey = process.env.VTPASS_PUBLIC_KEY;
  const secretKey = process.env.VTPASS_SECRET_KEY;
  if (!apiKey || !publicKey || !secretKey) throw new Error("VTpass credentials are not configured.");
  return {
    "Content-Type": "application/json",
    "api-key": apiKey,
    ...(method === "GET" ? { "public-key": publicKey } : { "secret-key": secretKey }),
  };
}

// VTpass responses contain provider-specific nested fields not covered by a published schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStatus(payload: Record<string, any>): PurchaseResult["status"] {
  const inner = String(payload?.content?.transactions?.status ?? "").toLowerCase();
  if (["delivered", "successful", "success"].includes(inner)) return "successful";
  if (["failed", "reversed"].includes(inner)) return "failed";
  if (payload.code === "000" && !inner) return "successful";
  return "pending";
}

export const vtpass: VtuVendor = {
  id: "vtpass",
  isConfigured: () => Boolean(process.env.VTPASS_API_KEY && process.env.VTPASS_PUBLIC_KEY && process.env.VTPASS_SECRET_KEY),

  async getDataPlans(network) {
    try {
      const response = await fetch(`${baseUrl()}/service-variations?serviceID=${dataServices[network]}`, {
        headers: headers("GET"),
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.response_description || "VTpass could not load plans.");
      const variations = payload?.content?.variations ?? payload?.content?.varations ?? [];
      return variations.map((plan: Record<string, string>): DataPlan => ({
        id: plan.variation_code,
        name: plan.name,
        amount: Number(plan.variation_amount),
        network,
        vendor: "vtpass",
      }));
    } catch (error) {
      throw new Error(safeError(error));
    }
  },

  async purchase(input) {
    const requestId = vtpassReference(input.reference);
    const body: Record<string, string | number> = {
      request_id: requestId,
      serviceID: input.type === "data" ? dataServices[input.network] : airtimeServices[input.network],
      phone: input.phone,
      amount: input.amount,
    };
    if (input.type === "data") {
      body.billersCode = input.phone;
      body.variation_code = input.planId ?? "";
    }
    const response = await fetch(`${baseUrl()}/pay`, {
      method: "POST",
      headers: headers("POST"),
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.response_description || "VTpass purchase request failed.");
    return {
      status: mapStatus(payload),
      reference: requestId,
      providerReference: payload?.content?.transactions?.transactionId,
      message: payload?.response_description || "VTpass accepted the request.",
      raw: payload,
    };
  },

  async requery(reference) {
    const response = await fetch(`${baseUrl()}/requery`, {
      method: "POST",
      headers: headers("POST"),
      body: JSON.stringify({ request_id: reference }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.response_description || "VTpass requery failed.");
    return {
      status: mapStatus(payload),
      reference,
      providerReference: payload?.content?.transactions?.transactionId,
      message: payload?.response_description || "Transaction status received.",
      raw: payload,
    };
  },
};
