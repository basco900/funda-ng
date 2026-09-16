import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type PurchaseReceiptData = {
  userId: string;
  transactionId: string;
  reference: string;
  providerReference?: string | null;
  productName: string;
  amount: number;
  cashback?: number;
  destination: string;
  network?: string;
  serviceType: string;
  status: "successful" | "failed" | "pending";
  message?: string;
  balance?: number;
};

export async function dispatchPurchaseReceipt(data: PurchaseReceiptData) {
  const client = createAdminClient();

  // 1. In-App Notification Record
  try {
    const isSuccess = data.status === "successful";
    const isFailed = data.status === "failed";
    const title = isSuccess ? "Purchase Successful" : isFailed ? "Purchase Refunded" : "Purchase Processing";
    const body = `${data.productName} for ${data.destination} · ₦${data.amount.toLocaleString("en-NG")} — ${data.message || (isSuccess ? "Delivered successfully" : "Status pending")}`;

    await client.from("user_notifications").insert({
      user_id: data.userId,
      title,
      body,
      kind: "transaction",
    });

    await client.from("transaction_events").insert({
      transaction_id: data.transactionId,
      event_type: "customer_notified",
      summary: title,
      actor_type: "system",
      metadata: { channel: "in_app", reference: data.reference },
    });
  } catch (err) {
    console.warn("[Receipt] In-app notification error:", err);
  }

  // 2. Automated Email Receipt (Resend)
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (resendApiKey) {
    try {
      const { data: userRecord } = await client.auth.admin.getUserById(data.userId);
      const email = userRecord?.user?.email?.trim();

      if (email) {
        const fromEmail = process.env.FUNDA_EMAIL_FROM?.trim() || "Funda Receipts <onboarding@resend.dev>";
        const isSuccess = data.status === "successful";
        const statusColor = isSuccess ? "#10b981" : data.status === "failed" ? "#ef4444" : "#f59e0b";
        const statusText = isSuccess ? "Successful" : data.status === "failed" ? "Failed / Refunded" : "Processing";

        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Receipt - Funda</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 32px 16px;">
  <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.04);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
      <div style="display: inline-block; width: 44px; height: 44px; border-radius: 50%; background: ${statusColor}; color: white; line-height: 44px; font-size: 22px; margin-bottom: 12px;">
        ${isSuccess ? "✓" : "!"}
      </div>
      <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">Payment Receipt</h1>
      <p style="margin: 6px 0 0; font-size: 14px; color: #94a3b8;">${statusText} Transaction</p>
    </div>

    <!-- Amount Hero -->
    <div style="padding: 24px; text-align: center; border-bottom: 1px solid #f1f5f9; background: #fafafa;">
      <span style="font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Amount Paid</span>
      <div style="font-size: 32px; font-weight: 800; color: #0f172a; margin-top: 4px;">₦${data.amount.toLocaleString("en-NG")}</div>
      ${data.cashback && data.cashback > 0 ? `<div style="display: inline-block; margin-top: 8px; padding: 4px 12px; background: #ecfdf5; border-radius: 999px; font-size: 12px; font-weight: 600; color: #059669;">+₦${data.cashback} Cashback Credited</div>` : ""}
    </div>

    <!-- Receipt Breakdown -->
    <div style="padding: 24px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 12px 0; color: #64748b;">Product</td>
          <td style="padding: 12px 0; text-align: right; font-weight: 600; color: #0f172a;">${data.productName}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 12px 0; color: #64748b;">Recipient</td>
          <td style="padding: 12px 0; text-align: right; font-weight: 600; color: #0f172a;">${data.destination}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 12px 0; color: #64748b;">Reference</td>
          <td style="padding: 12px 0; text-align: right; font-family: monospace; font-size: 13px; color: #0f172a;">${data.reference}</td>
        </tr>
        ${data.providerReference ? `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 12px 0; color: #64748b;">Provider Ref</td>
          <td style="padding: 12px 0; text-align: right; font-family: monospace; font-size: 13px; color: #64748b;">${data.providerReference}</td>
        </tr>` : ""}
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 12px 0; color: #64748b;">Payment Method</td>
          <td style="padding: 12px 0; text-align: right; font-weight: 600; color: #0f172a;">Funda Wallet</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; color: #64748b;">Date & Time</td>
          <td style="padding: 12px 0; text-align: right; color: #0f172a;">${new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })}</td>
        </tr>
      </table>
    </div>

    <!-- Footer -->
    <div style="background: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; font-size: 12px; color: #94a3b8;">
        Thank you for choosing Funda. Need help? Reach out at support@funda.ng
      </p>
    </div>
  </div>
</body>
</html>`;

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: email,
            subject: `Receipt: ${data.productName} (₦${data.amount.toLocaleString("en-NG")})`,
            html,
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
      }
    } catch (err) {
      console.warn("[Receipt] Email delivery error:", err);
    }
  }

  // 3. Optional SMS Alert (Termii)
  const termiiApiKey = process.env.TERMII_API_KEY?.trim();
  const termiiSender = process.env.TERMII_SENDER_ID?.trim();
  if (termiiApiKey && termiiSender && data.status === "successful") {
    try {
      const cleanDest = data.destination.startsWith("0") ? `234${data.destination.slice(1)}` : data.destination;
      await fetch("https://api.ng.termii.com/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: cleanDest,
          from: termiiSender,
          sms: `Funda: ₦${data.amount} ${data.productName} to ${data.destination} was successful. Ref: ${data.reference}. Thank you!`,
          type: "plain",
          channel: "generic",
          api_key: termiiApiKey,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
    } catch (err) {
      console.warn("[Receipt] SMS alert error:", err);
    }
  }
}
