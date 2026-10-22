"use client";

import { useEffect, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { ArrowRightIcon, BackIcon, CheckIcon, CloseIcon, LockIcon, MailIcon, PhoneIcon, UserIcon } from "../onboarding/icons";
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
type LoginMethod = "password" | "code";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Text input with a leading icon. The placeholder replaces the visible label; aria-label keeps it accessible. */
function IconField({ icon, ...props }: InputHTMLAttributes<HTMLInputElement> & { icon: ReactNode }) {
  return (
    <div className={styles.iconField}>
      <span className={styles.iconFieldIcon} aria-hidden="true">{icon}</span>
      <input {...props} className={styles.textField} />
    </div>
  );
}

/** Live guess of what the user is typing, used to swap the identifier icon. */
function detectIdentifier(raw: string): IdentifierType | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.includes("@")) return "email";
  if (/^[0-9+() -]{3,}$/.test(value)) return "phone";
  return null;
}

function IdentifierIcon({ value }: { value: string }) {
  const type = detectIdentifier(value);
  if (type === "email") return <MailIcon size={18} />;
  if (type === "phone") return <PhoneIcon size={18} />;
  return <UserIcon size={18} />;
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
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "8px", margin: "20px 0 4px" }}>
      {Array.from({ length: 6 }).map((_, idx) => (
        <input
          key={idx}
          ref={(el) => { inputRefs.current[idx] = el; }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          aria-label={`Digit ${idx + 1}`}
          value={digits[idx] || ""}
          onChange={(e) => handleChange(idx, e)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          style={{
            width: "100%",
            height: "44px",
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
            color: "#0a0c0e",
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
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("password");
  const [identifier, setIdentifier] = useState("");
  const [codeEmail, setCodeEmail] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
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
    if (!isSupabaseConfigured()) throw new Error("Authentication is temporarily unavailable. Please try again shortly.");
    return createClient().auth;
  };

  const settingPassword = recovery || creatingPassword || (mode === "register" && step === "password");

  const sendCode = async (type = identifierType, value = identifier, createUser = mode === "register") => {
    if (!type || !value) return;
    setBusy(true);
    setError("");
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

      if (result.error) {
        const detail = `${result.error.code ?? ""} ${result.error.message}`.toLowerCase();
        if (result.error.status === 429 || detail.includes("rate limit")) {
          return fail("Too many attempts. Please try again in a few minutes.");
        }
        return fail("Unable to send verification code. Please check your details and try again.");
      }
      setStep("code");
    } catch {
      fail("Unable to send verification code. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event?: FormEvent, submittedCode = code) => {
    if (event) event.preventDefault();
    if (!submittedCode || submittedCode.length !== 6) return fail("Please enter the 6-digit code.");
    setBusy(true);
    setError("");
    try {
      const result = identifierType === "email"
        ? await auth().verifyOtp({ email: identifier, token: submittedCode, type: "email" })
        : await auth().verifyOtp({ phone: identifier, token: submittedCode, type: "sms" });

      if (result.error) return fail("Invalid or expired code. Please try again.");
      if (recovery) {
        setStep("password");
      } else if (result.data.user) {
        await continueAuthenticatedUser(result.data.user);
      } else {
        fail("Unable to complete verification. Please try again.");
      }
    } catch {
      fail("Invalid or expired code. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitPasswordLogin = async (event: FormEvent) => {
    event.preventDefault();
    const raw = identifier.trim();
    if (!raw) return fail("Please enter your email or phone number.");
    if (!password) return fail("Please enter your password.");

    const account = parseIdentifier(raw);
    if (!account) return fail("Please enter a valid email or Nigerian phone number.");

    setBusy(true);
    setError("");
    try {
      const credentials = account.type === "email" ? { email: account.value, password } : { phone: account.value, password };
      const { data, error: signInError } = await auth().signInWithPassword(credentials);
      if (signInError) {
        const detail = `${signInError.code ?? ""} ${signInError.message}`.toLowerCase();
        if (signInError.status === 429 || detail.includes("rate limit")) {
          return fail("Too many attempts. Please try again in a few minutes.");
        }
        return fail("Invalid credentials. Please check your details and try again.");
      }
      if (data.user) await continueAuthenticatedUser(data.user);
    } catch {
      fail("Invalid credentials. Please check your details and try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitGetCode = async (event: FormEvent) => {
    event.preventDefault();
    const email = codeEmail.trim().toLowerCase();
    if (!email) return fail("Please enter your email address.");
    if (!EMAIL_PATTERN.test(email)) return fail("Please enter a valid email address.");

    setBusy(true);
    setError("");
    try {
      const options = {
        shouldCreateUser: false,
        data: {
          onboarding_version: ONBOARDING_VERSION,
          onboarding_complete: false,
          password_enabled: false,
        },
      };
      const result = await auth().signInWithOtp({ email, options });
      if (result.error) {
        const detail = `${result.error.code ?? ""} ${result.error.message}`.toLowerCase();
        if (result.error.status === 429 || detail.includes("rate limit")) {
          return fail("Too many attempts. Please try again in a few minutes.");
        }
        return fail("Unable to send verification code. Please check your email and try again.");
      }
      setIdentifier(email);
      setIdentifierType("email");
      setCode("");
      setStep("code");
    } catch {
      fail("Unable to send verification code. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitRegister = async (event: FormEvent) => {
    event.preventDefault();
    const raw = identifier.trim();
    if (!raw) return fail("Please enter your email or phone number.");

    const result = parseIdentifier(raw);
    if (!result) return fail("Please enter a valid email or Nigerian phone number.");

    setIdentifier(result.value);
    setIdentifierType(result.type);
    setError("");
    await sendCode(result.type, result.value, true);
  };

  const submitForgotPassword = async (event: FormEvent) => {
    event.preventDefault();
    const email = (recoveryEmail || identifier).trim().toLowerCase();
    if (!email) return fail("Please enter your email address.");
    if (!EMAIL_PATTERN.test(email)) return fail("Please enter a valid email address.");

    setBusy(true);
    setError("");
    try {
      await auth().resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/auth/callback?next=/auth/reset-password`,
      });
    } catch {
      // Non-revealing: never disclose whether the account exists.
    } finally {
      setBusy(false);
      setStep("recovery-sent");
    }
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!validFullName(fullName)) return fail("Please enter your first and last name.");
    setBusy(true);
    const client = createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return fail("Session expired. Please log in again.");
    const name = fullName.trim();
    const { data: authData, error: updateError } = await client.auth.updateUser({
      data: incompleteOnboardingData(user, name),
    });
    const { error: profileError } = await client.from("profiles").update({ full_name: name }).eq("id", user.id);
    setBusy(false);
    if (updateError || profileError) return fail("Unable to save name. Please try again.");
    if (hasPassword && authData.user) {
      const { error: completionError } = await client.auth.updateUser({
        data: completedOnboardingData(authData.user, name, "password"),
      });
      if (completionError) return fail("Unable to finish setup. Please try again.");
      return finish();
    }
    setStep("password-choice");
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!validPassword(password)) return fail("Password must be at least 6 characters.");
    setBusy(true);
    const client = createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return fail("Session expired. Please log in again.");
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
    if (updateError) return fail("Password must be at least 6 characters.");
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
    setBusy(true);
    setError("");
    const client = createClient();
    const { data: { user } } = await client.auth.getUser();
    const name = user ? profileNameFor(user, fullName) : "";
    if (!user || !validFullName(name)) return fail("Please enter your name first.");
    const { error: completionError } = await client.auth.updateUser({
      data: completedOnboardingData(user, name, "code"),
    });
    setBusy(false);
    if (completionError) return fail("Unable to save preferences. Please try again.");
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
    if (recovery) {
      setRecovery(false);
      setStep("identifier");
    } else if (step === "code") {
      setStep("identifier");
    } else if (step === "password") {
      setStep(settingPassword ? "password-choice" : "identifier");
    } else if (step === "recovery-sent") {
      setRecovery(false);
      setStep("identifier");
    } else {
      onClose();
    }
  };

  const chooseMethod = (method: LoginMethod) => {
    setLoginMethod(method);
    setError("");
    if (method === "code" && !codeEmail && identifier.includes("@")) setCodeEmail(identifier);
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
        {step === "identifier" && recovery && (
          <form className={styles.compactForm} onSubmit={submitForgotPassword} noValidate>
            <h2 id={`${instance}-auth-title`}>Reset password</h2>

            <div className={styles.fieldStack}>
              <IconField
                icon={<MailIcon size={18} />}
                type="email"
                value={recoveryEmail}
                onChange={(e) => { setRecoveryEmail(e.target.value); setError(""); }}
                autoComplete="email"
                placeholder="Email address"
                aria-label="Email address"
              />
            </div>

            {error && <p className={styles.fieldError} role="alert">{error}</p>}

            <button className={styles.authPrimary} disabled={busy} type="submit">
              {busy ? "Sending…" : "Send reset link"} <ArrowRightIcon size={18} />
            </button>

            <div className={styles.loginAltActions}>
              <button className={styles.authQuietLink} type="button" onClick={() => { setRecovery(false); setError(""); }}>
                Back to login
              </button>
            </div>
          </form>
        )}

        {step === "identifier" && !recovery && mode === "login" && (
          <div className={styles.loginForm}>
            <h2 id={`${instance}-auth-title`}>Welcome back.</h2>

            <div className={styles.authTabs} role="tablist" aria-label="Login method">
              <button
                type="button"
                role="tab"
                aria-selected={loginMethod === "password"}
                className={styles.authTab}
                data-active={loginMethod === "password"}
                onClick={() => chooseMethod("password")}
              >
                Login with password
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={loginMethod === "code"}
                className={styles.authTab}
                data-active={loginMethod === "code"}
                onClick={() => chooseMethod("code")}
              >
                Get a Code
              </button>
            </div>

            {/* Both panels share one grid cell, so the card always takes the taller one's height */}
            <div className={styles.authTabStack}>
              <form
                onSubmit={submitPasswordLogin}
                className={styles.authTabPanel}
                data-active={loginMethod === "password"}
                inert={loginMethod !== "password"}
                aria-hidden={loginMethod !== "password"}
                noValidate
              >
                <div className={styles.fieldStack}>
                  <IconField
                    icon={<IdentifierIcon value={identifier} />}
                    type="text"
                    inputMode={detectIdentifier(identifier) === "phone" ? "tel" : "email"}
                    value={identifier}
                    onChange={(e) => { setIdentifier(e.target.value); setError(""); }}
                    autoComplete="username"
                    placeholder="Email or phone number"
                    aria-label="Email or phone number"
                  />
                  <IconField
                    icon={<LockIcon size={18} />}
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    autoComplete="current-password"
                    placeholder="Password"
                    aria-label="Password"
                  />
                </div>

                <div className={styles.authTabBottom}>
                  {error && loginMethod === "password" && <p className={styles.fieldError} role="alert">{error}</p>}

                  <button className={styles.authPrimary} disabled={busy} type="submit">
                    {busy ? "Signing in…" : "Log in"} <ArrowRightIcon size={18} />
                  </button>

                  <div className={styles.loginAltActions}>
                    <button
                      className={styles.authQuietLink}
                      type="button"
                      onClick={() => {
                        setRecovery(true);
                        setRecoveryEmail(identifier.includes("@") ? identifier : "");
                        setError("");
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>
              </form>

              <form
                onSubmit={submitGetCode}
                className={styles.authTabPanel}
                data-active={loginMethod === "code"}
                inert={loginMethod !== "code"}
                aria-hidden={loginMethod !== "code"}
                noValidate
              >
                <div className={styles.fieldStack}>
                  <IconField
                    icon={<MailIcon size={18} />}
                    type="email"
                    value={codeEmail}
                    onChange={(e) => { setCodeEmail(e.target.value); setError(""); }}
                    autoComplete="email"
                    placeholder="Email address"
                    aria-label="Email address"
                  />
                </div>

                <div className={styles.authTabBottom}>
                  {error && loginMethod === "code" && <p className={styles.fieldError} role="alert">{error}</p>}

                  <button className={styles.authPrimary} disabled={busy} type="submit">
                    {busy ? "Sending code…" : "Get code"} <ArrowRightIcon size={18} />
                  </button>

                  {/* Empty row mirrors "Forgot password?" so both buttons sit at the exact same baseline */}
                  <div className={styles.loginAltActions} aria-hidden="true" style={{ visibility: "hidden" }}>
                    <span className={styles.authQuietLink}>Placeholder</span>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {step === "identifier" && !recovery && mode === "register" && (
          <form className={styles.compactForm} onSubmit={submitRegister} noValidate>
            <h2 id={`${instance}-auth-title`}>Let’s get you in.</h2>

            <div className={styles.fieldStack}>
              <IconField
                icon={<IdentifierIcon value={identifier} />}
                type="text"
                inputMode={detectIdentifier(identifier) === "phone" ? "tel" : "email"}
                value={identifier}
                onChange={(e) => { setIdentifier(e.target.value); setError(""); }}
                autoComplete="username"
                placeholder="Email or phone number"
                aria-label="Email or phone number"
              />
            </div>

            {error && <p className={styles.fieldError} role="alert">{error}</p>}

            <button className={styles.authPrimary} disabled={busy} type="submit">
              {busy ? "Continuing…" : "Continue"} <ArrowRightIcon size={18} />
            </button>

            <div className={styles.loginAltActions}>
              <button className={styles.authQuietLink} type="button" onClick={() => router.push("/login")}>
                Already have an account? Log in
              </button>
            </div>
          </form>
        )}

        {step === "code" && (
          <form className={styles.compactForm} onSubmit={verifyCode} noValidate>
            <h2 id={`${instance}-auth-title`}>Enter code</h2>
            <p className={styles.sentTo}>Sent to <strong>{identifier}</strong></p>

            <OtpDigitBoxes
              value={code}
              onChange={(val) => { setCode(val); setError(""); }}
              onComplete={(completedCode) => void verifyCode(undefined, completedCode)}
              error={Boolean(error)}
            />

            {error && <p className={styles.fieldError} role="alert">{error}</p>}

            <button className={styles.authPrimary} disabled={busy || code.length !== 6} type="submit">
              {busy ? "Verifying…" : "Verify code"} <ArrowRightIcon size={18} />
            </button>

            <div className={styles.loginAltActions}>
              <button className={styles.authQuietLink} disabled={busy} type="button" onClick={() => void sendCode()}>
                Resend code
              </button>
            </div>
          </form>
        )}

        {step === "profile" && (
          <form className={styles.compactForm} onSubmit={saveProfile} noValidate>
            <h2 id={`${instance}-auth-title`}>What’s your full name?</h2>

            <div className={styles.fieldStack}>
              <IconField
                icon={<UserIcon size={18} />}
                value={fullName}
                onChange={(e) => setFullName(e.target.value.slice(0, 100))}
                autoComplete="name"
                placeholder="Full name"
                aria-label="Full name"
              />
            </div>

            {error && <p className={styles.fieldError} role="alert">{error}</p>}

            <button className={styles.authPrimary} disabled={busy} type="submit">
              Continue <ArrowRightIcon size={18} />
            </button>
          </form>
        )}

        {step === "password-choice" && (
          <div className={styles.compactForm}>
            <h2 id={`${instance}-auth-title`}>Password or codes?</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "24px" }}>
              <button className={styles.authPrimary} type="button" onClick={() => { setCreatingPassword(true); setStep("password"); }}>
                Add a password <ArrowRightIcon size={18} />
              </button>
              <button className={styles.authQuiet} disabled={busy} type="button" onClick={() => void finishWithCodes()}>
                {busy ? "Saving…" : "Codes are fine by me"}
              </button>
            </div>
            {error && <p className={styles.fieldError} role="alert">{error}</p>}
          </div>
        )}

        {step === "password" && (
          <form className={styles.compactForm} onSubmit={savePassword} noValidate>
            <h2 id={`${instance}-auth-title`}>{settingPassword ? "Create password" : "Enter password"}</h2>

            <div className={styles.fieldStack}>
              <IconField
                icon={<LockIcon size={18} />}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={settingPassword ? "new-password" : "current-password"}
                minLength={settingPassword ? 6 : undefined}
                placeholder={settingPassword ? "Password (6+ characters)" : "Password"}
                aria-label="Password"
              />
            </div>

            {error && <p className={styles.fieldError} role="alert">{error}</p>}

            <button className={styles.authPrimary} disabled={busy} type="submit">
              {busy ? "Saving…" : settingPassword ? "Save password" : "Log in"} <ArrowRightIcon size={18} />
            </button>
          </form>
        )}

        {step === "recovery-sent" && (
          <div className={styles.completeState}>
            <span className={styles.completeIcon}><CheckIcon size={30} /></span>
            <h2 id={`${instance}-auth-title`}>Check your email</h2>
            <p>If an account exists for this email, a reset link is on its way.</p>
            <div style={{ marginTop: "24px" }}>
              <button className={styles.authPrimary} type="button" onClick={() => { setRecovery(false); setStep("identifier"); }}>
                Back to login
              </button>
            </div>
          </div>
        )}

        {step === "complete" && (
          <div className={styles.completeState}>
            <span className={styles.completeIcon}><CheckIcon size={30} /></span>
            <h2 id={`${instance}-auth-title`}>You’re in.</h2>
          </div>
        )}
      </div>
    </div>
  );
}
