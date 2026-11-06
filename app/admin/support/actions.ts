"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function adminReplyToThread(threadId: string, replyText: string) {
  const admin = await requireAdmin();
  const trimmed = replyText.trim();
  if (!trimmed) return { error: "Reply cannot be empty" };

  const client = createAdminClient();

  const { data: thread } = await client
    .from("support_threads")
    .select("id, visitor_name, unread_user_count")
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) return { error: "Thread not found" };

  const senderName = admin.fullName || "Funda Support";

  const { data: newMsg, error } = await client
    .from("support_messages")
    .insert({
      thread_id: threadId,
      sender_type: "support",
      sender_name: senderName,
      message: trimmed,
      is_read: false,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  await client
    .from("support_threads")
    .update({
      last_message: trimmed,
      last_message_at: new Date().toISOString(),
      unread_user_count: (thread.unread_user_count || 0) + 1,
      status: "open",
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId);

  revalidatePath("/admin/support");
  return { success: true, message: newMsg };
}

export async function adminToggleThreadStatus(threadId: string, newStatus: "open" | "resolved" | "archived") {
  await requireAdmin();
  const client = createAdminClient();

  const { error } = await client
    .from("support_threads")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", threadId);

  if (error) return { error: error.message };

  if (newStatus === "resolved") {
    await client.from("support_messages").insert({
      thread_id: threadId,
      sender_type: "system",
      sender_name: "System",
      message: "This conversation was marked as resolved by support.",
    });
  }

  revalidatePath("/admin/support");
  return { success: true };
}

export async function adminDeleteThread(threadId: string) {
  await requireAdmin();
  const client = createAdminClient();

  const { error } = await client.from("support_threads").delete().eq("id", threadId);
  if (error) return { error: error.message };

  revalidatePath("/admin/support");
  return { success: true };
}
