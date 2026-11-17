import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { sendTelegramNotification } from "@/lib/telegram/bot";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("threadId");
  const since = searchParams.get("since");

  if (!threadId) {
    return NextResponse.json({ error: "Missing threadId" }, { status: 400 });
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ messages: [] });
  }

  const supabase = createAdminClient();

  let query = supabase
    .from("support_messages")
    .select("id, thread_id, sender_type, sender_name, message, attachments, created_at, is_read")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (since) {
    query = query.gt("created_at", since);
  }

  const { data: messages, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Clear unread count for user when they fetch messages
  if (!since && messages && messages.length > 0) {
    await supabase
      .from("support_threads")
      .update({ unread_user_count: 0 })
      .eq("id", threadId);
  }

  return NextResponse.json({ messages: messages || [] });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { threadId, message, senderName, currentPage } = body;

    if (!threadId || !message?.trim()) {
      return NextResponse.json({ error: "Missing threadId or message content" }, { status: 400 });
    }

    const trimmedText = message.trim();
    if (trimmedText.length > 2500) {
      return NextResponse.json({ error: "Message is too long (max 2500 characters)." }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Fetch thread details to verify and grab user context
    const { data: thread } = await supabase
      .from("support_threads")
      .select("id, visitor_name, visitor_email, visitor_phone, unread_support_count")
      .eq("id", threadId)
      .maybeSingle();

    if (!thread) {
      return NextResponse.json({ error: "Chat thread not found" }, { status: 404 });
    }

    const resolvedSenderName = senderName?.trim() || thread.visitor_name || "Customer";

    // 2. Insert message into support_messages
    const { data: insertedMsg, error: insertError } = await supabase
      .from("support_messages")
      .insert({
        thread_id: threadId,
        sender_type: "user",
        sender_name: resolvedSenderName,
        message: trimmedText,
        is_read: false,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // 3. Update thread state
    await supabase
      .from("support_threads")
      .update({
        last_message: trimmedText,
        last_message_at: new Date().toISOString(),
        unread_support_count: (thread.unread_support_count || 0) + 1,
        status: "open",
        current_page: currentPage || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", threadId);

    // 4. Send Instant Telegram Alert to Admin
    // We execute this asynchronously so we do not block user's response
    sendTelegramNotification({
      threadId,
      senderName: resolvedSenderName,
      senderEmail: thread.visitor_email,
      senderPhone: thread.visitor_phone,
      messageText: trimmedText,
      currentPage: currentPage || null,
      userMessageId: insertedMsg.id,
    }).catch((err) => {
      console.error("[Chat API] Telegram notification failed in background:", err);
    });

    return NextResponse.json({ message: insertedMsg }, { status: 201 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to send message";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
