"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  BackIcon,
  CloseIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  SpinnerIcon,
} from "../../onboarding/icons";
import { validFullName, validPassword } from "../../../lib/auth/identifiers";
import {
  completedOnboardingData,
  incompleteOnboardingData,
  profileNameFor,
} from "../../../lib/auth/onboarding";
import { createClient } from "../../../lib/supabase/client";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import styles from "./reset-password.module.css";

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
  autoComplete = "new-password",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={styles.iconField}>
      <span className={styles.iconFieldIcon} aria-hidden="true">
        <LockIcon size={18} />
      </span>
      <input
        id={id}
        type={visible ? "text" : "password"}
        minLength={6}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        className={styles.eyeButton}
        onClick={() => setVisible((prev) => !prev)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
      >
        {visible ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
      </button>
    </div>
  );
}

export default function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validPassword(password)) return setError("Password must be at least 6 characters.");
    if (password !== confirmPassword) return setError("Passwords do not match.");
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
      <section className={styles.card} aria-labelledby="reset-password-title">
        <div className={styles.topbar}>
          <Link href="/login" className={styles.backBtn} aria-label="Back to login">
            <BackIcon size={18} />
          </Link>
          <h1 id="reset-password-title" className={styles.title}>New password.</h1>
          <span className={styles.brandMark}>
            funda<span>.</span>
          </span>
        </div>

        <form className={styles.form} onSubmit={submit} noValidate>
          <div className={styles.fieldStack}>
            <PasswordInput
              id="new-password"
              value={password}
              onChange={(val) => { setPassword(val); setError(""); }}
              placeholder="New password (6+ characters)"
              ariaLabel="New password"
            />
            <PasswordInput
              id="confirm-password"
              value={confirmPassword}
              onChange={(val) => { setConfirmPassword(val); setError(""); }}
              placeholder="Confirm password"
              ariaLabel="Confirm password"
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

          <button className={styles.submitBtn} disabled={busy} type="submit">
            {busy ? (
              <>
                <SpinnerIcon size={18} />
                <span>Saving…</span>
              </>
            ) : (
              <>
                <span>Save password</span>
                <ArrowRightIcon size={18} />
              </>
            )}
          </button>
        </form>
      </section>
    </main>
  );
}
