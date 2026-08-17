"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "../../lib/supabase/server";

export type AccountActionResult = { ok: true; message: string } | { ok: false; message: string };

const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || null);

const profileSchema = z.object({
  fullName: z.string().trim().min(4, "Enter your first and last name.").max(100),
  displayName: optionalText(50),
  dateOfBirth: z.string().trim().refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), "Use a valid date."),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use a two-letter country code."),
  state: optionalText(80),
  city: optionalText(80),
});

const settingsSchema = z.object({
  emailNotifications: z.boolean(),
  smsNotifications: z.boolean(),
  pushNotifications: z.boolean(),
  marketingNotifications: z.boolean(),
  transactionAlerts: z.boolean(),
  securityAlerts: z.boolean(),
  preferredLanguage: z.literal("en"),
  timezone: z.string().trim().min(1).max(64),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  password: z.string()
    .min(8, "Use at least 8 characters.")
    .regex(/[a-z]/, "Add a lowercase letter.")
    .regex(/[A-Z]/, "Add an uppercase letter.")
    .regex(/\d/, "Add a number."),
  confirmPassword: z.string(),
}).refine((input) => input.password === input.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function updateAccountProfile(input: unknown): Promise<AccountActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check your profile details." };

  const { supabase, user } = await authenticatedClient();
  if (!user) return { ok: false, message: "Your session expired. Please log in again." };

  const value = parsed.data;
  const dateOfBirth = value.dateOfBirth || null;
  if (dateOfBirth && new Date(`${dateOfBirth}T00:00:00Z`) > new Date()) {
    return { ok: false, message: "Date of birth cannot be in the future." };
  }

  const { error } = await supabase.from("profiles").update({
    full_name: value.fullName,
    display_name: value.displayName,
    date_of_birth: dateOfBirth,
    country_code: value.countryCode,
    state: value.state,
    city: value.city,
  }).eq("id", user.id);

  if (error) return { ok: false, message: "We could not save your profile. Apply the account-center migration, then try again." };

  await supabase.auth.updateUser({ data: { ...user.user_metadata, full_name: value.fullName, display_name: value.displayName } });
  revalidatePath("/dashboard");
  return { ok: true, message: "Profile updated." };
}

export async function updateAccountSettings(input: unknown): Promise<AccountActionResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check your settings." };

  const { supabase, user } = await authenticatedClient();
  if (!user) return { ok: false, message: "Your session expired. Please log in again." };
  const value = parsed.data;
  const { error } = await supabase.from("user_settings").upsert({
    user_id: user.id,
    email_notifications: value.emailNotifications,
    sms_notifications: value.smsNotifications,
    push_notifications: value.pushNotifications,
    marketing_notifications: value.marketingNotifications,
    transaction_alerts: value.transactionAlerts,
    security_alerts: true,
    preferred_language: value.preferredLanguage,
    timezone: value.timezone,
  }, { onConflict: "user_id" });

  if (error) return { ok: false, message: "We could not save your settings. Apply the account-center migration, then try again." };
  revalidatePath("/dashboard");
  return { ok: true, message: "Settings saved." };
}

export async function changeAccountPassword(input: unknown): Promise<AccountActionResult> {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check your password." };

  const { supabase, user } = await authenticatedClient();
  if (!user) return { ok: false, message: "Your session expired. Please log in again." };
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
    current_password: parsed.data.currentPassword,
  });
  if (error) {
    const needsReauthentication = error.message.toLowerCase().includes("reauth");
    return {
      ok: false,
      message: needsReauthentication
        ? "For security, log out and sign in again before changing your password."
        : "We could not change your password. Check your current password and try again.",
    };
  }
  return { ok: true, message: "Password changed successfully." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
