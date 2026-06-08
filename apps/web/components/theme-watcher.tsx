"use client";

import { THEME_EVENT, applyTheme, readThemePref } from "@/lib/theme";
import { useEffect } from "react";

/**
 * Keeps the resolved theme in sync with live changes:
 * - OS scheme changes (only when the user picked "system")
 * - cross-tab updates (storage event)
 * - in-app updates from the appearance control (custom event)
 * Renders nothing.
 */
export function ThemeWatcher() {
  useEffect(() => {
    applyTheme(readThemePref());

    const onStorage = (e: StorageEvent) => {
      if (e.key === "trail-theme") applyTheme(readThemePref());
    };
    const onThemeChange = () => applyTheme(readThemePref());
    window.addEventListener("storage", onStorage);
    window.addEventListener(THEME_EVENT, onThemeChange);

    const supportsMql = typeof window.matchMedia === "function";
    const mql = supportsMql ? window.matchMedia("(prefers-color-scheme: light)") : null;
    const onSystemChange = () => {
      if (readThemePref() === "system") applyTheme("system");
    };
    mql?.addEventListener?.("change", onSystemChange);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(THEME_EVENT, onThemeChange);
      mql?.removeEventListener?.("change", onSystemChange);
    };
  }, []);

  return null;
}
