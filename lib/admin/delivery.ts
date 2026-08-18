import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "../supabase/admin";

type Channel = "in_app" | "email" | "sms" | "push" | "whatsapp";

type Campaign = {
  id: string;
  channel: Channel;
  subject: string | null;
  content: string;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function configured(value: string | undefined) {
  return Boolean(value?.trim());
}

async function sendEmail(input: { to: string; subject: string; content: string }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.FUNDA_EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new Error("Email delivery is not configured. Add RESEND_API_KEY and FUNDA_EMAIL_FROM.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: input.to, subject: input.subject, text: input.content }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({})) as { id?: string; message?: string };
  if (!response.ok) throw new Error(payload.message || `Email provider rejected the message (${response.status}).`);
  return { provider: "resend", reference: payload.id ?? null };
}

async function sendSms(input: { to: string; content: string }) {
  const apiKey = process.env.TERMII_API_KEY?.trim();
  const sender = process.env.TERMII_SENDER_ID?.trim();
  if (!apiKey || !sender) throw new Error("SMS delivery is not configured. Add TERMII_API_KEY and TERMII_SENDER_ID.");
  const response = await fetch("https://api.ng.termii.com/api/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: input.to, from: sender, sms: input.content, type: "plain", channel: "generic", api_key: apiKey }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({})) as { message_id?: string; message?: string };
  if (!response.ok) throw new Error(payload.message || `SMS provider rejected the message (${response.status}).`);
  return { provider: "termii", reference: payload.message_id ?? null };
}

function validPhone(value: string | undefined) {
  return Boolean(value && /^\+?[1-9]\d{7,14}$/.test(value.replace(/[\s()-]/g, "")));
}

export async function deliverNotification(outboxId: string) {
  const client = createAdminClient();
  const { data: outbox, error } = await client
    .from("notification_outbox")
    .select("id,message_delivery_id,channel,payload,attempts,status")
    .eq("id", outboxId)
    .single();
  if (error || !outbox) throw new Error("Notification outbox item was not found.");
  if (["sent", "suppressed"].includes(outbox.status)) return { status: outbox.status, skipped: true };

  const { data: delivery, error: deliveryError } = await client
    .from("message_deliveries")
    .select("id,user_id,campaign_id,status")
    .eq("id", outbox.message_delivery_id)
    .single();
  if (deliveryError || !delivery) throw new Error("Message delivery was not found.");
  const { data: campaign, error: campaignError } = await client
    .from("message_campaigns")
    .select("id,channel,subject,content")
    .eq("id", delivery.campaign_id)
    .single();
  if (campaignError || !campaign) throw new Error("Message campaign was not found.");

  await client.from("notification_outbox").update({ status: "sending", attempts: Number(outbox.attempts) + 1 }).eq("id", outbox.id);
  await client.from("message_deliveries").update({ status: "sending" }).eq("id", delivery.id);
  await client.from("notification_delivery_attempts").insert({ outbox_id: outbox.id, status: "sending" });

  try {
    const campaignData = campaign as Campaign;
    if (campaignData.channel === "in_app") {
      if (!delivery.user_id) throw new Error("In-app notifications need a customer account.");
      const { error: notificationError } = await client.from("user_notifications").upsert({
        user_id: delivery.user_id,
        delivery_id: delivery.id,
        title: campaignData.subject || "A note from Funda",
        body: campaignData.content,
        kind: "campaign",
      }, { onConflict: "delivery_id" });
      if (notificationError) throw notificationError;
      await markSent(client, outbox.id, delivery.id, "funda", null);
      return { status: "sent", provider: "funda" };
    }

    if (!delivery.user_id) throw new Error("This message has no customer destination.");
    const { data: userResult, error: userError } = await client.auth.admin.getUserById(delivery.user_id);
    if (userError || !userResult.user) throw new Error("Customer contact details are unavailable.");
    const user = userResult.user;
    const phone = user.phone?.replace(/[\s()-]/g, "") || undefined;
    const email = user.email?.trim().toLowerCase();
    let result: { provider: string; reference: string | null };
    if (campaignData.channel === "email") {
      if (!email) throw new Error("Customer has no verified email address.");
      result = await sendEmail({ to: email, subject: campaignData.subject || "A note from Funda", content: campaignData.content });
      await client.from("message_deliveries").update({ destination_hash: sha256(email) }).eq("id", delivery.id);
    } else if (campaignData.channel === "sms") {
      if (!validPhone(phone)) throw new Error("Customer has no valid phone number.");
      result = await sendSms({ to: phone!, content: campaignData.content });
      await client.from("message_deliveries").update({ destination_hash: sha256(phone!) }).eq("id", delivery.id);
    } else {
      throw new Error(`${campaignData.channel} delivery is not configured for production use.`);
    }
    await markSent(client, outbox.id, delivery.id, result.provider, result.reference);
    return { status: "sent", provider: result.provider };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Notification delivery failed.";
    const suppress = /no (verified email|valid phone|customer account|customer destination)|not configured/i.test(message);
    await client.from("notification_outbox").update({ status: suppress ? "suppressed" : "failed", last_error: message.slice(0, 2000) }).eq("id", outbox.id);
    await client.from("message_deliveries").update({ status: suppress ? "suppressed" : "failed", error_message: message.slice(0, 2000) }).eq("id", delivery.id);
    await client.from("notification_delivery_attempts").insert({ outbox_id: outbox.id, status: suppress ? "suppressed" : "failed", error_message: message.slice(0, 2000) });
    throw new Error(message);
  }
}

async function markSent(client: ReturnType<typeof createAdminClient>, outboxId: string, deliveryId: string, provider: string, reference: string | null) {
  const now = new Date().toISOString();
  const [{ error: outboxError }, { error: deliveryError }] = await Promise.all([
    client.from("notification_outbox").update({ status: "sent", provider, provider_reference: reference, sent_at: now, last_error: null }).eq("id", outboxId),
    client.from("message_deliveries").update({ status: "sent", provider, provider_reference: reference, sent_at: now, error_message: null }).eq("id", deliveryId),
  ]);
  if (outboxError || deliveryError) throw new Error("Notification was sent but its delivery record could not be updated.");
  await client.from("notification_delivery_attempts").insert({ outbox_id: outboxId, status: "sent", provider, provider_reference: reference });
}

export function deliveryConfiguration() {
  return {
    email: configured(process.env.RESEND_API_KEY) && configured(process.env.FUNDA_EMAIL_FROM),
    sms: configured(process.env.TERMII_API_KEY) && configured(process.env.TERMII_SENDER_ID),
  };
}
