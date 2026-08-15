"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import {
  AboutInfoIcon,
  AppMenuToggleIcon,
  ArrowRightIcon,
  BackIcon,
  ChevronRightIcon,
  CloseIcon,
  ContactChatIcon,
  FaqHelpIcon,
  PoliciesShieldIcon,
  ServicesGridIcon,
} from "./icons";
import type {
  AuthPreviewMode,
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

function useParallaxTilt(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let rafId: number | null = null;

    const handleMove = (e: MouseEvent) => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        const { innerWidth, innerHeight } = window;
        const x = ((e.clientX / innerWidth - 0.5) * 2).toFixed(3);
        const y = ((e.clientY / innerHeight - 0.5) * 2).toFixed(3);
        document.documentElement.style.setProperty("--tilt-x", x);
        document.documentElement.style.setProperty("--tilt-y", y);
        rafId = null;
      });
    };

    window.addEventListener("mousemove", handleMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMove);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      document.documentElement.style.removeProperty("--tilt-x");
      document.documentElement.style.removeProperty("--tilt-y");
    };
  }, [enabled]);
}

function StoryArtwork({ story, index }: { story: StoryDefinition; index: number }) {
  return (
    <div
      className={styles.artworkScene}
      data-visual={story.visual}
      key={story.id}
    >
      <span className={styles.artGlow} aria-hidden="true" />
      <span className={styles.orbitOne} aria-hidden="true" />
      <span className={styles.orbitTwo} aria-hidden="true" />
      <div className={styles.artworkImage}>
        <Image
          src={story.artwork}
          alt={story.artworkAlt}
          fill
          sizes="(max-width: 767px) 86vw, (max-width: 1180px) 36vw, 32vw"
          priority={index === 0}
          loading={index === 0 ? "eager" : "lazy"}
        />
      </div>
    </div>
  );
}



function FloatingGlassDock({ onNavigate }: { onNavigate: (target: SheetType) => void }) {
  return (
    <footer className={styles.floatingDock} aria-label="Quick links and system status">
      <div className={styles.dockStatus}>
        <span className={styles.livePulseDot} aria-hidden="true" />
        <span>99.9% Uptime <span className={styles.statusPing}>· 12ms</span></span>
      </div>

      <span className={styles.dockDivider} aria-hidden="true" />

      <div className={styles.dockNav}>
        <button type="button" className={styles.dockBtn} onClick={() => onNavigate("services")}>
          Services
        </button>
        <button type="button" className={styles.dockBtn} onClick={() => onNavigate("policies")}>
          Security
        </button>
        <button type="button" className={styles.dockBtn} onClick={() => onNavigate("contact")}>
          Support
        </button>
        <button type="button" className={styles.dockBtn} onClick={() => onNavigate("faq")}>
          FAQ
        </button>
      </div>

      <span className={styles.dockDivider} aria-hidden="true" />

      <div className={styles.dockLegal}>
        <span>© {new Date().getFullYear()} Funda</span>
      </div>
    </footer>
  );
}

