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
  AboutInfoIcon,
  AppMenuToggleIcon,
  ArrowRightIcon,
  BackIcon,
  BoltIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  ContactChatIcon,
  FaqHelpIcon,
  LockIcon,
  PoliciesShieldIcon,
  ServicesGridIcon,
  ShieldIcon,
  SignalIcon,
} from "./icons";
import type {
  AuthPreviewMode,
  AuthPreviewStep,
  StoryDefinition,
} from "./stories";
import { ContentSheetView, type SheetType } from "./content-sheets";
import AuthPanel from "../auth/auth-panel";
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

function getIdentifierType(value: string): "email" | "phone" | null {
  const clean = value.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) return "email";
  const digits = clean.replace(/\D/g, "");
  if (/^(?:234|0)?[789]\d{9}$/.test(digits)) return "phone";
  return null;
}

function AuthPreview({ mode, onClose, instance }: { mode: AuthPreviewMode; onClose: () => void; instance: "desktop" | "mobile" }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<AuthPreviewStep>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [identifierType, setIdentifierType] = useState<"email" | "phone" | null>(null);
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

  useEffect(() => {
    if (instance !== "mobile" || !window.matchMedia("(max-width: 959px)").matches) return;

    const keepKeyboardClosed = window.requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
        activeElement.blur();
      }
      dialogRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(keepKeyboardClosed);
  }, [instance, mode]);

  const goBack = () => {
    setError("");
    if (step === "profile") setStep("otp");
    else if (step === "otp") setStep("identifier");
    else onClose();
  };

  const submitIdentifier = (event: FormEvent) => {
    event.preventDefault();
    const detectedType = getIdentifierType(identifier);
    if (!detectedType) {
      setError("That doesn’t look quite right. Try an email or Nigerian phone number.");
      return;
    }
    setError("");
    setIdentifierType(detectedType);
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
    <div
      ref={dialogRef}
      className={styles.authWrap}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${instance}-auth-title`}
      tabIndex={-1}
    >
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
        <span>Your details stay private and protected.</span>
      </div>

      <div className={styles.authBody}>
        {step === "identifier" && (
          <form onSubmit={submitIdentifier} noValidate>
            <span className={styles.authEyebrow}>{mode === "register" ? "Join Funda" : "Welcome back"}</span>
            <h2 id={`${instance}-auth-title`}>{mode === "register" ? "Let’s get you in." : "Good to see you again."}</h2>
            <p>Email or phone—whichever you actually remember.</p>
            <label className={styles.fieldLabel} htmlFor={`${instance}-${mode}-identifier`}>Email or phone number</label>
            <input
              id={`${instance}-${mode}-identifier`}
              className={styles.textField}
              data-error={Boolean(error)}
              value={identifier}
              onChange={(event) => { setIdentifier(event.target.value.slice(0, 80)); setError(""); }}
              inputMode="text"
              autoComplete="off"
              enterKeyHint="next"
              placeholder="you@email.com or 0801 234 5678"
              aria-describedby={error ? `${instance}-auth-error` : undefined}
            />
            {error && <p className={styles.fieldError} id={`${instance}-auth-error`} role="alert">{error}</p>}
            <button className={styles.authPrimary} type="submit">
              Continue <ArrowRightIcon size={18} />
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={submitOtp} noValidate>
            <span className={styles.authEyebrow}>One quick check</span>
            <h2 id={`${instance}-auth-title`}>Quick code, then you’re in.</h2>
            <p>We&apos;d send it to your {identifierType === "email" ? "email" : "phone"}. For now, use <strong>{DEMO_OTP}</strong>.</p>
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
            <p>That&apos;s the whole thing. Nothing was saved—this is still just the preview.</p>
            <button className={styles.authPrimary} type="button" onClick={onClose}>
              Return to Funda <ArrowRightIcon size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MinimalBottomBar({ onNavigate }: { onNavigate: (target: SheetType) => void }) {
  return (
    <footer className={styles.minimalFooter} aria-label="Quick links and system status">
      <div className={styles.minimalStatus}>
        <span className={styles.minimalPulseDot} aria-hidden="true" />
        <span>Instant Delivery • 99.9% Uptime</span>
      </div>

      <span className={styles.minimalGroupSep} aria-hidden="true">•</span>

      <div className={styles.minimalNav}>
        <button type="button" onClick={() => onNavigate("services")}>Services</button>
        <span className={styles.minimalSep}>/</span>
        <button type="button" onClick={() => onNavigate("policies")}>Security</button>
        <span className={styles.minimalSep}>/</span>
        <button type="button" onClick={() => onNavigate("contact")}>Support</button>
        <span className={styles.minimalSep}>/</span>
        <button type="button" onClick={() => onNavigate("faq")}>FAQ</button>
      </div>

      <span className={styles.minimalGroupSep} aria-hidden="true">•</span>

      <div className={styles.minimalLegal}>
        <span>© {new Date().getFullYear()} Funda</span>
      </div>
    </footer>
  );
}

export default function FundaExperience({ stories }: FundaExperienceProps) {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const authMode: AuthPreviewMode | null = pathname === "/login"
    ? "login"
    : pathname === "/register"
      ? "register"
      : null;

  const activeSheet: SheetType | null =
    pathname === "/about" ? "about"
    : pathname === "/services" ? "services"
    : pathname === "/contact" ? "contact"
    : pathname === "/policies" ? "policies"
    : pathname === "/privacy" ? "privacy"
    : pathname === "/terms" ? "terms"
    : pathname === "/refunds" ? "refunds"
    : pathname === "/faq" ? "faq"
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

  const moveTo = useCallback((nextIndex: number) => {
    const boundedIndex = Math.max(0, Math.min(stories.length - 1, nextIndex));
    stopAutoplay();
    setCurrentIndex(boundedIndex);
  }, [stopAutoplay, stories.length]);

  const moveBy = useCallback((delta: number) => {
    stopAutoplay();
    setCurrentIndex((current) => {
      const next = Math.max(0, Math.min(stories.length - 1, current + delta));
      return next;
    });
  }, [stopAutoplay, stories.length]);

  useEffect(() => {
    if (reducedMotion || authMode || activeSheet || menuOpen || stories.length < 2) return;
    autoplayTimer.current = window.setTimeout(() => {
      autoplayTimer.current = null;
      setCurrentIndex((index) => (index + 1) % stories.length);
    }, AUTOPLAY_DELAY);
    return stopAutoplay;
  }, [authMode, activeSheet, menuOpen, currentIndex, reducedMotion, stopAutoplay, stories.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (authMode || activeSheet || menuOpen) return;
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
  }, [authMode, activeSheet, menuOpen, moveBy]);

  const onWheel = (event: React.WheelEvent) => {
    if (authMode || activeSheet || menuOpen || Math.abs(event.deltaY) < 28 || wheelLocked.current) return;
    wheelLocked.current = true;
    moveBy(event.deltaY > 0 ? 1 : -1);
    window.setTimeout(() => { wheelLocked.current = false; }, WHEEL_COOLDOWN);
  };

  const onTouchStart = (event: TouchEvent) => {
    if (!authMode && !activeSheet && !menuOpen) touchStart.current = event.touches[0]?.clientY ?? null;
  };

  const onTouchEnd = (event: TouchEvent) => {
    if (authMode || activeSheet || menuOpen || touchStart.current === null) return;
    const end = event.changedTouches[0]?.clientY ?? touchStart.current;
    const distance = touchStart.current - end;
    touchStart.current = null;
    if (Math.abs(distance) > 42) moveBy(distance > 0 ? 1 : -1);
  };

  const openAuth = (mode: AuthPreviewMode) => {
    stopAutoplay();
    setMenuOpen(false);
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

  const navigateToSheet = (target: SheetType) => {
    stopAutoplay();
    setMenuOpen(false);
    window.history.pushState(null, "", `/${target}`);
  };

  const closeSheet = () => {
    window.history.pushState(null, "", "/");
  };

  const toggleMenu = () => {
    stopAutoplay();
    setMenuOpen((prev) => !prev);
  };

  const story = stories[currentIndex];

  const getSheetTitle = (type: SheetType) => {
    switch (type) {
      case "about": return "About Funda";
      case "services": return "Services & Products";
      case "contact": return "Contact & Support";
      case "policies":
      case "privacy":
      case "terms":
      case "refunds": return "Policies & Security";
      case "faq": return "Help & FAQ";
      default: return "Funda";
    }
  };

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
          <Link href="/" className={styles.wordmark} aria-label="Funda home" onClick={() => { setMenuOpen(false); closeSheet(); }}>
            funda<span>.</span>
          </Link>
          
          {/* iOS-Style Sleek Menu Toggle Button Top Right */}
          <button
            type="button"
            className={styles.menuToggleButton}
            onClick={toggleMenu}
            aria-label={menuOpen ? "Close menu" : "Open sidebar menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <CloseIcon size={20} /> : <AppMenuToggleIcon size={20} />}
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

        {/* Sleek Grounded Bottom Footer Bar */}
        <MinimalBottomBar onNavigate={navigateToSheet} />
      </section>

      {/* ---------------------------------------------------- */}
      {/* SIDEBAR MENU DRAWER */}
      {/* ---------------------------------------------------- */}
      {menuOpen && (
        <button
          type="button"
          className={styles.drawerBackdrop}
          onClick={() => setMenuOpen(false)}
          aria-label="Close menu backdrop"
        />
      )}

      <aside className={`${styles.sidebarDrawer} ${menuOpen ? styles.sidebarDrawerOpen : ""}`} aria-label="Main menu">
        <div className={styles.drawerHeader}>
          <span className={styles.drawerWordmark}>funda<span>.</span></span>
          <button type="button" className={styles.drawerCloseBtn} onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className={styles.drawerBody}>
          <span className={styles.drawerSectionTag}>Navigation</span>

          <nav className={styles.menuList}>
            <button type="button" className={styles.menuItem} onClick={() => navigateToSheet("about")}>
              <div className={styles.menuItemLeft}>
                <span className={styles.menuIconBox}><AboutInfoIcon size={19} /></span>
                <div className={styles.menuTextGroup}>
                  <span className={styles.menuTitle}>About Funda</span>
                  <span className={styles.menuDesc}>Our story, mission & tech</span>
                </div>
              </div>
              <ChevronRightIcon size={16} className={styles.menuChevron} />
            </button>

            <button type="button" className={styles.menuItem} onClick={() => navigateToSheet("services")}>
              <div className={styles.menuItemLeft}>
                <span className={styles.menuIconBox}><ServicesGridIcon size={19} /></span>
                <div className={styles.menuTextGroup}>
                  <span className={styles.menuTitle}>Services</span>
                  <span className={styles.menuDesc}>Data, airtime & electricity</span>
                </div>
              </div>
              <ChevronRightIcon size={16} className={styles.menuChevron} />
            </button>

            <button type="button" className={styles.menuItem} onClick={() => navigateToSheet("contact")}>
              <div className={styles.menuItemLeft}>
                <span className={styles.menuIconBox}><ContactChatIcon size={19} /></span>
                <div className={styles.menuTextGroup}>
                  <span className={styles.menuTitle}>Contact & Support</span>
                  <span className={styles.menuDesc}>WhatsApp & 24/7 help line</span>
                </div>
              </div>
              <ChevronRightIcon size={16} className={styles.menuChevron} />
            </button>

            <button type="button" className={styles.menuItem} onClick={() => navigateToSheet("policies")}>
              <div className={styles.menuItemLeft}>
                <span className={styles.menuIconBox}><PoliciesShieldIcon size={19} /></span>
                <div className={styles.menuTextGroup}>
                  <span className={styles.menuTitle}>Policies & Security</span>
                  <span className={styles.menuDesc}>Privacy, terms & refund policy</span>
                </div>
              </div>
              <ChevronRightIcon size={16} className={styles.menuChevron} />
            </button>

            <button type="button" className={styles.menuItem} onClick={() => navigateToSheet("faq")}>
              <div className={styles.menuItemLeft}>
                <span className={styles.menuIconBox}><FaqHelpIcon size={19} /></span>
                <div className={styles.menuTextGroup}>
                  <span className={styles.menuTitle}>FAQ</span>
                  <span className={styles.menuDesc}>Answers to common questions</span>
                </div>
              </div>
              <ChevronRightIcon size={16} className={styles.menuChevron} />
            </button>
          </nav>
        </div>

        <div className={styles.drawerFooter}>
          <button type="button" className={styles.drawerLoginBtn} onClick={() => openAuth("login")}>
            Log in
          </button>
          <button type="button" className={styles.drawerRegisterBtn} onClick={() => openAuth("register")}>
            Create account <ArrowRightIcon size={16} />
          </button>
        </div>
      </aside>

      {/* ---------------------------------------------------- */}
      {/* NATIVE MOBILE APP POPUP CONTENT SHEET MODAL */}
      {/* ---------------------------------------------------- */}
      {activeSheet && (
        <>
          <button
            type="button"
            className={styles.sheetBackdrop}
            onClick={closeSheet}
            aria-label="Close sheet backdrop"
          />
          <div className={styles.sheetModalWrap} role="dialog" aria-modal="true" aria-label={getSheetTitle(activeSheet)}>
            {/* iOS Mobile Top Drag Handle */}
            <div className={styles.sheetDragHandle} aria-hidden="true" />

            <div className={styles.sheetHeader}>
              <button type="button" className={styles.sheetHeaderBackBtn} onClick={closeSheet} aria-label="Go back">
                <BackIcon size={18} />
              </button>
              <span className={styles.sheetHeaderTitle}>{getSheetTitle(activeSheet)}</span>
              <button type="button" className={styles.sheetHeaderCloseBtn} onClick={closeSheet} aria-label="Close sheet">
                <CloseIcon size={18} />
              </button>
            </div>

            {/* INTERNAL SCROLL CONTAINER - Scrolling happens inside popup */}
            <div className={styles.sheetScrollContent}>
              <ContentSheetView
                type={activeSheet}
                onNavigate={navigateToSheet}
                onOpenAuth={openAuth}
              />
            </div>
          </div>
        </>
      )}

      {/* ---------------------------------------------------- */}
      {/* AUTH PREVIEW MODALS */}
      {/* ---------------------------------------------------- */}
      {authMode && (
        <aside
          className={styles.desktopRail}
          aria-label="Funda account access"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeAuth();
          }}
        >
          <div className={styles.desktopAuth}>
            <AuthPanel mode={authMode} onClose={closeAuth} instance="desktop" />
          </div>
        </aside>
      )}

      {authMode && <button className={styles.mobileBackdrop} type="button" onClick={closeAuth} aria-label="Close authentication preview" />}
      {authMode && <div className={styles.mobileAuth}><AuthPanel mode={authMode} onClose={closeAuth} instance="mobile" /></div>}
    </main>
  );
}
