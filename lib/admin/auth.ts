import "server-only";

import type { User } from "@supabase/supabase-js";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createAdminClient } from "../supabase/admin";
import { createClient } from "../supabase/server";

export type AdminSession = {
  id: string;
  authUserId: string;
  email: string;
  fullName: string;
  initials: string;
  role: string;
  roleSlug: string;
  permissions: string[];
  bootstrap: boolean;
};

export class AdminPermissionError extends Error {
  constructor(permission: string) {
    super(`Administrative permission required: ${permission}`);
    this.name = "AdminPermissionError";
  }
}

function normalizedEmail(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function bootstrapEmails() {
  return (process.env.FUNDA_SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map(normalizedEmail)
    .filter(Boolean);
}

function displayNameFor(user: User) {
  const metadataName = typeof user.user_metadata?.full_name === "string"
    ? user.user_metadata.full_name.trim()
    : "";
  return metadataName || normalizedEmail(user.email).split("@")[0] || "Funda Admin";
}

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export async function resolveAdminAccess(user: User): Promise<AdminSession | null> {
  const email = normalizedEmail(user.email);
  const fullName = displayNameFor(user);

  if (email && bootstrapEmails().includes(email)) {
    // A bootstrap identity is convenient during first deployment, but it is
    // never exempt from a deliberate session invalidation once materialised.
    try {
      const admin = createAdminClient();
      const { data } = await admin.from("admin_users").select("session_invalid_before").eq("auth_user_id", user.id).maybeSingle();
      if (data?.session_invalid_before && new Date(user.last_sign_in_at ?? 0).valueOf() <= new Date(data.session_invalid_before).valueOf()) return null;
    } catch {
      // The control-plane migration may not have been applied yet.
    }
    return {
      id: `bootstrap:${user.id}`,
      authUserId: user.id,
      email,
      fullName,
      initials: initialsFor(fullName),
      role: "Super Admin",
      roleSlug: "super_admin",
      permissions: ["*"],
      bootstrap: true,
    };
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("admin_users")
      .select("id, role_id, full_name, email, status, session_invalid_before, role:admin_roles(name, slug)")
      .eq("auth_user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (error || !data) return null;
    if (data.session_invalid_before) {
      const invalidBefore = new Date(data.session_invalid_before).valueOf();
      const lastSignIn = new Date(user.last_sign_in_at ?? 0).valueOf();
      if (!Number.isFinite(lastSignIn) || lastSignIn <= invalidBefore) return null;
    }

    const roleValue = Array.isArray(data.role) ? data.role[0] : data.role;
    const role = roleValue as { name?: string; slug?: string } | null;
    const storedName = typeof data.full_name === "string" ? data.full_name.trim() : "";
    const name = storedName || fullName;
    const { data: permissionRows } = await admin
      .from("admin_role_permissions")
      .select("permission:admin_permissions(permission)")
      .eq("role_id", data.role_id);
    const permissions = (permissionRows ?? []).flatMap((row) => {
      const value = Array.isArray(row.permission) ? row.permission[0] : row.permission;
      const permission = value as { permission?: string } | null;
      return permission?.permission ? [permission.permission] : [];
    });

    return {
      id: String(data.id),
      authUserId: user.id,
      email: normalizedEmail(data.email) || email,
      fullName: name,
      initials: initialsFor(name),
      role: role?.name || "Admin",
      roleSlug: role?.slug || "admin",
      permissions: role?.slug === "super_admin" ? ["*"] : permissions,
      bootstrap: false,
    };
  } catch {
    return null;
  }
}

export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    return resolveAdminAccess(user);
  } catch {
    return null;
  }
});

export async function requireAdmin() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  return admin;
}

export function hasAdminPermission(admin: AdminSession, permission: string) {
  return admin.permissions.includes("*") || admin.permissions.includes(permission);
}

export async function requireAdminPermission(permission: string) {
  const admin = await requireAdmin();
  if (!hasAdminPermission(admin, permission)) throw new AdminPermissionError(permission);
  return admin;
}

/**
 * Bootstrap allow-list access deliberately works before the admin migration is
 * applied. Once the control plane exists, materialise that identity so every
 * approval and audit foreign key points at a real admin_users row.
 */
export async function materializeAdminSession(adminSession: AdminSession) {
  if (!adminSession.bootstrap) return adminSession.id;

  const client = createAdminClient();
  const { data: role, error: roleError } = await client
    .from("admin_roles")
    .select("id")
    .eq("slug", "super_admin")
    .single();
  if (roleError || !role) throw new Error("The Super Admin role is not configured.");

  const { data, error } = await client
    .from("admin_users")
    .upsert({
      auth_user_id: adminSession.authUserId,
      role_id: role.id,
      email: adminSession.email,
      full_name: adminSession.fullName,
      status: "active",
      two_factor_required: true,
    }, { onConflict: "auth_user_id" })
    .select("id")
    .single();
  if (error || !data) throw new Error("The bootstrap administrator could not be registered.");
  return String(data.id);
}
