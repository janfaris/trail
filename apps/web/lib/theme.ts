export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_COOKIE = "trail-theme";
export const THEME_EVENT = "trail-themechange";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function isThemePref(value: unknown): value is ThemePref {
  return value === "light" || value === "dark" || value === "system";
}

function readCookiePref(): ThemePref | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)trail-theme=(light|dark|system)/);
  const value = match?.[1];
  return isThemePref(value) ? value : null;
}

export function readThemePref(): ThemePref {
  const cookiePref = readCookiePref();
  if (cookiePref) return cookiePref;
  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(THEME_COOKIE);
      if (isThemePref(stored)) return stored;
    }
  } catch {
    /* localStorage may be unavailable (private mode, blocked cookies) */
  }
  return "dark";
}

export function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  return pref === "system" ? systemTheme() : pref;
}

export function applyTheme(pref: ThemePref): ResolvedTheme {
  const resolved = resolveTheme(pref);
  if (typeof document !== "undefined") {
    const el = document.documentElement;
    el.classList.toggle("light", resolved === "light");
    el.classList.toggle("dark", resolved === "dark");
    el.style.colorScheme = resolved;
  }
  return resolved;
}

export function setThemePref(pref: ThemePref): ResolvedTheme {
  if (typeof document !== "undefined") {
    document.cookie = `${THEME_COOKIE}=${pref};path=/;max-age=${ONE_YEAR_SECONDS};samesite=lax`;
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(THEME_COOKIE, pref);
    }
  } catch {
    /* ignore persistence failures */
  }
  const resolved = applyTheme(pref);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: pref }));
  }
  return resolved;
}
