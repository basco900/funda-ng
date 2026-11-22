"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircleIcon, CloseIcon, LockIcon, SpinnerIcon } from "../../onboarding/icons";
import { validFullName, validPassword } from "../../../lib/auth/identifiers";
import {
  completedOnboardingData,
  incompleteOnboardingData,
  profileNameFor,
} from "../../../lib/auth/onboarding";
import { createClient } from "../../../lib/supabase/client";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import styles from "./reset-password.module.css";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validPassword(password)) return setError("Password must be at least 6 characters.");
    if (!isSupabaseConfigured()) return setError("Authentication is temporarily unavailable. Please try again shortly.");

    setBusy(true);
    setError("");
    const client = createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      setBusy(false);
      return setError("Session expired or invalid link. Please request a new one.");
    }

    const { data: profile } = await client.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const fullName = profileNameFor(user, profile?.full_name);
    const onboardingData = validFullName(fullName)
      ? completedOnboardingData(user, fullName, "password")
      : {
          ...incompleteOnboardingData(user),
          password_enabled: true,
          login_preference: "password",
        };
    const { error: updateError } = await client.auth.updateUser({ password, data: onboardingData });

    setBusy(false);
    if (updateError) return setError("Unable to update password. Please try again.");
    router.replace("/dashboard");
  };

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <span className={styles.brand}>funda.</span>
        <h1>Create new password</h1>
        <form onSubmit={submit} noValidate>
          <div className={styles.iconField}>
            <span className={styles.iconFieldIcon} aria-hidden="true">
              <LockIcon size={18} />
            </span>
            <input
              id="new-password"
              type="password"
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(event) => { setPassword(event.target.value); setError(""); }}
              placeholder="New password (6+ characters)"
              aria-label="New password"
            />
          </div>
          {error && (
            <div className={styles.errorBanner} role="alert" aria-live="polite">
              <span className={styles.errorBannerIcon} aria-hidden="true">
                <AlertCircleIcon size={15} />
              </span>
              <span className={styles.errorBannerText}>{error}</span>
              <button
                type="button"
                className={styles.errorBannerDismiss}
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <CloseIcon size={12} />
              </button>
            </div>
          )}
          <button disabled={busy} type="submit" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            {busy ? (
              <>
                <SpinnerIcon size={18} />
                <span>Saving…</span>
              </>
            ) : (
              "Save password"
            )}
          </button>
        </form>
      </section>
    </main>
  );
}
