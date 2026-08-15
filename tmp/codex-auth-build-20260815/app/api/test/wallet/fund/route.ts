import { initializePayment } from "@/lib/test-engine/flutterwave";
import { safeError, serviceReference } from "@/lib/test-engine/utils";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const amount = Number(body.amount);
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "");
    if (!Number.isFinite(amount) || amount < 100 || amount > 500000) throw new Error("Funding amount must be between ₦100 and ₦500,000.");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
    const reference = serviceReference("fund");
    const appUrl = process.env.APP_URL || new URL(request.url).origin;
    const checkoutUrl = await initializePayment({
      reference, amount, email, phone, name: String(body.name || "Test Customer"),
      redirectUrl: `${appUrl}/test`,
      meta: { purpose: "wallet_funding", expected_amount: amount, test_user: email },
    });
    return Response.json({ checkoutUrl, reference });
  } catch (error) {
    return Response.json({ error: safeError(error) }, { status: 400 });
  }
}
