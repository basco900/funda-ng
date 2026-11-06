import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import SupportWorkspace, { type AdminSupportThread } from "./support-workspace";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Live Chat & Support Desk · Funda Admin",
};

export default async function AdminSupportPage() {
  await requireAdmin();
  const client = createAdminClient();

  const { data: threads } = await client
    .from("support_threads")
    .select("id, ticket_code, visitor_name, visitor_email, visitor_phone, current_page, status, last_message, last_message_at, unread_support_count, created_at")
    .order("updated_at", { ascending: false });

  const hasTelegramConfig = Boolean(
    process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ADMIN_CHAT_ID
  );

  return (
    <SupportWorkspace
      initialThreads={(threads ?? []) as AdminSupportThread[]}
      hasTelegramConfig={hasTelegramConfig}
    />
  );
}
