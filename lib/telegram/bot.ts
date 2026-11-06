import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml } from "./format";

export type SendNotificationParams = {
  threadId: string;
  ticketCode?: string | null;
  senderName: string;
  senderEmail?: string | null;
  senderPhone?: string | null;
  messageText: string;
  currentPage?: string | null;
  userMessageId?: string;
};

export async function sendTelegramNotification(params: SendNotificationParams): Promise<{ success: boolean; telegramMessageId?: number; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (!token || !adminChatId) {
    console.warn("[Telegram Bot] Bot credentials missing (TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID). Skipping Telegram alert.");
    return { success: false, error: "Telegram credentials not configured" };
  }

  const supabase = createAdminClient();

  let code = params.ticketCode;
  if (!code) {
    const { data: t } = await supabase.from("support_threads").select("ticket_code").eq("id", params.threadId).maybeSingle();
    code = t?.ticket_code || params.threadId.slice(0, 8).toUpperCase();
  }

  const formattedTime = new Date().toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });

  const text = [
    `<b>💬 New Funda Live Chat</b> <code>[#FD-${code}]</code>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `👤 <b>Customer:</b> ${escapeHtml(params.senderName)}`,
    params.senderPhone ? `📞 <b>Phone:</b> ${escapeHtml(params.senderPhone)}` : null,
    params.senderEmail ? `✉️ <b>Email:</b> ${escapeHtml(params.senderEmail)}` : null,
    params.currentPage ? `📍 <b>Page:</b> <code>${escapeHtml(params.currentPage)}</code>` : null,
    `🕒 <b>Time:</b> ${formattedTime}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `<b>Message:</b>`,
    `<i>${escapeHtml(params.messageText)}</i>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `👉 <b>Swipe / Reply directly to this message</b> to answer the user instantly on the web!`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: adminChatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    const json = await res.json();
    if (!json.ok) {
      console.error("[Telegram Bot] Error sending message:", json);
      return { success: false, error: json.description || "Telegram API error" };
    }

    const tgMessageId = json.result.message_id as number;
    const tgChatId = json.result.chat.id as number;

    // Record mapping in database
    await supabase.from("telegram_message_mappings").insert({
      telegram_message_id: tgMessageId,
      telegram_chat_id: tgChatId,
      thread_id: params.threadId,
    });

    // If user message id was provided, associate it
    if (params.userMessageId) {
      await supabase
        .from("support_messages")
        .update({ telegram_message_id: tgMessageId })
        .eq("id", params.userMessageId);
    }

    return { success: true, telegramMessageId: tgMessageId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to call Telegram API";
    console.error("[Telegram Bot] Exception calling Telegram API:", msg);
    return { success: false, error: msg };
  }
}

/**
 * Helper to send a confirmation or note back into the Telegram admin chat.
 */
export async function sendTelegramAdminConfirmation(chatId: number | string, text: string, replyToMessageId?: number) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_to_message_id: replyToMessageId,
        parse_mode: "HTML",
      }),
    });
  } catch (err) {
    console.error("[Telegram Bot] Failed to send admin confirmation:", err);
  }
}
