import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type PurchaseReceiptData = {
  userId: string;
  transactionId: string;
  reference: string;
  providerReference?: string | null;
  productName: string;
  amount: number;
  originalAmount?: number;
  discountAmount?: number;
  couponCode?: string | null;
  cashback?: number;
  destination: string;
  network?: string;
  serviceType: string;
  mode?: "vtu" | "epin";
  pinCount?: number;
  token?: string | null;
  units?: string | null;
  status: "successful" | "failed" | "pending";
  message?: string;
  balance?: number;
  refunded?: boolean;
};

export async function dispatchPurchaseReceipt(data: PurchaseReceiptData, options: { waitForDelivery?: boolean } = {}) {
  const client = createAdminClient();
  const deliveryId = (kind: string) => createHash("sha256").update(`${data.transactionId}:${data.status}:${kind}`).digest("hex").slice(0, 32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");

  // 1. In-App Notification Record (awaited so it is immediately persisted)
  try {
    const isSuccess = data.status === "successful";
    const isFailed = data.status === "failed";
    const isEpin = data.mode === "epin" || /e-pin|recharge pin/i.test(data.productName);
    const isData = data.serviceType === "data";
    const isElectricity = data.serviceType === "electricity";
    const isTv = data.serviceType === "tv" || data.serviceType === "cable_tv" || data.serviceType === "cable";
    const isEducation = data.serviceType === "education";

    const title = isSuccess
      ? isElectricity
        ? "Electricity Token Generated"
        : isTv
        ? "Cable TV Renewed"
        : isEducation
        ? "Exam PIN / Token Generated"
        : isEpin
        ? "Recharge PIN Generated"
        : isData
        ? "Data Bundle Activated"
        : "Airtime Top-Up Successful"
      : isFailed
      ? data.refunded === false ? "Purchase Failed" : "Purchase Refunded"
      : "Purchase Processing";

    const body =
      isSuccess && isElectricity && data.token
        ? `Token: ${data.token}${data.units ? ` (${data.units} kWh)` : ""} for meter ${data.destination} (${data.productName}).`
        : isSuccess && isTv
        ? `Renewed ${data.productName} for smartcard ${data.destination}. ${data.message || "Active immediately."}`
        : isSuccess && isEducation
        ? `${data.productName} · ₦${data.amount.toLocaleString("en-NG")} — ${data.token ? `PIN: ${data.token}. ` : ""}${data.pinCount && data.pinCount > 1 ? `${data.pinCount}× PINs generated. ` : ""}${data.message || "Ready for instant checking."}`
        : isSuccess && isEpin
        ? `${data.productName} · ₦${data.amount.toLocaleString("en-NG")} — ${data.pinCount ?? 0} PINs ready in your receipt vault.`
        : `${data.productName} for ${data.destination} · ₦${data.amount.toLocaleString("en-NG")} — ${data.message || (isSuccess ? "Delivered successfully" : "Status pending")}`;

    const notification = await client.from("user_notifications").upsert({
      id: deliveryId("notification"),
      user_id: data.userId,
      title,
      body,
      kind: "transaction",
    }, { onConflict: "id", ignoreDuplicates: true });
    if (notification.error) throw new Error("Receipt notification could not be saved.");

    await client.from("transaction_events").upsert({
      id: deliveryId("event"),
      transaction_id: data.transactionId,
      event_type: "customer_notified",
      summary: title,
      actor_type: "system",
      metadata: { channel: "in_app", reference: data.reference },
    }, { onConflict: "id", ignoreDuplicates: true });
  } catch (err) {
    if (options.waitForDelivery) throw err;
    console.warn("[Receipt] In-app notification error:", err);
  }

  // 2. Automated Email Receipt (Resend) & SMS (Termii) in background
  const deliver = async () => {
    const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (resendApiKey) {
    try {
      const { data: userRecord } = await client.auth.admin.getUserById(data.userId);
      const email = userRecord?.user?.email?.trim();

      if (email) {
        const fromEmail = process.env.FUNDA_EMAIL_FROM?.trim() || "Funda Receipts <onboarding@resend.dev>";
        const isSuccess = data.status === "successful";
        const isFailed = data.status === "failed";
        const statusBg = isSuccess ? "#ecfdf5" : isFailed ? "#fef2f2" : "#fffbeb";
        const statusTextColor = isSuccess ? "#15803d" : isFailed ? "#b91c1c" : "#b45309";
        const statusText = isSuccess ? "Successful" : isFailed ? "Failed" : "Processing";
        const escapeHtml = (value: string) =>
          value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] || ch);
        const safeProduct = escapeHtml(data.productName);
        const safeDestination = escapeHtml(data.destination);
        const safeReference = escapeHtml(data.reference);
        const safeProviderRef = data.providerReference ? escapeHtml(data.providerReference) : "";
        const formattedTime = new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" });

        const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>Receipt · Funda</title>
</head>
<body style="margin:0;padding:0;background-color:#fbfbfa;color:#0b0b0c;font-family:-apple-system,BlinkMacSystemFont,'DM Sans','Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#fbfbfa;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;background-color:#ffffff;border:1px solid #eceae8;border-radius:18px;box-shadow:0 8px 24px rgba(0,0,0,0.04);">
          <tr>
            <td style="padding:28px 28px 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="font-size:22px;font-weight:700;letter-spacing:-0.04em;color:#0b0b0c;line-height:1;">
                    funda<span style="color:#660033;">.</span>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;padding:5px 10px;border-radius:8px;background-color:${statusBg};color:${statusTextColor};font-size:12px;font-weight:600;line-height:1;">
                      ${statusText}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#fbfbfa;border:1px solid #f0efed;border-radius:12px;">
                <tr>
                  <td style="padding:22px 20px;">
                    <div style="font-size:32px;font-weight:700;letter-spacing:-0.03em;color:#0b0b0c;line-height:1.1;">&#8358;${data.amount.toLocaleString("en-NG")}</div>
                    ${data.cashback && data.cashback > 0 ? `<div style="display:inline-block;margin-top:10px;padding:4px 10px;border-radius:8px;background-color:#f8eff4;color:#660033;font-size:12px;font-weight:600;">+&#8358;${data.cashback} cashback</div>` : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size:13.5px;line-height:1.45;">
                <tr>
                  <td style="padding:11px 0;color:#6f6e6b;border-bottom:1px solid #f3f2f0;">Product</td>
                  <td align="right" style="padding:11px 0;font-weight:600;color:#0b0b0c;border-bottom:1px solid #f3f2f0;">${safeProduct}</td>
                </tr>
                <tr>
                  <td style="padding:11px 0;color:#6f6e6b;border-bottom:1px solid #f3f2f0;">Recipient</td>
                  <td align="right" style="padding:11px 0;font-weight:600;color:#0b0b0c;border-bottom:1px solid #f3f2f0;">${safeDestination}</td>
                </tr>
                ${data.discountAmount && data.discountAmount > 0 ? `<tr>
                  <td style="padding:11px 0;color:#6f6e6b;border-bottom:1px solid #f3f2f0;">Discount${data.couponCode ? ` (${escapeHtml(data.couponCode)})` : ""}</td>
                  <td align="right" style="padding:11px 0;font-weight:600;color:#15803d;border-bottom:1px solid #f3f2f0;">-&#8358;${data.discountAmount.toLocaleString("en-NG")}</td>
                </tr>` : ""}
                <tr>
                  <td style="padding:11px 0;color:#6f6e6b;border-bottom:1px solid #f3f2f0;">Reference</td>
                  <td align="right" style="padding:11px 0;font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;color:#0b0b0c;border-bottom:1px solid #f3f2f0;">${safeReference}</td>
                </tr>
                ${safeProviderRef ? `<tr>
                  <td style="padding:11px 0;color:#6f6e6b;border-bottom:1px solid #f3f2f0;">Provider ref</td>
                  <td align="right" style="padding:11px 0;font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;color:#6f6e6b;border-bottom:1px solid #f3f2f0;">${safeProviderRef}</td>
                </tr>` : ""}
                <tr>
                  <td style="padding:11px 0;color:#6f6e6b;border-bottom:1px solid #f3f2f0;">Payment</td>
                  <td align="right" style="padding:11px 0;font-weight:600;color:#0b0b0c;border-bottom:1px solid #f3f2f0;">Funda Wallet</td>
                </tr>
                <tr>
                  <td style="padding:11px 0;color:#6f6e6b;">Date</td>
                  <td align="right" style="padding:11px 0;color:#0b0b0c;">${formattedTime}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 24px;border-top:1px solid #f2f0ee;font-size:12px;color:#6f6e6b;">
              funda.ng &middot; support@funda.ng
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `receipt:${data.transactionId}:${data.status}`,
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
        if (!emailResponse.ok) throw new Error("Receipt email delivery was rejected.");
      }
    } catch (err) {
      if (options.waitForDelivery) throw err;
      console.warn("[Receipt] Email delivery error:", err);
    }
  }

  // 3. Optional SMS Alert (Termii)
  const termiiApiKey = process.env.TERMII_API_KEY?.trim();
  const termiiSender = process.env.TERMII_SENDER_ID?.trim();
  if (termiiApiKey && termiiSender && data.status === "successful" && data.mode !== "epin" && /^(?:0|234)[789]\d{9}$/.test(data.destination)) {
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
  };
  if (options.waitForDelivery) await deliver();
  else after(deliver);
}
