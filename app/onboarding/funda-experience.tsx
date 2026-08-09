"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type TouchEvent,
} from "react";
import {
  ArrowRightIcon,
  BackIcon,
  CheckIcon,
  CloseIcon,
  ShieldIcon,
} from "./icons";
import type {
  AuthPreviewMode,
  AuthPreviewStep,
  StoryDefinition,
} from "./stories";
import styles from "./funda-experience.module.css";

type FundaExperienceProps = {
  stories: StoryDefinition[];
};

const AUTOPLAY_DELAY = 6000;
const WHEEL_COOLDOWN = 720;
const DEMO_OTP = "123456";

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return reducedMotion;
}

function StoryArtwork({ story, index }: { story: StoryDefinition; index: number }) {
  return (
    <div className={styles.artworkScene} data-visual={story.visual} key={story.id}>
      <span className={styles.artGlow} aria-hidden="true" />
      <span className={styles.orbitOne} aria-hidden="true" />
      <span className={styles.orbitTwo} aria-hidden="true" />
      <div className={styles.artworkImage}>
        <Image
          src={story.artwork}
          alt={story.artworkAlt}
          fill
          sizes="(max-width: 767px) 86vw, (max-width: 1180px) 36vw, 32vw"
          preload={index === 0}
          loading={index === 0 ? undefined : "lazy"}
        />
      </div>
    </div>
  );
}

function normalizeLocalPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("234")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

function formatLocalPhone(value: string) {
  return [value.slice(0, 3), value.slice(3, 6), value.slice(6, 10)]
    .filter(Boolean)
    .join(" ");
}

