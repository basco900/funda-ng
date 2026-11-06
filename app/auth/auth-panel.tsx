"use client";

import { forwardRef, useEffect, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { ArrowRightIcon, BackIcon, CheckIcon, CloseIcon, LockIcon, MailIcon, PhoneIcon, SpinnerIcon, UserIcon } from "../onboarding/icons";
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
type Step = "identifier" | "existing" | "method" | "password" | "code" | "profile" | "password-choice" | "recovery-sent" | "complete";
type LoginMethod = "password" | "code";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Text input with a leading icon. The placeholder replaces the visible label; aria-label keeps it accessible. */
const IconField = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { icon: ReactNode; action?: ReactNode }
>(function IconField({ icon, action, className, ...props }, ref) {
  return (
    <div className={`${styles.iconField}${action ? ` ${styles.iconFieldWithAction}` : ""}`}>
      <span className={styles.iconFieldIcon} aria-hidden="true">{icon}</span>
      <input ref={ref} {...props} className={`${styles.textField}${className ? ` ${className}` : ""}`} />
      {action && <div className={styles.iconFieldAction}>{action}</div>}
    </div>
  );
});

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
  firstInputRef,
}: {
  value: string;
  onChange: (val: string) => void;
  onComplete?: (code: string) => void;
  error?: boolean;
  firstInputRef?: React.Ref<HTMLInputElement>;
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    const clean = text.replace(/\D/g, "").slice(0, 6);
    if (!clean) return;
    onChange(clean);
    const nextIdx = Math.min(clean.length, 5);
    inputRefs.current[nextIdx]?.focus();
    if (clean.length === 6 && onComplete) {
      onComplete(clean);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
        e.preventDefault();
        const nextArr = [...digits];
        nextArr[index - 1] = "";
        onChange(nextArr.join("").trimEnd());
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "");
    if (!val) {
      const nextArr = [...digits];
      nextArr[index] = "";
      onChange(nextArr.join("").trimEnd());
      return;
    }

    if (val.length > 1) {
      // If user typed a single replacement digit into an already filled box
      if (val.length === 2 && digits[index]) {
        const char = val.replace(digits[index], "") || val.slice(-1);
        const nextArr = [...digits];
        nextArr[index] = char;
        const combined = nextArr.join("");
        onChange(combined);
        if (index < 5) {
          inputRefs.current[index + 1]?.focus();
        }
        if (combined.length === 6 && onComplete) {
          onComplete(combined);
        }
        return;
      }

      // Pasted or autofilled multiple characters
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
    <div className={styles.otpGrid}>
      {Array.from({ length: 6 }).map((_, idx) => (
        <input
          key={idx}
          ref={(el) => {
            inputRefs.current[idx] = el;
            if (idx === 0 && firstInputRef) {
              if (typeof firstInputRef === "function") firstInputRef(el);
              else (firstInputRef as any).current = el;
            }
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoComplete={idx === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${idx + 1}`}
          value={digits[idx] || ""}
          onChange={(e) => handleChange(idx, e)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={styles.otpInput}
          data-filled={Boolean(digits[idx])}
          data-error={Boolean(error)}
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

  // Password is not optional: direct to set password if name is already saved
  if (nextStep === "password-choice") {
    return { name, passwordEnabled: false, step: "password" as const };
  }

  return { name, passwordEnabled, step: nextStep };
}

export default function AuthPanel({ mode, onClose, instance }: { mode: Mode; onClose: () => void; instance: "desktop" | "mobile" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const previewStep = searchParams?.get("previewStep") as Step | null;
  const previewIdent = searchParams?.get("previewIdentifier");
  const queryIdent = searchParams?.get("identifier");
  const previewExisting = searchParams?.get("previewExisting") === "true";

  const dialogRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>(() => {
    if (previewExisting) return "existing";
    if (previewStep && ["identifier", "existing", "code", "profile", "password", "recovery-sent", "complete"].includes(previewStep)) {
      return previewStep;
    }
    return "identifier";
  });
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("password");
  const [identifier, setIdentifier] = useState(() => previewIdent || queryIdent || "");
  const [codeEmail, setCodeEmail] = useState(() => (queryIdent && queryIdent.includes("@") ? queryIdent : ""));
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
  const [existingAccountDetected, setExistingAccountDetected] = useState<boolean>(() => previewExisting);
  const [welcomeName, setWelcomeName] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [codeCountdown, setCodeCountdown] = useState(0);
  const [codeSentSuccess, setCodeSentSuccess] = useState(false);
  const loginCodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (codeCountdown <= 0) return;
    const timer = setInterval(() => {
      setCodeCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [codeCountdown]);

  useEffect(() => {
    if (previewExisting) {
      setExistingAccountDetected(true);
      setStep("existing");
    } else if (previewStep && ["identifier", "existing", "code", "profile", "password", "recovery-sent", "complete"].includes(previewStep)) {
      setStep(previewStep);
    }
    const ident = previewIdent || queryIdent;
    if (ident) {
      setIdentifier(ident);
      if (ident.includes("@")) setCodeEmail(ident);
    }
  }, [previewStep, previewIdent, queryIdent, previewExisting]);

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

  const sendCode = async (
    type = identifierType,
    value = identifier,
    createUser = mode === "register" && !existingAccountDetected,
  ) => {
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
      setCodeCountdown(60);
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
      if (data.user) {
        return finish(profileNameFor(data.user) || undefined);
      }
    } catch {
      fail("Invalid credentials. Please check your details and try again.");
    } finally {
      setBusy(false);
    }
  };

  const requestLoginCode = async () => {
    const email = codeEmail.trim().toLowerCase();
    if (!email) return fail("Please enter your email address.");
    if (!EMAIL_PATTERN.test(email)) return fail("Please enter a valid email address.");

    setSendingCode(true);
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
        if (detail.includes("signups not allowed") || detail.includes("user not found") || result.error.status === 400) {
          return fail("No account found with this email. Please check your spelling or create an account.");
        }
        return fail("Unable to send verification code. Please check your email and try again.");
      }
      setCodeSentSuccess(true);
      setCodeCountdown(60);
      setTimeout(() => loginCodeRef.current?.focus(), 60);
    } catch {
      fail("Unable to send verification code. Please try again.");
    } finally {
      setSendingCode(false);
    }
  };

  const submitCodeLogin = async (event?: FormEvent, submittedCode = loginCode) => {
    if (event) event.preventDefault();
    const email = codeEmail.trim().toLowerCase();
    if (!email) return fail("Please enter your email address.");
    if (!EMAIL_PATTERN.test(email)) return fail("Please enter a valid email address.");

    const trimmedCode = submittedCode.trim();
    if (!trimmedCode) {
      if (!codeSentSuccess) {
        return fail("Please click 'Get code' to receive your verification code.");
      }
      return fail("Please enter the 6-digit code.");
    }
    if (trimmedCode.length !== 6) {
      return fail("Please enter the complete 6-digit code.");
    }

    setBusy(true);
    setError("");
    try {
      const result = await auth().verifyOtp({ email, token: trimmedCode, type: "email" });
      if (result.error) {
        return fail("Invalid or expired code. Please try again.");
      }
      if (result.data.user) {
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

  const submitRegister = async (event: FormEvent) => {
    event.preventDefault();
    const raw = identifier.trim();
    if (!raw) return fail("Please enter your email or phone number.");

    const result = parseIdentifier(raw);
    if (!result) return fail("Please enter a valid email or Nigerian phone number.");

    setIdentifier(result.value);
    setIdentifierType(result.type);
    setError("");
    setBusy(true);

    try {
      const checkRes = await fetch("/api/auth/check-identifier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: result.value }),
      })
        .then((r) => r.json())
        .catch(() => ({ exists: false }));

      if (checkRes?.exists) {
        setExistingAccountDetected(true);
        setStep("existing");
        setBusy(false);
        return;
      }
    } catch {
      // Proceed to standard OTP registration if lookup is unavailable
    }

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
    const name = fullName.trim();
    if (!validFullName(name)) return fail("Please enter your first and last name.");
    if (!validPassword(password)) return fail("Password must be at least 6 characters.");

    setBusy(true);
    setError("");
    try {
      const client = createClient();
      const { data: { user } } = await client.auth.getUser();
      if (!user) return fail("Session expired. Please log in again.");

      const { data: authData, error: updateError } = await client.auth.updateUser({
        password,
        data: completedOnboardingData(user, name, "password"),
      });

      if (updateError) {
        setBusy(false);
        return fail(updateError.message || "Unable to set password. Please try again.");
      }

      await client.from("profiles").update({ full_name: name }).eq("id", user.id);
      setBusy(false);
      setHasPassword(true);
      finish();
    } catch {
      fail("Unable to finish setup. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!validPassword(password)) return fail("Password must be at least 6 characters.");
    setBusy(true);
    setError("");
    try {
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
      if (updateError) {
        setBusy(false);
        return fail(updateError.message || "Password must be at least 6 characters.");
      }
      setHasPassword(true);
      if (data.user) {
        return finish(profileNameFor(data.user) || undefined);
      }
    } catch {
      fail("Unable to save password. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const finish = (name?: string) => {
    if (name) setWelcomeName(name);
    router.replace("/dashboard");
  };

  const continueAuthenticatedUser = async (user: User) => {
    const account = await accountStateFor(user);
    setFullName(account.name);
    setHasPassword(account.passwordEnabled);
    if (mode === "login" || account.step === "complete" || existingAccountDetected) {
      return finish(account.name);
    }
    setStep(account.step);
  };

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let active = true;
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("previewStep")) return;
      const { data } = await createClient().auth.getUser();
      if (!data.user) return;
      if (!active) return;
      router.replace("/dashboard");
    })();
    return () => { active = false; };
  }, [router]);

  const back = () => {
    setError("");
    if (recovery) {
      setRecovery(false);
      setStep("identifier");
    } else if (step === "existing" || step === "code") {
      setStep("identifier");
      setExistingAccountDetected(false);
    } else if (step === "profile") {
      setStep("code");
    } else if (step === "password") {
      setStep(mode === "register" ? "profile" : "identifier");
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

  const getStepTitle = () => {
    if (step === "identifier") {
      if (recovery) return "Reset password.";
      return mode === "login" ? "Welcome back." : "Let’s get you in.";
    }
    if (step === "existing") return "Account already exists.";
    if (step === "code") return "Check your inbox.";
    if (step === "profile") return "The essentials.";
    if (step === "password") return "Create a password.";
    if (step === "recovery-sent") return "Check your email.";
    if (step === "complete") {
      return "You’re in.";
    }
    return "Welcome back.";
  };

  return (
    <div ref={dialogRef} className={styles.authWrap} role="dialog" aria-modal="true" aria-labelledby={`${instance}-auth-title`} tabIndex={-1}>
      <div className={styles.mobileHandle} aria-hidden="true" />
      <div className={styles.authTopbar}>
        <button type="button" onClick={back} className={styles.iconButton} aria-label="Go back"><BackIcon size={19} /></button>
        <span id={`${instance}-auth-title`} className={styles.authTopbarTitle}>{getStepTitle()}</span>
        <button type="button" onClick={onClose} className={styles.iconButton} aria-label="Close"><CloseIcon size={19} /></button>
      </div>
      <div className={styles.authBody}>
        {step === "identifier" && recovery && (
          <form className={styles.compactForm} onSubmit={submitForgotPassword} noValidate>
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
              {busy ? (
                <>
                  <SpinnerIcon size={18} />
                  <span>Sending…</span>
                </>
              ) : (
                <>
                  <span>Send reset link</span>
                  <ArrowRightIcon size={18} />
                </>
              )}
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
                    {busy ? (
                      <>
                        <SpinnerIcon size={18} />
                        <span>Signing in…</span>
                      </>
                    ) : (
                      <>
                        <span>Log in</span>
                        <ArrowRightIcon size={18} />
                      </>
                    )}
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
                onSubmit={submitCodeLogin}
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
                    action={
                      <button
                        type="button"
                        className={styles.getCodeBtn}
                        onClick={requestLoginCode}
                        disabled={sendingCode || codeCountdown > 0 || !codeEmail.trim()}
                      >
                        {sendingCode ? (
                          <>
                            <SpinnerIcon size={13} />
                            <span>Sending…</span>
                          </>
                        ) : codeCountdown > 0 ? (
                          `Resend (${codeCountdown}s)`
                        ) : codeSentSuccess ? (
                          "Resend"
                        ) : (
                          "Get code"
                        )}
                      </button>
                    }
                  />

                  <OtpDigitBoxes
                    value={loginCode}
                    onChange={(val) => { setLoginCode(val); setError(""); }}
                    onComplete={(completedCode) => void submitCodeLogin(undefined, completedCode)}
                    error={Boolean(error && loginMethod === "code")}
                    firstInputRef={loginCodeRef}
                  />
                </div>

                <div className={styles.authTabBottom}>
                  {error && loginMethod === "code" && <p className={styles.fieldError} role="alert">{error}</p>}

                  <button className={styles.authPrimary} disabled={busy} type="submit">
                    {busy ? (
                      <>
                        <SpinnerIcon size={18} />
                        <span>Logging in…</span>
                      </>
                    ) : (
                      <>
                        <span>Log in</span>
                        <ArrowRightIcon size={18} />
                      </>
                    )}
                  </button>

                  <div className={styles.loginAltActions}>
                    <button
                      className={styles.authQuietLink}
                      type="button"
                      onClick={() => {
                        const ident = (identifier || codeEmail).trim();
                        const query = ident ? `?identifier=${encodeURIComponent(ident)}` : "";
                        router.push(`/register${query}`);
                      }}
                    >
                      Don’t have an account? Create one
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {step === "identifier" && !recovery && mode === "register" && (
          <form className={styles.compactForm} onSubmit={submitRegister} noValidate>
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
              {busy ? (
                <>
                  <SpinnerIcon size={18} />
                  <span>Continuing…</span>
                </>
              ) : (
                <>
                  <span>Continue</span>
                  <ArrowRightIcon size={18} />
                </>
              )}
            </button>

            <div className={styles.loginAltActions}>
              <button
                className={styles.authQuietLink}
                type="button"
                onClick={() => {
                  const query = identifier.trim() ? `?identifier=${encodeURIComponent(identifier.trim())}` : "";
                  router.push(`/login${query}`);
                }}
              >
                Already have an account? Log in
              </button>
            </div>
          </form>
        )}

        {step === "existing" && (
          <div className={styles.compactForm}>
            <p className={styles.authSubtitle}>
              This {detectIdentifier(identifier) === "phone" ? "phone number" : "email"} is already linked to a Funda account.
            </p>

            <div className={styles.fieldStack}>
              <div className={styles.existingIdentityPill}>
                <span className={styles.existingIdentityIcon} aria-hidden="true">
                  <IdentifierIcon value={identifier} />
                </span>
                <span className={styles.existingIdentityValue}>{identifier}</span>
                <span className={styles.existingIdentityBadge} aria-label="Registered account">
                  <CheckIcon size={14} />
                </span>
              </div>
            </div>

            <button
              className={styles.authPrimary}
              type="button"
              onClick={() => {
                setError("");
                setStep("identifier");
                setExistingAccountDetected(false);
                router.push(`/login?identifier=${encodeURIComponent(identifier)}`);
              }}
            >
              <span>Continue to Log in</span>
              <ArrowRightIcon size={18} />
            </button>

            <div className={styles.loginAltActions}>
              <button
                type="button"
                className={styles.authQuietLink}
                onClick={() => {
                  setError("");
                  setExistingAccountDetected(false);
                  setStep("identifier");
                }}
              >
                Use a different email or phone
              </button>
            </div>
          </div>
        )}

        {step === "code" && (
          <form className={styles.compactForm} onSubmit={verifyCode} noValidate>
            <p className={styles.authSubtitle}>
              Code sent to <strong>{identifier}</strong>
            </p>

            <div className={styles.fieldStack}>
              <OtpDigitBoxes
                value={code}
                onChange={(val) => { setCode(val); setError(""); }}
                onComplete={(completedCode) => void verifyCode(undefined, completedCode)}
                error={Boolean(error)}
              />
            </div>

            {error && <p className={styles.fieldError} role="alert">{error}</p>}

            <button className={styles.authPrimary} disabled={busy || code.length !== 6} type="submit">
              {busy ? (
                <>
                  <SpinnerIcon size={18} />
                  <span>Verifying…</span>
                </>
              ) : (
                <>
                  <span>Verify code</span>
                  <ArrowRightIcon size={18} />
                </>
              )}
            </button>

            <div className={styles.loginAltActions}>
              <button
                className={styles.authQuietLink}
                disabled={busy || codeCountdown > 0}
                type="button"
                onClick={() => void sendCode()}
              >
                {codeCountdown > 0 ? `Resend code in ${codeCountdown}s` : "Didn’t get it? Resend code"}
              </button>
            </div>
          </form>
        )}

        {step === "profile" && (
          <form className={styles.compactForm} onSubmit={saveProfile} noValidate>
            <p className={styles.authSubtitle}>
              Enter your name and set a password.
            </p>

            <div className={styles.fieldStack}>
              <IconField
                icon={<UserIcon size={18} />}
                value={fullName}
                onChange={(e) => { setFullName(e.target.value.slice(0, 100)); setError(""); }}
                autoComplete="name"
                placeholder="Full name (first & last)"
                aria-label="Full name"
              />

              <IconField
                icon={<LockIcon size={18} />}
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                autoComplete="new-password"
                minLength={6}
                placeholder="Choose a password (6+ characters)"
                aria-label="Password"
              />
            </div>

            {error && <p className={styles.fieldError} role="alert">{error}</p>}

            <button className={styles.authPrimary} disabled={busy} type="submit">
              {busy ? (
                <>
                  <SpinnerIcon size={18} />
                  <span>Creating account…</span>
                </>
              ) : (
                <>
                  <span>Create account</span>
                  <ArrowRightIcon size={18} />
                </>
              )}
            </button>
          </form>
        )}

        {step === "password" && (
          <form className={styles.compactForm} onSubmit={savePassword} noValidate>
            <p className={styles.authSubtitle}>
              {settingPassword ? "Set a secure password for your account." : "Enter your account password."}
            </p>

            <div className={styles.fieldStack}>
              <IconField
                icon={<LockIcon size={18} />}
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                autoComplete={settingPassword ? "new-password" : "current-password"}
                minLength={settingPassword ? 6 : undefined}
                placeholder={settingPassword ? "Password (6+ characters)" : "Password"}
                aria-label="Password"
              />
            </div>

            {error && <p className={styles.fieldError} role="alert">{error}</p>}

            <button className={styles.authPrimary} disabled={busy} type="submit">
              {busy ? (
                <>
                  <SpinnerIcon size={18} />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <span>{settingPassword ? "Save password" : "Log in"}</span>
                  <ArrowRightIcon size={18} />
                </>
              )}
            </button>
          </form>
        )}

        {step === "recovery-sent" && (
          <div className={styles.completeState}>
            <span className={styles.completeIcon}><CheckIcon size={26} /></span>
            <p className={styles.authSubtitle} style={{ marginBottom: "20px" }}>
              We sent a password reset link to your email.
            </p>
            <button className={styles.authPrimary} type="button" onClick={() => { setRecovery(false); setStep("identifier"); }}>
              Back to login
            </button>
          </div>
        )}

        {step === "complete" && (
          <div className={styles.completeState}>
            <span className={styles.completeIcon}><CheckIcon size={26} /></span>
            <p className={styles.authSubtitle} style={{ marginBottom: 0 }}>
              {existingAccountDetected || welcomeName
                ? `Welcome back${welcomeName ? `, ${welcomeName}` : ""}. Taking you straight to your dashboard…`
                : "Welcome to Funda. Taking you straight to your dashboard…"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
