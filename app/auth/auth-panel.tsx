"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AuthError, User } from "@supabase/supabase-js";
import { ArrowRightIcon, BackIcon, CheckIcon, CloseIcon } from "../onboarding/icons";
import { parseIdentifier, validFullName, validPassword, type IdentifierType } from "../../lib/auth/identifiers";
import {
  completedOnboardingData,
  incompleteOnboardingData,
  ONBOARDING_VERSION,
  onboardingStepFor,
  passwordIsEnabled,
  profileNameFor,
} from "../../lib/auth/onboarding";
import { createClient } from "../../lib/supabase/client";
import { isSupabaseConfigured } from "../../lib/supabase/config";
import styles from "../onboarding/funda-experience.module.css";

type Mode = "login" | "register";
type Step = "identifier" | "method" | "password" | "code" | "profile" | "password-choice" | "recovery-sent" | "complete";

function otpErrorMessage(error: AuthError, createUser: boolean) {
  const detail = `${error.code ?? ""} ${error.message}`.toLowerCase();

  if (error.status === 429 || detail.includes("rate limit") || detail.includes("rate_limit")) {
    return "That button’s still warm. Give it a minute, then ask again.";
  }
  if (detail.includes("invalid") && detail.includes("email")) {
    return "That email looks a little off. Give it a quick check.";
  }
  if (detail.includes("already") || detail.includes("registered")) {
    return "You’re already with us. Log in and we’ll take it from there.";
  }
  if (detail.includes("smtp") || detail.includes("email") || detail.includes("send")) {
    return "Email delivery is taking a breather. Try again shortly.";
  }

  return createUser
    ? "Couldn’t send that code just yet. Try again in a moment."
    : "Couldn’t send a code just yet. Try again in a moment.";
}

