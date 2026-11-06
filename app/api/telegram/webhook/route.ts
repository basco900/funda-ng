import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTelegramAdminConfirmation } from "@/lib/telegram/bot";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // 1. Verify Secret Token if configured
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (webhookSecret) {
      const incomingSecret = request.headers.get("x-telegram-bot-api-secret-token");
      if (incomingSecret !== webhookSecret) {
        console.warn("[Telegram Webhook] Unauthorized request rejected.");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const update = await request.json().catch(() => null);
    if (!update) {
      return NextResponse.json({ ok: true, note: "Empty body" });
    }

    const message = update.message;
    if (!message || !message.text) {
      return NextResponse.json({ ok: true, note: "Ignored non-text message" });
    }

    const chatId = message.chat.id;
    const messageId = message.message_id;
    const text = message.text.trim();

    const supabase = createAdminClient();

    // -----------------------------------------------------------
    // Case A: Reply to a bot notification
    // -----------------------------------------------------------
    if (message.reply_to_message) {
      const originalMessageId = message.reply_to_message.message_id;
      const originalText = message.reply_to_message.text || "";

      let threadId: string | null = null;

      // 1. Try lookup via telegram_message_mappings
      const { data: mapping } = await supabase
        .from("telegram_message_mappings")
        .select("thread_id")
        .eq("telegram_message_id", originalMessageId)
        .maybeSingle();

      if (mapping?.thread_id) {
        threadId = mapping.thread_id;
      } else {
        // 2. Fallback: extract ticket code [#FD-XXXXXXXX] or [#T-XXXXXXXX]
        const ticketMatch = originalText.match(/\[#(?:FD-|T-)?([a-f0-9]{8})\]/i);
        if (ticketMatch) {
          const rawCode = ticketMatch[1].toUpperCase();
          const { data: matched } = await supabase
            .from("support_threads")
            .select("id")
            .eq("ticket_code", rawCode)
            .maybeSingle();

          if (matched?.id) {
            threadId = matched.id;
          }
        }
      }

      if (!threadId) {
        await sendTelegramAdminConfirmation(
          chatId,
          "⚠️ <i>Could not find the web chat thread for this message. The ticket may have expired.</i>",
          messageId
        );
        return NextResponse.json({ ok: true, note: "Thread not found for reply" });
      }

      const { data: thread } = await supabase
        .from("support_threads")
        .select("id, visitor_name, unread_user_count")
        .eq("id", threadId)
        .maybeSingle();

      if (!thread) {
        await sendTelegramAdminConfirmation(chatId, "⚠️ <i>Chat thread no longer exists.</i>", messageId);
        return NextResponse.json({ ok: true, note: "Thread not found" });
      }

      // Insert Support Reply into database
      await supabase.from("support_messages").insert({
        thread_id: threadId,
        sender_type: "support",
        sender_name: "Funda Support",
        message: text,
        telegram_message_id: messageId,
        is_read: false,
      });

      // Update Thread metadata
      await supabase
        .from("support_threads")
        .update({
          last_message: text,
          last_message_at: new Date().toISOString(),
          unread_user_count: (thread.unread_user_count || 0) + 1,
          status: "open",
          updated_at: new Date().toISOString(),
        })
        .eq("id", threadId);

      // Record this admin message in mappings as well so future replies to this reply also work
      await supabase.from("telegram_message_mappings").insert({
        telegram_message_id: messageId,
        telegram_chat_id: chatId,
        thread_id: threadId,
      });

      // Acknowledge in Telegram with quick checkmark note
      await sendTelegramAdminConfirmation(
        chatId,
        `✅ <b>Delivered to ${thread.visitor_name || "Customer"} on web!</b>`,
        messageId
      );

      return NextResponse.json({ ok: true, action: "delivered_reply", threadId });
    }

    // -----------------------------------------------------------
    // Case B: Slash Commands (/reply, /close, /status, /help)
    // -----------------------------------------------------------
    if (text.startsWith("/reply ")) {
      const parts = text.split(" ");
      const targetCode = parts[1]?.trim().replace(/^#(?:FD-|T-)?/i, "").toUpperCase();
      const replyMessage = parts.slice(2).join(" ").trim();

      if (!targetCode || !replyMessage) {
        await sendTelegramAdminConfirmation(
          chatId,
          "⚠️ <b>Usage:</b> <code>/reply [ticket_code] [your message]</code>\n<i>Example: /reply 4E86EA2B We are checking your transaction now.</i>",
          messageId
        );
        return NextResponse.json({ ok: true });
      }

      const { data: matched } = await supabase
        .from("support_threads")
        .select("id, visitor_name, unread_user_count")
        .eq("ticket_code", targetCode)
        .maybeSingle();

      if (!matched) {
        await sendTelegramAdminConfirmation(
          chatId,
          `⚠️ <i>No chat thread found matching ticket code <code>#FD-${targetCode}</code></i>`,
          messageId
        );
        return NextResponse.json({ ok: true });
      }

      await supabase.from("support_messages").insert({
        thread_id: matched.id,
        sender_type: "support",
        sender_name: "Funda Support",
        message: replyMessage,
        telegram_message_id: messageId,
        is_read: false,
      });

      await supabase
        .from("support_threads")
        .update({
          last_message: replyMessage,
          last_message_at: new Date().toISOString(),
          unread_user_count: (matched.unread_user_count || 0) + 1,
          status: "open",
          updated_at: new Date().toISOString(),
        })
        .eq("id", matched.id);

      await sendTelegramAdminConfirmation(
        chatId,
        `✅ <b>Delivered to ${matched.visitor_name || "Customer"} on web!</b>`,
        messageId
      );

      return NextResponse.json({ ok: true, action: "delivered_command_reply" });
    }

    if (text.startsWith("/close ") || text.startsWith("/resolve ")) {
      const targetCode = text.split(" ")[1]?.trim().replace(/^#(?:FD-|T-)?/i, "").toUpperCase();
      if (targetCode) {
        const { data: matched } = await supabase
          .from("support_threads")
          .select("id, visitor_name")
          .eq("ticket_code", targetCode)
          .maybeSingle();

        if (matched) {
          await supabase
            .from("support_threads")
            .update({ status: "resolved", updated_at: new Date().toISOString() })
            .eq("id", matched.id);

          await supabase.from("support_messages").insert({
            thread_id: matched.id,
            sender_type: "system",
            sender_name: "System",
            message: "This conversation has been marked as resolved by support.",
          });

          await sendTelegramAdminConfirmation(
            chatId,
            `🏁 <b>Ticket [#FD-${targetCode}] marked as resolved.</b>`,
            messageId
          );
          return NextResponse.json({ ok: true });
        }
      }
    }

    if (text === "/status" || text === "/start" || text === "/help") {
      const { count: openCount } = await supabase
        .from("support_threads")
        .select("*", { count: "exact", head: true })
        .eq("status", "open");

      const helpMessage = [
        `<b>🤖 Funda Live Chat Telegram Relay</b>`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `📊 <b>Open Chats:</b> ${openCount ?? 0}`,
        ``,
        `💡 <b>How to Reply:</b>`,
        `1. Whenever a customer sends a message on the web, you will receive an alert here.`,
        `2. Simply <b>swipe / click "Reply"</b> to that specific alert and type your response.`,
        `3. Your reply is delivered to the user's web chat immediately!`,
        ``,
        `⚙️ <b>Commands:</b>`,
        `• <code>/reply [ticket_code] [message]</code> — manual reply`,
        `• <code>/close [ticket_code]</code> — mark chat resolved`,
        `• <code>/status</code> — show open chats count`,
      ].join("\n");

      await sendTelegramAdminConfirmation(chatId, helpMessage, messageId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true, note: "Message received" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Webhook handler error";
    console.error("[Telegram Webhook] Error:", errorMsg);
    return NextResponse.json({ ok: false, error: errorMsg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    service: "Funda Live Chat Telegram Webhook",
    timestamp: new Date().toISOString(),
  });
}
