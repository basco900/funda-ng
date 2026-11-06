import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const guestId = searchParams.get("guestId");

  if (!guestId) {
    return NextResponse.json({ error: "Missing guestId" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Try to find open thread for guestId
  const { data: thread } = await supabase
    .from("support_threads")
    .select("id, status, visitor_name, visitor_email, visitor_phone, last_message, last_message_at, unread_user_count")
    .eq("guest_id", guestId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ thread: thread || null });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { guestId, visitorName, visitorEmail, visitorPhone, currentPage } = body;

    if (!guestId) {
      return NextResponse.json({ error: "Missing guestId" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Check if user is authenticated
    let authUserId: string | null = null;
    try {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      if (user) authUserId = user.id;
    } catch {
      // Unauthenticated visitor is fine
    }

    // Check if thread already exists
    const { data: existing } = await supabase
      .from("support_threads")
      .select("id, status, visitor_name, visitor_email, visitor_phone")
      .eq("guest_id", guestId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Update details if provided
      const updates: Record<string, unknown> = {
        current_page: currentPage || null,
        updated_at: new Date().toISOString(),
      };
      if (visitorName) updates.visitor_name = visitorName;
      if (visitorEmail) updates.visitor_email = visitorEmail;
      if (visitorPhone) updates.visitor_phone = visitorPhone;
      if (authUserId) updates.user_id = authUserId;

      const { data: updated } = await supabase
        .from("support_threads")
        .update(updates)
        .eq("id", existing.id)
        .select()
        .single();

      return NextResponse.json({ thread: updated });
    }

    // Create new thread
    const { data: newThread, error } = await supabase
      .from("support_threads")
      .insert({
        guest_id: guestId,
        user_id: authUserId,
        visitor_name: visitorName?.trim() || "Visitor",
        visitor_email: visitorEmail?.trim() || null,
        visitor_phone: visitorPhone?.trim() || null,
        current_page: currentPage || null,
        status: "open",
        last_message: "Chat initialized",
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Post an automated initial welcome message if it's a new conversation
    await supabase.from("support_messages").insert({
      thread_id: newThread.id,
      sender_type: "system",
      sender_name: "Funda Support",
      message: "👋 Welcome to Funda Support! Send us a message and our team will assist you shortly.",
    });

    return NextResponse.json({ thread: newThread });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to initialize thread";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
