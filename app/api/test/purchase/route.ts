import { testOrders, type TestOrder } from "@/lib/test-engine/journal";
import type { NetworkId, ServiceType, VendorId } from "@/lib/test-engine/types";
import { getVendor } from "@/lib/test-engine/vendors";
import { debitWallet, refundWallet, testWallet } from "@/lib/test-engine/wallet";
import { ProviderRequestError, isNigerianPhone, normalizePhone, safeError, serviceReference } from "@/lib/test-engine/utils";

export async function POST(request: Request) {
  let order: TestOrder | undefined;
  try {
    const body = await request.json();
    const type = body.type as ServiceType;
    const network = body.network as NetworkId;
    const vendor = body.vendor as VendorId;
    const phone = normalizePhone(String(body.phone || ""));
    if (!["data", "airtime"].includes(type)) throw new Error("Choose data or airtime.");
    if (!["mtn", "airtel", "glo", "9mobile"].includes(network)) throw new Error("Choose a valid network.");
    if (!["vtpass", "smeplug", "gladtidings", "pairgate"].includes(vendor)) throw new Error("Choose a valid vendor.");
    if (!isNigerianPhone(phone)) throw new Error("Enter a valid Nigerian phone number.");
    const adapter = getVendor(vendor);
    if (!adapter.isConfigured()) throw new Error(`${vendor} is not configured yet.`);
    let amount = Number(body.amount);
    let planId: string | undefined;
    let planName: string | undefined;
    if (type === "data") {
      planId = String(body.planId || "");
      const plan = (await adapter.getDataPlans(network)).find((item) => item.id === planId);
      if (!plan) throw new Error("That plan is no longer available.");
      amount = plan.amount;
      planName = plan.name;
    } else if (!Number.isFinite(amount) || amount < 50 || amount > 50000) throw new Error("Airtime amount must be between ₦50 and ₦50,000.");
    const reference = serviceReference("buy");
    order = { reference, email: String(body.email || ""), phone, type, network, vendor, planId, planName, amount, status: "processing", createdAt: new Date().toISOString() };
    debitWallet(reference, amount);
    testOrders.set(reference, order);
    const result = await adapter.purchase({ type, network, phone, amount, planId, reference });
    order.result = result;
    order.status = result.status === "successful" ? "complete" : result.status === "failed" ? "failed" : "processing";
    if (result.status === "failed") refundWallet(reference, amount);
    return Response.json({ order, balance: testWallet.balance });
  } catch (error) {
    // Validation/authentication rejections are definitive. Timeouts and 5xx results stay pending to avoid a delivery plus refund.
    if (order && error instanceof ProviderRequestError && error.definitive) {
      refundWallet(order.reference, order.amount);
      order.status = "failed";
      order.result = { status: "failed", reference: order.reference, message: error.message };
    }
    return Response.json({ error: safeError(error), order, balance: testWallet.balance }, { status: 400 });
  }
}
