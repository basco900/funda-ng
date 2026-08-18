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
  MoonIcon,
  PoliciesShieldIcon,
  ServicesGridIcon,
  SunIcon,
} from "./icons";
import type {
  AuthPreviewMode,
  StoryDefinition,
} from "./stories";
import { ContentSheetView, type SheetType } from "./content-sheets";
import AuthPanel from "../auth/auth-panel";
import { useTheme } from "../../lib/theme";
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

function StoryArtwork({
  story,
  index,
  active,
}: {
  story: StoryDefinition;
  index: number;
  active: boolean;
}) {
  return (
    <div
      className={styles.artworkScene}
      data-visual={story.visual}
      data-active={active}
      aria-hidden={!active}
      hidden={!active}
    >
      <div className={styles.artworkImage}>
        <Image
          src={story.artwork}
          alt={story.artworkAlt}
          fill
          sizes="(max-width: 767px) 86vw, (max-width: 1180px) 36vw, 32vw"
          loading="eager"
          fetchPriority={index === 0 ? "high" : "auto"}
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
  const { resolved: resolvedTheme, setTheme, toggleTheme } = useTheme();
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
      if (event.key === "ArrowRight" || event.key === "PageDown") moveBy(1);
      if (event.key === "ArrowLeft" || event.key === "PageUp") moveBy(-1);
      if (event.key === "Home") moveTo(0);
      if (event.key === "End") moveTo(stories.length - 1);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [authMode, activeSheet, menuOpen, moveBy, moveTo, stories.length]);

  const onWheel = (event: React.WheelEvent) => {
    if (authMode || activeSheet || menuOpen || wheelLocked.current) return;
    if (Math.abs(event.deltaY) < 18) return;

    wheelLocked.current = true;
    moveBy(event.deltaY > 0 ? 1 : -1);

    window.setTimeout(() => {
      wheelLocked.current = false;
    }, WHEEL_COOLDOWN);
  };

  const onTouchStart = (event: TouchEvent) => {
    if (authMode || activeSheet || menuOpen) return;
    touchStart.current = event.touches[0].clientX;
  };

  const onTouchEnd = (event: TouchEvent) => {
    if (authMode || activeSheet || menuOpen || touchStart.current === null) return;
    const delta = event.changedTouches[0].clientX - touchStart.current;
    touchStart.current = null;
    if (Math.abs(delta) < 40) return;
    moveBy(delta < 0 ? 1 : -1);
  };

  const openAuth = (mode: AuthPreviewMode) => {
    openedAuthHere.current = true;
    setMenuOpen(false);
    window.history.pushState(null, "", `/${mode}`);
  };

  const closeAuth = () => {
    if (openedAuthHere.current) {
      window.history.back();
      openedAuthHere.current = false;
      return;
    }
    window.history.pushState(null, "", "/");
  };

  const navigateToSheet = (type: SheetType) => {
    setMenuOpen(false);
    window.history.pushState(null, "", `/${type}`);
  };

  const closeSheet = () => {
    window.history.pushState(null, "", "/");
  };

  const toggleMenu = () => {
    setMenuOpen((prev) => !prev);
  };

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
          
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.themeToggleButton}
              onClick={toggleTheme}
              aria-label={resolvedTheme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              title={resolvedTheme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            >
              {resolvedTheme === "light" ? <MoonIcon size={18} /> : <SunIcon size={18} />}
            </button>
            <button
              type="button"
              className={styles.menuToggleButton}
              onClick={toggleMenu}
              aria-label={menuOpen ? "Close menu" : "Open sidebar menu"}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <CloseIcon size={20} /> : <AppMenuToggleIcon size={20} />}
            </button>
          </div>
        </header>

        <div className={styles.storyContent}>
          <div className={styles.mobileStoryCard}>
            <div className={styles.copyStage}>
              {stories.map((item, index) => (
                <div
                  key={item.id}
                  className={styles.copyBlock}
                  data-active={index === currentIndex}
                  aria-hidden={index !== currentIndex}
                  hidden={index !== currentIndex}
                >
                  <h1>
                    {item.headline.split("\n")[0]}
                    {item.headline.includes("\n") && (
                      <>
                        <br />
                        <span className={styles.gradientHighlight}>
                          {item.headline.split("\n")[1]}
                        </span>
                      </>
                    )}
                  </h1>
                  <p>{item.body}</p>
                </div>
              ))}
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
            {stories.map((item, index) => (
              <StoryArtwork
                key={item.id}
                story={item}
                index={index}
                active={index === currentIndex}
              />
            ))}
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

          <div className={styles.drawerThemeSection}>
            <span className={styles.drawerSectionTag}>Appearance</span>
            <div className={styles.themeSegmentControl}>
              <button
                type="button"
                className={`${styles.themeSegmentBtn} ${resolvedTheme === "light" ? styles.themeSegmentActive : ""}`}
                onClick={() => setTheme("light")}
              >
                <SunIcon size={15} /> Light
              </button>
              <button
                type="button"
                className={`${styles.themeSegmentBtn} ${resolvedTheme === "dark" ? styles.themeSegmentActive : ""}`}
                onClick={() => setTheme("dark")}
              >
                <MoonIcon size={15} /> Dark
              </button>
            </div>
          </div>
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
