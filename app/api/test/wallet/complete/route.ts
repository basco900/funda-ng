import { verifyPayment } from "@/lib/test-engine/flutterwave";
import { creditWallet } from "@/lib/test-engine/wallet";
import { safeError } from "@/lib/test-engine/utils";

export async function POST(request: Request) {
  try {
    const { transactionId } = await request.json();
    const payment = await verifyPayment(String(transactionId || ""));
    if (payment.status !== "successful" || payment.currency !== "NGN") throw new Error("Wallet funding payment is not successful.");
    if (payment.meta?.purpose !== "wallet_funding") throw new Error("This payment is not a wallet funding transaction.");
    const expected = Number(payment.meta?.expected_amount);
    if (!Number.isFinite(expected) || Number(payment.amount) < expected) throw new Error("Payment amount does not match the funding request.");
    const balance = creditWallet(String(payment.tx_ref), expected);
    return Response.json({ balance, credited: expected });
  } catch (error) {
    return Response.json({ error: safeError(error) }, { status: 400 });
  }
}