function OtpDigitBoxes({
  value,
  onChange,
  onComplete,
  error,
}: {
  value: string;
  onChange: (val: string) => void;
  onComplete?: (code: string) => void;
  error?: boolean;
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "");
    if (!val) {
      const next = value.slice(0, index) + value.slice(index + 1);
      onChange(next);
      return;
    }

    if (val.length > 1) {
      // Pasted full 6-digit code
      const clean = val.slice(0, 6);
      onChange(clean);
      const nextIdx = Math.min(clean.length, 5);
      inputRefs.current[nextIdx]?.focus();
      if (clean.length === 6 && onComplete) onComplete(clean);
      return;
    }

    const nextArr = [...digits];
    nextArr[index] = val;
    const combined = nextArr.join("").slice(0, 6);
    onChange(combined);

    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    } else if (combined.length === 6 && onComplete) {
      onComplete(combined);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "8px", margin: "10px 0 16px" }}>
      {Array.from({ length: 6 }).map((_, idx) => (
        <input
          key={idx}
          ref={(el) => { inputRefs.current[idx] = el; }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={digits[idx] || ""}
          onChange={(e) => handleChange(idx, e)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          style={{
            width: "100%",
            height: "42px",
            textAlign: "center",
            fontSize: "18px",
            fontWeight: "700",
            fontFamily: "var(--font-geist-mono), monospace",
            borderRadius: "14px",
            border: error
              ? "1.5px solid #ef4444"
              : digits[idx]
                ? "1.5px solid #18745a"
                : "1px solid rgba(0, 0, 0, 0.12)",
            background: digits[idx] ? "rgba(24, 116, 90, 0.06)" : "#ffffff",
            color: "#0a0b0e",
            boxShadow: digits[idx] ? "0 0 0 3px rgba(24, 116, 90, 0.18)" : "none",
            outline: "none",
            transition: "all 180ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      ))}
    </div>
  );
}

async function accountStateFor(user: User) {
  const client = createClient();
  const { data: profile } = await client.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const name = profileNameFor(user, profile?.full_name);
  const passwordEnabled = passwordIsEnabled(user);
  const nextStep = onboardingStepFor(user, profile?.full_name);

  if (nextStep === "password-choice" && passwordEnabled && validFullName(name)) {
    const { error } = await client.auth.updateUser({
      data: completedOnboardingData(user, name, "password"),
    });
    if (!error) return { name, passwordEnabled, step: "complete" as const };
  }

  return { name, passwordEnabled, step: nextStep };
}

export default function AuthPanel({ mode, onClose, instance }: { mode: Mode; onClose: () => void; instance: "desktop" | "mobile" }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [identifierType, setIdentifierType] = useState<IdentifierType | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [creatingPassword, setCreatingPassword] = useState(false);
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
  const isPhone = parsed?.type === "phone" || /^[0-9+() -]{4,}$/.test(identifier.trim());
  const settingPassword = recovery || creatingPassword || (mode === "register" && step === "password");

  const begin = async (event: FormEvent) => {
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
    if (mode === "register") {
      await sendCode(result.type, result.value, true);
      return;
    }
    if (!password) return fail("Add your password, or ask for a code instead.");
    await loginWithPassword(result);
  };

  const sendCode = async (type = identifierType, value = identifier, createUser = mode === "register") => {
    if (!type) return;
    setBusy(true); setError("");
    try {
      const options = {
        shouldCreateUser: createUser,
        data: {
          onboarding_version: ONBOARDING_VERSION,
          onboarding_complete: false,
          password_enabled: false,
        },
      };
      const result = type === "email"
        ? await auth().signInWithOtp({ email: value, options })
        : await auth().signInWithOtp({ phone: value, options });
      if (result.error) return fail(otpErrorMessage(result.error, createUser));
      setStep("code");
    } catch (cause) { fail(cause instanceof Error ? cause.message : "Something got in the way. Try again."); }
    finally { setBusy(false); }
  };

  const verifyCode = async (event?: FormEvent, submittedCode = code) => {
    if (event) event.preventDefault();
    if (!identifierType || submittedCode.length !== 6) return fail("Pop in the six-digit code.");
    setBusy(true); setError("");
    try {
      const result = identifierType === "email"
        ? await auth().verifyOtp({ email: identifier, token: submittedCode, type: "email" })
        : await auth().verifyOtp({ phone: identifier, token: submittedCode, type: "sms" });
      if (result.error) return fail("That code didn’t land. Check it, or ask for a fresh one.");
      if (recovery) setStep("password");
      else if (result.data.user) await continueAuthenticatedUser(result.data.user);
      else fail("You’re verified, but we couldn’t open your account. Try once more.");
    } catch (cause) { fail(cause instanceof Error ? cause.message : "Couldn’t verify that code."); }
    finally { setBusy(false); }
  };

  const loginWithPassword = async (account: NonNullable<ReturnType<typeof parseIdentifier>>) => {
    if (!password) return fail("Add your password, or ask for a code instead.");
    setBusy(true); setError("");
    try {
      const credentials = account.type === "email" ? { email: account.value, password } : { phone: account.value, password };
      const { data, error: signInError } = await auth().signInWithPassword(credentials);
      if (signInError) return fail("Those details don’t match. Try again or reset the password—easy fix.");
      if (data.user) await continueAuthenticatedUser(data.user);
    } catch (cause) { fail(cause instanceof Error ? cause.message : "Couldn’t log you in."); }
    finally { setBusy(false); }
  };

  const signInWithPassword = async (event: FormEvent) => {
    event.preventDefault();
    const account = parseIdentifier(identifier);
    if (!account) return fail("Try a proper email or Nigerian phone number.");
    await loginWithPassword(account);
  };

  const requestLoginCode = async () => {
    const account = parseIdentifier(identifier);
    if (!account) return fail("Add your email or Nigerian phone number first.");
    setIdentifier(account.value);
    setIdentifierType(account.type);
    await sendCode(account.type, account.value, false);
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!validFullName(fullName)) return fail("First and last name, please—your full government-ish name.");
    setBusy(true);
    const client = createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return fail("Your session took a breather. Log in again and we’ll pick up here.");
    const name = fullName.trim();
    const { data: authData, error: updateError } = await client.auth.updateUser({
      data: incompleteOnboardingData(user, name),
    });
    const { error: profileError } = await client.from("profiles").update({ full_name: name }).eq("id", user.id);
    setBusy(false);
    if (updateError || profileError) return fail("Couldn’t save your name just yet. Give it another go.");
    if (hasPassword && authData.user) {
      const { error: completionError } = await client.auth.updateUser({
        data: completedOnboardingData(authData.user, name, "password"),
      });
      if (completionError) return fail("Your name is safe. One more tap will finish things up.");
      return finish();
    }
    setStep("password-choice");
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!validPassword(password)) return fail("Six characters or more. That’s the whole rule.");
    setBusy(true);
    const client = createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return fail("Your session took a breather. Log in again and we’ll pick up here.");
    const name = profileNameFor(user, fullName);
    const nextData = validFullName(name)
      ? completedOnboardingData(user, name, "password")
      : {
          ...incompleteOnboardingData(user),
          password_enabled: true,
          login_preference: "password",
        };
    const { data, error: updateError } = await client.auth.updateUser({ password, data: nextData });
    setBusy(false);
    if (updateError) return fail("That password didn’t stick. Try six or more characters.");
    setHasPassword(true);
    if (data.user) await continueAuthenticatedUser(data.user);
  };

  const finish = () => {
    setStep("complete");
    setTimeout(() => router.replace("/dashboard"), 550);
  };

  const continueAuthenticatedUser = async (user: User) => {
    const account = await accountStateFor(user);
    setFullName(account.name);
    setHasPassword(account.passwordEnabled);
    if (account.step === "complete") return finish();
    setStep(account.step);
  };

  const finishWithCodes = async () => {
    setBusy(true); setError("");
    const client = createClient();
    const { data: { user } } = await client.auth.getUser();
    const name = user ? profileNameFor(user, fullName) : "";
    if (!user || !validFullName(name)) return fail("Let’s save your name first, then you’re done.");
    const { error: completionError } = await client.auth.updateUser({
      data: completedOnboardingData(user, name, "code"),
    });
    setBusy(false);
    if (completionError) return fail("Almost there. Give that one more tap.");
    finish();
  };

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let active = true;
    void (async () => {
      const { data } = await createClient().auth.getUser();
      if (!data.user) return;
      const account = await accountStateFor(data.user);
      if (!active) return;
      setFullName(account.name);
      setHasPassword(account.passwordEnabled);
      if (account.step === "complete") {
        setStep("complete");
        setTimeout(() => router.replace("/dashboard"), 550);
      } else {
        setStep(account.step);
      }
    })();
    return () => { active = false; };
  }, [router]);

  const back = () => {
    setError("");
    if (step === "method") setStep("identifier");
    else if (step === "code") setStep("identifier");
    else if (step === "password") setStep(recovery ? "identifier" : settingPassword ? "password-choice" : "method");
    else if (step === "recovery-sent") setStep("identifier");
    else if (["profile", "password-choice"].includes(step)) onClose();
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
      <div className={styles.authBody}>
        {step === "identifier" && (
          <form
            className={mode === "login" && !recovery ? styles.loginForm : undefined}
            onSubmit={begin}
            noValidate
          >
            {!(mode === "login" && !recovery) && (
              <span className={styles.authEyebrow}>{mode === "register" ? "Join Funda" : "Password rescue"}</span>
            )}
            <h2 id={`${instance}-auth-title`}>
              {mode === "register" ? "Let’s get you in." : recovery ? "We’ve got you." : "Welcome back."}
            </h2>
            {!(mode === "login" && !recovery) && (
              <p>{recovery
                ? "Drop your email or phone. Getting back in is pleasantly easy."
                : "Email or phone—whichever you actually remember."}</p>
            )}
            <label className={styles.fieldLabel} htmlFor={`${instance}-${mode}-identifier`}>Email or phone number</label>

            <div style={{ position: "relative" }}>
              {isPhone && (
                <span
                  style={{
                    position: "absolute",
                    left: "14px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "13px",
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontWeight: "600",
                    color: "#59605c",
                    pointerEvents: "none",
                  }}
                >
                  🇳🇬 +234
                </span>
              )}
              <input
                id={`${instance}-${mode}-identifier`}
                className={styles.textField}
                value={identifier}
                onChange={(e) => { setIdentifier(e.target.value); setError(""); }}
                autoComplete="username"
                inputMode="text"
                placeholder={isPhone ? "801 234 5678" : "you@email.com or 0801 234 5678"}
                style={{
                  paddingLeft: isPhone ? "82px" : "15px",
                }}
              />
            </div>

            {mode === "login" && !recovery && (
              <>
                <label className={styles.fieldLabel} htmlFor={`${instance}-login-password`}>Password</label>
                <input
                  id={`${instance}-login-password`}
                  className={styles.textField}
                  type="password"
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); setError(""); }}
                  autoComplete="current-password"
                  placeholder="Your password"
                />
              </>
            )}

            {error && <p className={styles.fieldError} role="alert">{error}</p>}
            {mode === "login" && !recovery ? (
              <div>
                <button className={styles.authPrimary} disabled={busy} type="submit">
                  {busy ? "One sec…" : "Log in"} <ArrowRightIcon size={18} />
                </button>
                <div className={styles.loginAltActions}>
                  <button className={styles.authQuiet} disabled={busy} type="button" onClick={() => void requestLoginCode()}>
                    Use a code
                  </button>
                  <span aria-hidden="true">·</span>
                  <button className={styles.authQuiet} type="button" onClick={() => { setRecovery(true); setPassword(""); }}>
                    Forgot password?
                  </button>
                </div>
              </div>
            ) : (
              <button className={styles.authPrimary} disabled={busy} type="submit">
                {busy ? "One sec…" : recovery ? "Help me back in" : "Continue"} <ArrowRightIcon size={18} />
              </button>
            )}
          </form>
        )}

        {step === "method" && (
          <form onSubmit={signInWithPassword} noValidate>
            <span className={styles.authEyebrow}>Your call</span>
            <h2 id={`${instance}-auth-title`}>Welcome back.</h2>
            <p>Add your password, or get a fresh code. No extra ceremony.</p>
            <label className={styles.fieldLabel} htmlFor={`${instance}-quick-password`}>Password</label>
            <input
              id={`${instance}-quick-password`}
              className={styles.textField}
              type="password"
              value={password}
              onChange={(event) => { setPassword(event.target.value); setError(""); }}
              autoComplete="current-password"
              placeholder="Your password"
            />
            {error && <p className={styles.fieldError} role="alert">{error}</p>}
            <button className={styles.authPrimary} disabled={busy} type="submit">
              {busy ? "One sec…" : "Log me in"} <ArrowRightIcon size={18} />
            </button>
            <button className={styles.authQuiet} disabled={busy} type="button" onClick={() => void sendCode(identifierType, identifier, false)}>
              Send me a code instead
            </button>
            <button className={styles.authQuiet} type="button" onClick={() => { setRecovery(true); setStep("identifier"); }}>
              Forgot password? Easy fix.
            </button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={settingPassword ? savePassword : signInWithPassword} noValidate>
            <span className={styles.authEyebrow}>{settingPassword ? "Fresh start" : "Password time"}</span>
            <h2 id={`${instance}-auth-title`}>{settingPassword ? "Pick one you’ll remember." : "You know the drill."}</h2>
            <p>{settingPassword ? "Six characters minimum. If it slips your mind later, getting it back is easy." : "No peeking—we only ever send this securely to Supabase Auth."}</p>
            <label className={styles.fieldLabel} htmlFor={`${instance}-password`}>Password</label>
            <input
              id={`${instance}-password`}
              className={styles.textField}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={settingPassword ? "new-password" : "current-password"}
              minLength={settingPassword ? 6 : undefined}
              placeholder={settingPassword ? "6+ characters" : "Your password"}
            />
            {error && <p className={styles.fieldError} role="alert">{error}</p>}
            <button className={styles.authPrimary} disabled={busy} type="submit">
              {busy ? "Checking…" : settingPassword ? "Save password" : "Log me in"} <ArrowRightIcon size={18} />
            </button>
            {!recovery && (
              <button className={styles.authQuiet} type="button" onClick={() => { setRecovery(true); setStep("identifier"); }}>
                Forgot it? We’ll sort it.
              </button>
            )}
          </form>
        )}

        {step === "code" && (
          <form onSubmit={verifyCode} noValidate>
            <span className={styles.authEyebrow}>One quick check</span>
            <h2 id={`${instance}-auth-title`}>Code, please.</h2>
            <p>We sent six digits to your {identifierType === "email" ? "email" : "phone"}.</p>
            <label className={styles.fieldLabel}>Six-digit code</label>

            {/* 6-box discrete OTP inputs */}
            <OtpDigitBoxes
              value={code}
              onChange={(val) => { setCode(val); setError(""); }}
              onComplete={(completedCode) => void verifyCode(undefined, completedCode)}
              error={Boolean(error)}
            />

            {error && <p className={styles.fieldError} role="alert">{error}</p>}
            <button className={styles.authPrimary} disabled={busy || code.length !== 6} type="submit">
              {busy ? "Checking…" : "Verify code"} <ArrowRightIcon size={18} />
            </button>
            <button className={styles.authQuiet} disabled={busy} type="button" onClick={() => void sendCode()}>
              Send a fresh code
            </button>
          </form>
        )}

        {step === "profile" && (
          <form onSubmit={saveProfile} noValidate>
            <span className={styles.authEyebrow}>Nice to meet you</span>
            <h2 id={`${instance}-auth-title`}>What’s your full name?</h2>
            <p>The proper version—first and last. We’ll keep it friendly everywhere else.</p>
            <label className={styles.fieldLabel} htmlFor={`${instance}-full-name`}>Full name</label>
            <input
              id={`${instance}-full-name`}
              className={styles.textField}
              value={fullName}
              onChange={(e) => setFullName(e.target.value.slice(0, 100))}
              autoComplete="name"
              placeholder="Adaeze Okafor"
            />
            {error && <p className={styles.fieldError} role="alert">{error}</p>}
            <button className={styles.authPrimary} disabled={busy} type="submit">
              Keep going <ArrowRightIcon size={18} />
            </button>
          </form>
        )}

        {step === "password-choice" && (
          <div>
            <span className={styles.authEyebrow}>Last little choice</span>
            <h2 id={`${instance}-auth-title`}>Password or codes?</h2>
            <p>Add a password for quick logins, or skip it and we’ll send a code whenever you come back.</p>
            <button className={styles.authPrimary} type="button" onClick={() => { setCreatingPassword(true); setStep("password"); }}>
              Add a password <ArrowRightIcon size={18} />
            </button>
            <button className={styles.authQuiet} disabled={busy} type="button" onClick={() => void finishWithCodes()}>
              {busy ? "Saving…" : "Codes are fine by me"}
            </button>
            <p>Password recovery is easy, by the way. No lifelong commitment here.</p>
          </div>
        )}

        {step === "recovery-sent" && (
          <div className={styles.completeState}>
            <span className={styles.completeIcon}><CheckIcon size={30} /></span>
            <span className={styles.authEyebrow}>Check your inbox</span>
            <h2 id={`${instance}-auth-title`}>Help is on the way.</h2>
            <p>If that account exists, the reset link is already heading there. Nice and private.</p>
          </div>
        )}

        {step === "complete" && (
          <div className={styles.completeState}>
            <span className={styles.completeIcon}><CheckIcon size={30} /></span>
            <span className={styles.authEyebrow}>You’re in</span>
            <h2 id={`${instance}-auth-title`}>Lovely stuff.</h2>
            <p>Taking you to your dashboard now.</p>
          </div>
        )}
      </div>
    </div>
  );
}
