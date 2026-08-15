"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { validFullName, validPassword } from "../../../lib/auth/identifiers";
import {
  completedOnboardingData,
  incompleteOnboardingData,
  profileNameFor,
} from "../../../lib/auth/onboarding";
import { createClient } from "../../../lib/supabase/client";
import styles from "./reset-password.module.css";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validPassword(password)) return setError("Six characters or more. That’s the whole rule.");

    setBusy(true);
    setError("");
    const client = createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      setBusy(false);
      return setError("That link has had its moment. Ask for a fresh one and we’ll try again.");
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
    if (updateError) return setError("That password didn’t stick. Try six or more characters.");
    router.replace(validFullName(fullName) ? "/dashboard" : "/register?resume=1");
  };

  return <main className={styles.page}><section className={styles.card}>
    <span className={styles.brand}>funda.</span><span className={styles.eyebrow}>Fresh start</span><h1>New password. Same you.</h1>
    <p>Six characters minimum. If it wanders off again, recovery is still easy.</p>
    <form onSubmit={submit}><label htmlFor="new-password">New password</label><input id="new-password" type="password" minLength={6} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="6+ characters" />
    {error && <small role="alert">{error}</small>}<button disabled={busy}>{busy ? "Saving…" : "Save and continue"}</button></form>
  </section></main>;
}