function AuthPreview({ mode, onClose, instance }: { mode: AuthPreviewMode; onClose: () => void; instance: "desktop" | "mobile" }) {
  const [step, setStep] = useState<AuthPreviewStep>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [firstName, setFirstName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      const isDesktop = window.matchMedia("(min-width: 960px)").matches;
      const isVisibleInstance = isDesktop ? instance === "desktop" : instance === "mobile";
      if (event.key === "Escape" && isVisibleInstance) onClose();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [instance, onClose]);

  const goBack = () => {
    setError("");
    if (step === "profile") setStep("otp");
    else if (step === "otp") setStep("phone");
    else onClose();
  };

  const submitPhone = (event: FormEvent) => {
    event.preventDefault();
    if (!/^[789]\d{9}$/.test(phone)) {
      setError("Enter a valid Nigerian mobile number.");
      return;
    }
    setError("");
    setStep("otp");
  };

  const submitOtp = (event: FormEvent) => {
    event.preventDefault();
    if (otp !== DEMO_OTP) {
      setError(`Use ${DEMO_OTP} for this design preview.`);
      return;
    }
    setError("");
    setStep(mode === "register" ? "profile" : "complete");
  };

  const submitProfile = (event: FormEvent) => {
    event.preventDefault();
    if (firstName.trim().length < 2) {
      setError("Tell us your first name.");
      return;
    }
    setError("");
    setStep("complete");
  };

  return (
    <div className={styles.authWrap} role="dialog" aria-modal="true" aria-labelledby={`${instance}-auth-title`}>
      <div className={styles.mobileHandle} aria-hidden="true" />
      <div className={styles.authTopbar}>
        <button type="button" onClick={goBack} className={styles.iconButton} aria-label="Go back">
          <BackIcon size={19} />
        </button>
        <span className={styles.authWordmark}>funda.</span>
        <button type="button" onClick={onClose} className={styles.iconButton} aria-label="Close preview">
          <CloseIcon size={19} />
        </button>
      </div>

      <div className={styles.previewNotice}>
        <ShieldIcon size={15} />
        <span>Design preview · no SMS or account will be created</span>
      </div>

      <div className={styles.authBody}>
        {step === "phone" && (
          <form onSubmit={submitPhone} noValidate>
            <span className={styles.authEyebrow}>{mode === "register" ? "Join Funda" : "Welcome back"}</span>
            <h2 id={`${instance}-auth-title`}>{mode === "register" ? "Start with your number." : "Good to see you again."}</h2>
            <p>We&apos;ll use your Nigerian number to keep your account simple and secure.</p>
            <label className={styles.fieldLabel} htmlFor={`${instance}-${mode}-phone`}>Phone number</label>
            <div className={styles.phoneField} data-error={Boolean(error)}>
              <span>+234</span>
              <input
                id={`${instance}-${mode}-phone`}
                value={formatLocalPhone(phone)}
                onChange={(event) => setPhone(normalizeLocalPhone(event.target.value))}
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="801 234 5678"
                aria-describedby={error ? `${instance}-auth-error` : undefined}
                autoFocus
              />
            </div>
            {error && <p className={styles.fieldError} id={`${instance}-auth-error`} role="alert">{error}</p>}
            <button className={styles.authPrimary} type="submit">
              Continue <ArrowRightIcon size={18} />
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={submitOtp} noValidate>
            <span className={styles.authEyebrow}>One quick check</span>
            <h2 id={`${instance}-auth-title`}>Enter your code.</h2>
            <p>For this preview, use <strong>{DEMO_OTP}</strong>. No message has been sent.</p>
            <label className={styles.fieldLabel} htmlFor={`${instance}-${mode}-otp`}>Six-digit code</label>
            <input
              id={`${instance}-${mode}-otp`}
              className={styles.otpField}
              data-error={Boolean(error)}
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              aria-describedby={error ? `${instance}-auth-error` : undefined}
              autoFocus
            />
            {error && <p className={styles.fieldError} id={`${instance}-auth-error`} role="alert">{error}</p>}
            <button className={styles.authPrimary} type="submit">
              Verify code <ArrowRightIcon size={18} />
            </button>
            <button className={styles.authQuiet} type="button" onClick={() => setOtp(DEMO_OTP)}>
              Fill demo code
            </button>
          </form>
        )}

        {step === "profile" && (
          <form onSubmit={submitProfile} noValidate>
            <span className={styles.authEyebrow}>Nearly there</span>
            <h2 id={`${instance}-auth-title`}>What should we call you?</h2>
            <p>This is the only profile detail in the Funda registration preview.</p>
            <label className={styles.fieldLabel} htmlFor={`${instance}-first-name`}>First name</label>
            <input
              id={`${instance}-first-name`}
              className={styles.textField}
              data-error={Boolean(error)}
              value={firstName}
              onChange={(event) => setFirstName(event.target.value.slice(0, 40))}
              autoComplete="given-name"
              placeholder="Your first name"
              aria-describedby={error ? `${instance}-auth-error` : undefined}
              autoFocus
            />
            {error && <p className={styles.fieldError} id={`${instance}-auth-error`} role="alert">{error}</p>}
            <button className={styles.authPrimary} type="submit">
              Finish preview <ArrowRightIcon size={18} />
            </button>
          </form>
        )}

        {step === "complete" && (
          <div className={styles.completeState}>
            <span className={styles.completeIcon}><CheckIcon size={30} /></span>
            <span className={styles.authEyebrow}>Preview complete</span>
            <h2 id={`${instance}-auth-title`}>{mode === "register" ? `Looking good${firstName ? `, ${firstName.trim()}` : ""}.` : "You would be signed in."}</h2>
            <p>No account was created and no information was saved. Real phone authentication comes in the next phase.</p>
            <button className={styles.authPrimary} type="button" onClick={onClose}>
              Return to Funda <ArrowRightIcon size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FundaExperience({ stories }: FundaExperienceProps) {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [manualNavigation, setManualNavigation] = useState(false);
  const authMode: AuthPreviewMode | null = pathname === "/login"
    ? "login"
    : pathname === "/register"
      ? "register"
      : null;
  const touchStart = useRef<number | null>(null);
  const wheelLocked = useRef(false);
  const autoplayTimer = useRef<number | null>(null);
  const openedAuthHere = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.fundaReady = "true";
    return () => { delete document.documentElement.dataset.fundaReady; };
  }, []);

  const stopAutoplay = useCallback(() => {
    if (autoplayTimer.current !== null) {
      window.clearTimeout(autoplayTimer.current);
      autoplayTimer.current = null;
    }
  }, []);

  const moveTo = useCallback((nextIndex: number, manual = true) => {
    const boundedIndex = Math.max(0, Math.min(stories.length - 1, nextIndex));
    if (manual) {
      stopAutoplay();
      setManualNavigation(true);
    }
    setCurrentIndex(boundedIndex);
  }, [stopAutoplay, stories.length]);

  const moveBy = useCallback((delta: number) => {
    stopAutoplay();
    setManualNavigation(true);
    setCurrentIndex((current) => {
      const next = Math.max(0, Math.min(stories.length - 1, current + delta));
      return next;
    });
  }, [stopAutoplay, stories.length]);

  useEffect(() => {
    if (manualNavigation || reducedMotion || authMode || currentIndex >= stories.length - 1) return;
    autoplayTimer.current = window.setTimeout(() => {
      autoplayTimer.current = null;
      setCurrentIndex((index) => Math.min(index + 1, stories.length - 1));
    }, AUTOPLAY_DELAY);
    return stopAutoplay;
  }, [authMode, currentIndex, manualNavigation, reducedMotion, stopAutoplay, stories.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (authMode) return;
      if (["ArrowDown", "ArrowRight", "PageDown"].includes(event.key)) {
        event.preventDefault();
        moveBy(1);
      }
      if (["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key)) {
        event.preventDefault();
        moveBy(-1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [authMode, moveBy]);

  const onWheel = (event: React.WheelEvent) => {
    if (authMode || Math.abs(event.deltaY) < 28 || wheelLocked.current) return;
    wheelLocked.current = true;
    moveBy(event.deltaY > 0 ? 1 : -1);
    window.setTimeout(() => { wheelLocked.current = false; }, WHEEL_COOLDOWN);
  };

  const onTouchStart = (event: TouchEvent) => {
    if (!authMode) touchStart.current = event.touches[0]?.clientY ?? null;
  };

  const onTouchEnd = (event: TouchEvent) => {
    if (authMode || touchStart.current === null) return;
    const end = event.changedTouches[0]?.clientY ?? touchStart.current;
    const distance = touchStart.current - end;
    touchStart.current = null;
    if (Math.abs(distance) > 42) moveBy(distance > 0 ? 1 : -1);
  };

  const openAuth = (mode: AuthPreviewMode) => {
    stopAutoplay();
    setManualNavigation(true);
    openedAuthHere.current = true;
    window.history.pushState(null, "", mode === "login" ? "/login" : "/register");
  };

  const closeAuth = () => {
    if (openedAuthHere.current) {
      openedAuthHere.current = false;
      window.history.back();
      return;
    }

    window.history.pushState(null, "", "/");
  };

  const story = stories[currentIndex];

  return (
    <main
      className={styles.experience}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      data-auth-open={Boolean(authMode)}
    >
      <div className={styles.ambient} aria-hidden="true" />
      <section className={styles.storyPanel} aria-label="Funda introduction">
        <header className={styles.header}>
          <Link href="/" className={styles.wordmark} aria-label="Funda home">funda<span>.</span></Link>
          <button type="button" className={styles.desktopNavLogin} onClick={() => openAuth("register")}>
            Create account
          </button>
        </header>

        <div className={styles.storyContent} key={story.id}>
          <div className={styles.mobileStoryCard}>
            <div className={styles.copyBlock}>
              <h1>{story.headline}</h1>
              <p>{story.body}</p>
            </div>

            <div className={styles.progress} aria-label={`Story ${currentIndex + 1} of ${stories.length}`}>
              {stories.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  className={styles.progressTrack}
                  onClick={() => moveTo(index)}
                  aria-label={`Show story ${index + 1}: ${item.headline.replace("\n", " ")}`}
                  aria-current={index === currentIndex ? "step" : undefined}
                >
                  <span data-complete={index < currentIndex} data-active={index === currentIndex} />
                </button>
              ))}
            </div>

            <div className={styles.mobileActions}>
              <button type="button" className={styles.primaryCta} onClick={() => openAuth("login")}>
                Log in <ArrowRightIcon size={18} />
              </button>
              <button type="button" className={styles.loginCta} onClick={() => openAuth("register")}>
                Create account
              </button>
            </div>
          </div>

          <div className={styles.artworkColumn}>
            <StoryArtwork story={story} index={currentIndex} />
          </div>
        </div>
      </section>

      {authMode && (
        <aside
          className={styles.desktopRail}
          aria-label="Funda account access"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeAuth();
          }}
        >
          <div className={styles.desktopAuth}>
            <AuthPreview mode={authMode} onClose={closeAuth} instance="desktop" />
          </div>
        </aside>
      )}

      {authMode && <button className={styles.mobileBackdrop} type="button" onClick={closeAuth} aria-label="Close authentication preview" />}
      {authMode && <div className={styles.mobileAuth}><AuthPreview mode={authMode} onClose={closeAuth} instance="mobile" /></div>}
    </main>
  );
}
