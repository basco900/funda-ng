"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { resolveAdminAccess } from "../../../lib/admin/auth";
import {
  adminLoginRateLimited,
  getAdminRequestMetadata,
  recordAdminAudit,
  recordAdminLoginEvent,
} from "../../../lib/admin/security";
import { createAdminClient } from "../../../lib/supabase/admin";
import { createClient } from "../../../lib/supabase/server";

export type AdminLoginState = {
  error?: string;
};

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6).max(128),
});

export async function loginAdmin(
  _previousState: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Enter a valid admin email and password." };
  }

  const metadata = await getAdminRequestMetadata();
  if (await adminLoginRateLimited(parsed.data.email, metadata)) {
    await recordAdminLoginEvent(parsed.data.email, "rate_limited", metadata);
    return { error: "Too many attempts. Give it 15 minutes, then try again." };
  }

  let supabase: Awaited<ReturnType<typeof createClient>> | null = null;
  try {
    supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error || !data.user) {
      await recordAdminLoginEvent(parsed.data.email, "invalid_credentials", metadata);
      return { error: "Those admin details do not match." };
    }

    const access = await resolveAdminAccess(data.user);
    if (!access) {
      await recordAdminLoginEvent(parsed.data.email, "access_denied", metadata);
      await supabase.auth.signOut();
      return { error: "This account does not have access to Funda Admin." };
    }

    await recordAdminLoginEvent(parsed.data.email, "succeeded", metadata);
    if (!access.bootstrap) {
      const adminClient = createAdminClient();
      await adminClient.from("admin_users").update({ last_login_at: new Date().toISOString() }).eq("id", access.id);
    }
    await recordAdminAudit(access, {
      action: "admin.login",
      entityType: "admin_session",
      entityId: access.authUserId,
      newValue: { role: access.roleSlug },
    }, metadata);
  } catch {
    await supabase?.auth.signOut().catch(() => undefined);
    return { error: "Admin sign-in is unavailable right now. Try again shortly." };
  }

  redirect("/admin/dashboard");
}
