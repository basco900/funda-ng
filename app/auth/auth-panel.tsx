"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, BackIcon, CheckIcon, CloseIcon, ShieldIcon } from "../onboarding/icons";
import { parseIdentifier, validFullName, validPassword, type IdentifierType } from "../../lib/auth/identifiers";
import { createClient } from "../../lib/supabase/client";
import { isSupabaseConfigured } from "../../lib/supabase/config";
import styles from "../onboarding/funda-experience.module.css";

type Mode = "login" | "register";
type Step = "identifier" | "method" | "password" | "code" | "profile" | "password-choice" | "recovery-sent" | "complete";

export default function AuthPanel({ mode, onClose, instance }: { mode: Mode; onClose: () => void; instance: "desktop" | "mobile" }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [identifierType, setIdentifierType] = useState<IdentifierType | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (instance !== "mobile" || !window.matchMedia("(max-width: 959px)").matches) return;
    const frame = requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [instance, mode]);

  const fail = (message: string) => { setError(message); setBusy(false); };
  const auth = () => {
    if (!isSupabaseConfigured()) throw new Error("Authentication is being connected. Add the Supabase keys to switch it on.");
    return createClient().auth;
  };
  const parsed = parseIdentifier(identifier);

  const begin = (event: FormEvent) => {
    event.preventDefault();
    const result = parseIdentifier(identifier);
    if (!result) return fail("Try a proper email or Nigerian phone number.");
    setIdentifier(result.value);
    setIdentifierType(result.type);
    setError("");
    if (recovery) {
      setBusy(true);
      if (result.type === "email") {
        void auth().resetPasswordForEmail(result.value, { redirectTo: `${location.origin}/auth/callback?next=/auth/reset-password` })
          .then(() => setStep("recovery-sent"))
          .catch(() => setStep("recovery-sent"))
          .finally(() => setBusy(false));
      } else {
        void sendCode(result.type, result.value, false);
      }
      return;
    }
    setStep(mode === "register" ? "code" : "method");
    if (mode === "register") void sendCode(result.type, result.value, true);
  };

  const sendCode = async (type = identifierType, value = identifier, createUser = mode === "register") => {
    if (!type) return;
    setBusy(true); setError("");
    try {
      const options = { shouldCreateUser: createUser, data: { onboarding_complete: false } };
      const result = type === "email"
        ? await auth().signInWithOtp({ email: value, options: { ...options, emailRedirectTo: `${location.origin}/auth/callback?next=/dashboard` } })
        : await auth().signInWithOtp({ phone: value, options });
      if (result.error) return fail(createUser ? "Couldn’t send that code. It may already be registered—try logging in." : "Couldn’t send a code. Check the details or try your password.");
      setStep("code");
    } catch (cause) { fail(cause instanceof Error ? cause.message : "Something got in the way. Try again."); }
    finally { setBusy(false); }
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!identifierType || code.length !== 6) return fail("Pop in the six-digit code.");
    setBusy(true); setError("");
    try {
      const result = identifierType === "email"
        ? await auth().verifyOtp({ email: identifier, token: code, type: "email" })
        : await auth().verifyOtp({ phone: identifier, token: code, type: "sms" });
      if (result.error) return fail("That code didn’t land. Check it, or ask for a fresh one.");
      if (recovery) setStep("password");
      else if (mode === "register") setStep("profile");
      else finish();
    } catch (cause) { fail(cause instanceof Error ? cause.message : "Couldn’t verify that code."); }
    finally { setBusy(false); }
  };

  const signInWithPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!parsed || !password) return fail("Add your password and we’ll take it from there.");
    setBusy(true); setError("");
    try {
      const credentials = parsed.type === "email" ? { email: parsed.value, password } : { phone: parsed.value, password };
      const { error: signInError } = await auth().signInWithPassword(credentials);
      if (signInError) return fail("Those details don’t match. Try again or reset the password—easy fix.");
      finish();
    } catch (cause) { fail(cause instanceof Error ? cause.message : "Couldn’t log you in."); }
    finally { setBusy(false); }
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!validFullName(fullName)) return fail("First and last name, please—your full government-ish name.");
    setBusy(true);
    const client = createClient();
    const { error: updateError } = await client.auth.updateUser({ data: { full_name: fullName.trim(), onboarding_complete: true } });
    if (!updateError) {
      const { data: { user } } = await client.auth.getUser();
      if (user) await client.from("profiles").update({ full_name: fullName.trim() }).eq("id", user.id);
    }
    setBusy(false);
    if (updateError) return fail("Couldn’t save your name just yet. Give it another go.");
    setStep("password-choice");
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!validPassword(password)) return fail("Use 12+ characters with uppercase, lowercase, a number and a symbol.");
    setBusy(true);
    const { error: updateError } = await auth().updateUser({ password });
    setBusy(false);
    if (updateError) return fail("That password didn’t stick. Try a different strong one.");
    finish();
  };

  const finish = () => { setStep("complete"); setTimeout(() => router.replace("/dashboard"), 550); };
  const back = () => {
    setError("");
    if (["method", "code", "password", "recovery-sent"].includes(step)) setStep("identifier");
    else if (["profile", "password-choice"].includes(step)) setStep("code");
    else onClose();
  };

  return (
    <div ref={dialogRef} className={styles.authWrap} role="dialog" aria-modal="true" aria-labelledby={`${instance}-auth-title`} tabIndex={-1}>
      <div className={styles.mobileHandle} aria-hidden="true" />
      <div className={styles.authTopbar}>
        <button type="button" onClick={back} className={styles.iconButton} aria-label="Go back"><BackIcon size={19} /></button>
        <span className={styles.authWordmark}>funda.</span>
        <button type="button" onClick={onClose} className={styles.iconButton} aria-label="Close"><CloseIcon size={19} /></button>
      </div>
      <div className={styles.previewNotice}><ShieldIcon size={15} /><span>Your details stay private and protected.</span></div>

      <div className={styles.authBody}>
        {step === "identifier" && <form onSubmit={begin} noValidate>
          <span className={styles.authEyebrow}>{mode === "register" ? "Join Funda" : recovery ? "Password rescue" : "Welcome back"}</span>
          <h2 id={`${instance}-auth-title`}>{mode === "register" ? "Let’s get you in." : recovery ? "We’ve got you." : "Good to see you again."}</h2>
          <p>{recovery ? "Drop your email or phone. Getting back in is pleasantly easy." : "Email or phone—whichever you actually remember."}</p>
          <label className={styles.fieldLabel} htmlFor={`${instance}-${mode}-identifier`}>Email or phone number</label>
          <input id={`${instance}-${mode}-identifier`} className={styles.textField} value={identifier} onChange={(e) => { setIdentifier(e.target.value); setError(""); }} autoComplete="username" inputMode="text" placeholder="you@email.com or 0801 234 5678" />
          {error && <p className={styles.fieldError} role="alert">{error}</p>}
          <button className={styles.authPrimary} disabled={busy} type="submit">{busy ? "One sec…" : recovery ? "Help me back in" : "Continue"} <ArrowRightIcon size={18} /></button>
        </form>}

        {step === "method" && <div>
          <span className={styles.authEyebrow}>Your call</span><h2 id={`${instance}-auth-title`}>How are we doing this?</h2><p>Use your password, or get a fresh code. Both are secure.</p>
          <button className={styles.authPrimary} type="button" onClick={() => setStep("password")}>Use my password <ArrowRightIcon size={18} /></button>
          <button className={styles.authQuiet} disabled={busy} type="button" onClick={() => void sendCode(identifierType, identifier, false)}>Send me a code</button>
          <button className={styles.authQuiet} type="button" onClick={() => { setRecovery(true); setStep("identifier"); }}>Forgot password? Easy fix.</button>
          {error && <p className={styles.fieldError} role="alert">{error}</p>}
        </div>}

        {step === "password" && <form onSubmit={recovery || mode === "register" ? savePassword : signInWithPassword} noValidate>
          <span className={styles.authEyebrow}>{recovery || mode === "register" ? "Fresh start" : "Password time"}</span><h2 id={`${instance}-auth-title`}>{recovery || mode === "register" ? "Pick a strong one." : "You know the drill."}</h2>
          <p>{recovery || mode === "register" ? "Make it strong. If it ever slips your mind, getting it back is easy." : "No peeking—we only ever send this securely to Supabase Auth."}</p>
          <label className={styles.fieldLabel} htmlFor={`${instance}-password`}>Password</label>
          <input id={`${instance}-password`} className={styles.textField} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={recovery || mode === "register" ? "new-password" : "current-password"} placeholder={recovery || mode === "register" ? "12+ strong characters" : "Your password"} />
          {error && <p className={styles.fieldError} role="alert">{error}</p>}
          <button className={styles.authPrimary} disabled={busy} type="submit">{busy ? "Checking…" : recovery || mode === "register" ? "Save password" : "Log me in"} <ArrowRightIcon size={18} /></button>
          {!recovery && <button className={styles.authQuiet} type="button" onClick={() => { setRecovery(true); setStep("identifier"); }}>Forgot it? We’ll sort it.</button>}
        </form>}

        {step === "code" && <form onSubmit={verifyCode} noValidate>
          <span className={styles.authEyebrow}>One quick check</span><h2 id={`${instance}-auth-title`}>Code, please.</h2><p>We sent six digits to your {identifierType}. Tiny code, big security energy.</p>
          <label className={styles.fieldLabel} htmlFor={`${instance}-code`}>Six-digit code</label>
          <input id={`${instance}-code`} className={styles.otpField} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" />
          {error && <p className={styles.fieldError} role="alert">{error}</p>}
          <button className={styles.authPrimary} disabled={busy} type="submit">{busy ? "Checking…" : "Verify code"} <ArrowRightIcon size={18} /></button>
          <button className={styles.authQuiet} disabled={busy} type="button" onClick={() => void sendCode()}>Send a fresh code</button>
        </form>}

        {step === "profile" && <form onSubmit={saveProfile} noValidate>
          <span className={styles.authEyebrow}>Nice to meet you</span><h2 id={`${instance}-auth-title`}>What’s your full name?</h2><p>The proper version—first and last. We’ll keep it friendly everywhere else.</p>
          <label className={styles.fieldLabel} htmlFor={`${instance}-full-name`}>Full name</label>
          <input id={`${instance}-full-name`} className={styles.textField} value={fullName} onChange={(e) => setFullName(e.target.value.slice(0, 100))} autoComplete="name" placeholder="Adaeze Okafor" />
          {error && <p className={styles.fieldError} role="alert">{error}</p>}
          <button className={styles.authPrimary} disabled={busy} type="submit">Keep going <ArrowRightIcon size={18} /></button>
        </form>}

        {step === "password-choice" && <div>
          <span className={styles.authEyebrow}>Last little choice</span><h2 id={`${instance}-auth-title`}>Password or codes?</h2><p>Add a password for quick logins, or skip it and we’ll send a code whenever you come back.</p>
          <button className={styles.authPrimary} type="button" onClick={() => setStep("password")}>Add a password <ArrowRightIcon size={18} /></button>
          <button className={styles.authQuiet} type="button" onClick={finish}>Codes are fine by me</button>
          <p>Password recovery is easy, by the way. No lifelong commitment here.</p>
        </div>}

        {step === "recovery-sent" && <div className={styles.completeState}><span className={styles.completeIcon}><CheckIcon size={30} /></span><span className={styles.authEyebrow}>Check your inbox</span><h2 id={`${instance}-auth-title`}>Help is on the way.</h2><p>If that account exists, the reset link is already heading there. Nice and private.</p></div>}
        {step === "complete" && <div className={styles.completeState}><span className={styles.completeIcon}><CheckIcon size={30} /></span><span className={styles.authEyebrow}>You’re in</span><h2 id={`${instance}-auth-title`}>Lovely stuff.</h2><p>Taking you to your dashboard now.</p></div>}
      </div>
    </div>
  );
}
