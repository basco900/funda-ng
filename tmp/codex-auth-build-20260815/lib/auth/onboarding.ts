import type { User } from "@supabase/supabase-js";
import { validFullName } from "./identifiers";

export const ONBOARDING_VERSION = 2;

export type OnboardingStep = "profile" | "password-choice" | "complete";
export type LoginPreference = "password" | "code";

function metadataString(user: User, key: string) {
  const value = user.user_metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function profileNameFor(user: User, databaseName?: string | null) {
  const storedName = databaseName?.trim() ?? "";
  return validFullName(storedName) ? storedName : metadataString(user, "full_name");
}

export function passwordIsEnabled(user: User) {
  return user.user_metadata?.password_enabled === true;
}

export function onboardingStepFor(user: User, databaseName?: string | null): OnboardingStep {
  if (!validFullName(profileNameFor(user, databaseName))) return "profile";

  const metadata = user.user_metadata ?? {};
  if (metadata.onboarding_version !== ONBOARDING_VERSION || metadata.onboarding_complete !== true) {
    return "password-choice";
  }

  return "complete";
}

export function postAuthPathFor(user: User, databaseName?: string | null) {
  return onboardingStepFor(user, databaseName) === "complete" ? "/dashboard" : "/register?resume=1";
}

export function completedOnboardingData(
  user: User,
  fullName: string,
  preference: LoginPreference,
) {
  return {
    ...user.user_metadata,
    full_name: fullName.trim(),
    onboarding_version: ONBOARDING_VERSION,
    onboarding_complete: true,
    password_enabled: preference === "password",
    login_preference: preference,
  };
}

export function incompleteOnboardingData(user: User, fullName?: string) {
  return {
    ...user.user_metadata,
    ...(fullName ? { full_name: fullName.trim() } : {}),
    onboarding_version: ONBOARDING_VERSION,
    onboarding_complete: false,
  };
}
