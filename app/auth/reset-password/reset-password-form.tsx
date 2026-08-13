"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { validPassword } from "../../../lib/auth/identifiers";
import { createClient } from "../../../lib/supabase/client";
import styles from "./reset-password.module.css";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validPassword(password)) return setError("Use 12+ characters with uppercase, lowercase, a number and a symbol.");
    setBusy(true);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError("That link may have expired. Ask for a fresh one and we’ll try again.");
    router.replace("/dashboard");
  };

  return <main className={styles.page}><section className={styles.card}>
    <span className={styles.brand}>funda.</span><span className={styles.eyebrow}>Fresh start</span><h1>New password. Same you.</h1>
    <p>Make it strong. If it wanders off again, recovery is still easy.</p>
    <form onSubmit={submit}><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="12+ strong characters" />
    {error && <small role="alert">{error}</small>}<button disabled={busy}>{busy ? "Saving…" : "Save and continue"}</button></form>
  </section></main>;
}

