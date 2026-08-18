"use client";

import { useSyncExternalStore } from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem("funda-theme") as ThemePreference | null;
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {}
  return "light";
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === "system") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref;
}

export function applyTheme(pref: ThemePreference) {
  if (typeof window === "undefined") return;
  const resolved = resolveTheme(pref);
  document.documentElement.setAttribute("data-theme", resolved);
  try {
    localStorage.setItem("funda-theme", pref);
  } catch {}
  window.dispatchEvent(new CustomEvent("funda-theme-change", { detail: { preference: pref, resolved } }));
}

function subscribeToTheme(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  const handleThemeChange = () => onStoreChange();
  const handleMediaChange = () => {
    const preference = getStoredTheme();
    if (preference === "system") {
      document.documentElement.setAttribute("data-theme", resolveTheme(preference));
      onStoreChange();
    }
  };

  window.addEventListener("funda-theme-change", handleThemeChange);
  mediaQuery.addEventListener("change", handleMediaChange);

  return () => {
    window.removeEventListener("funda-theme-change", handleThemeChange);
    mediaQuery.removeEventListener("change", handleMediaChange);
  };
}

function getThemeSnapshot() {
  const preference = getStoredTheme();
  return `${preference}:${resolveTheme(preference)}`;
}

function getServerThemeSnapshot() {
  return "light:light";
}

function subscribeToHydration() {
  return () => {};
}

export function useTheme() {
  const snapshot = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const mounted = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [preferenceValue, resolvedValue] = snapshot.split(":") as [ThemePreference, ResolvedTheme];
  const preference = preferenceValue ?? "light";
  const resolved = resolvedValue ?? "light";

  const setTheme = (nextPref: ThemePreference) => {
    applyTheme(nextPref);
  };

  const toggleTheme = () => {
    const next = resolved === "light" ? "dark" : "light";
    setTheme(next);
  };

  return {
    theme: preference,
    preference,
    resolved,
    mounted,
    setTheme,
    toggleTheme,
  };
}