export default function FundaExperience({ stories }: FundaExperienceProps) {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  useParallaxTilt(!reducedMotion);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

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
  const openedAuthHere = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.fundaReady = "true";
    return () => { delete document.documentElement.dataset.fundaReady; };
  }, []);

  const moveTo = useCallback((nextIndex: number) => {
    const boundedIndex = Math.max(0, Math.min(stories.length - 1, nextIndex));
    setCurrentIndex(boundedIndex);
  }, [stories.length]);

  const moveBy = useCallback((delta: number) => {
    setCurrentIndex((current) => {
      const next = (current + delta + stories.length) % stories.length;
      return next;
    });
  }, [stories.length]);

  // Clean 6s auto-advance timer (smooth fill is driven by CSS animation, 0 render overhead)
  useEffect(() => {
    if (reducedMotion || authMode || activeSheet || menuOpen || isPaused || stories.length < 2) return;

    const timer = window.setTimeout(() => {
      setCurrentIndex((idx) => (idx + 1) % stories.length);
    }, AUTOPLAY_DELAY);

    return () => window.clearTimeout(timer);
  }, [authMode, activeSheet, menuOpen, isPaused, reducedMotion, stories.length, currentIndex]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (authMode || activeSheet || menuOpen) return;
      if (["ArrowRight", "PageDown"].includes(event.key)) {
        event.preventDefault();
        moveBy(1);
      }
      if (["ArrowLeft", "PageUp"].includes(event.key)) {
        event.preventDefault();
        moveBy(-1);
      }
      if (["1", "2", "3", "4"].includes(event.key)) {
        const num = parseInt(event.key, 10) - 1;
        if (num < stories.length) moveTo(num);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [authMode, activeSheet, menuOpen, moveBy, moveTo, stories.length]);

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
    setIsPaused(true);
    setMenuOpen(false);
    openedAuthHere.current = true;
    window.history.pushState(null, "", mode === "login" ? "/login" : "/register");
  };

  const closeAuth = () => {
    setIsPaused(false);
    if (openedAuthHere.current) {
      openedAuthHere.current = false;
      window.history.back();
      return;
    }
    window.history.pushState(null, "", "/");
  };

  const navigateToSheet = (target: SheetType) => {
    setIsPaused(true);
    setMenuOpen(false);
    window.history.pushState(null, "", `/${target}`);
  };

  const closeSheet = () => {
    setIsPaused(false);
    window.history.pushState(null, "", "/");
  };

  const toggleMenu = () => {
    setIsPaused((prev) => !prev);
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
      <section
        className={styles.storyPanel}
        data-paused={isPaused || Boolean(menuOpen) || Boolean(authMode) || Boolean(activeSheet)}
        aria-label="Funda introduction"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
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
              <h1>
                {story.headline.split("\n")[0]}
                {story.headline.includes("\n") && (
                  <>
                    <br />
                    <span className={styles.gradientHighlight}>
                      {story.headline.split("\n")[1]}
                    </span>
                  </>
                )}
              </h1>
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
                  <span
                    key={index === currentIndex ? `active-${currentIndex}` : `idle-${index}`}
                    data-complete={index < currentIndex}
                    data-active={index === currentIndex}
                  />
                </button>
              ))}

              <div className={styles.slideControls} aria-label="Slide navigation">
                <button
                  type="button"
                  className={styles.slideArrowBtn}
                  onClick={() => moveBy(-1)}
                  aria-label="Previous slide"
                  title="Previous slide (Left Arrow)"
                >
                  ←
                </button>
                <button
                  type="button"
                  className={styles.slideArrowBtn}
                  onClick={() => moveBy(1)}
                  aria-label="Next slide"
                  title="Next slide (Right Arrow)"
                >
                  →
                </button>
              </div>
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

        {/* Sleek Grounded Floating Glass Dock */}
        <FloatingGlassDock onNavigate={navigateToSheet} />
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
            <button type="button" className={styles.menuItem} data-category="about" onClick={() => navigateToSheet("about")}>
              <div className={styles.menuItemLeft}>
                <span className={styles.menuIconBox}><AboutInfoIcon size={19} /></span>
                <div className={styles.menuTextGroup}>
                  <span className={styles.menuTitle}>About Funda</span>
                  <span className={styles.menuDesc}>Our story, mission & tech</span>
                </div>
              </div>
              <ChevronRightIcon size={16} className={styles.menuChevron} />
            </button>

            <button type="button" className={styles.menuItem} data-category="services" onClick={() => navigateToSheet("services")}>
              <div className={styles.menuItemLeft}>
                <span className={styles.menuIconBox}><ServicesGridIcon size={19} /></span>
                <div className={styles.menuTextGroup}>
                  <span className={styles.menuTitle}>Services</span>
                  <span className={styles.menuDesc}>Data, airtime & electricity</span>
                </div>
              </div>
              <ChevronRightIcon size={16} className={styles.menuChevron} />
            </button>

            <button type="button" className={styles.menuItem} data-category="contact" onClick={() => navigateToSheet("contact")}>
              <div className={styles.menuItemLeft}>
                <span className={styles.menuIconBox}><ContactChatIcon size={19} /></span>
                <div className={styles.menuTextGroup}>
                  <span className={styles.menuTitle}>Contact & Support</span>
                  <span className={styles.menuDesc}>WhatsApp & 24/7 help line</span>
                </div>
              </div>
              <ChevronRightIcon size={16} className={styles.menuChevron} />
            </button>

            <button type="button" className={styles.menuItem} data-category="policies" onClick={() => navigateToSheet("policies")}>
              <div className={styles.menuItemLeft}>
                <span className={styles.menuIconBox}><PoliciesShieldIcon size={19} /></span>
                <div className={styles.menuTextGroup}>
                  <span className={styles.menuTitle}>Policies & Security</span>
                  <span className={styles.menuDesc}>Privacy, terms & refund policy</span>
                </div>
              </div>
              <ChevronRightIcon size={16} className={styles.menuChevron} />
            </button>

            <button type="button" className={styles.menuItem} data-category="faq" onClick={() => navigateToSheet("faq")}>
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
