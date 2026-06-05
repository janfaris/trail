// Shared handle normalization + validation for builder identities.
//
// Used by the better-auth signup hook (to derive a safe initial handle) and the
// /welcome onboarding action (to let a user claim their public handle). Keeping
// one source of truth avoids the two paths disagreeing on what a valid handle
// is, which would otherwise produce broken /u/<handle> routes.

// Route segments and asset names that must never become a public /u/<handle>.
export const RESERVED_HANDLES = new Set<string>([
  "api",
  "admin",
  "feed",
  "create",
  "settings",
  "dashboard",
  "notifications",
  "saved",
  "cli-auth",
  "welcome",
  "discover",
  "pricing",
  "learn",
  "tools",
  "frameworks",
  "install",
  "radar",
  "search",
  "r",
  "u",
  "p",
  "embed",
  "robots.txt",
  "sitemap.xml",
  "opengraph-image",
  "favicon.ico",
  "_next",
  "trail",
  "about",
  "terms",
  "privacy",
  "support",
  "help",
  "login",
  "logout",
  "signin",
  "signup",
]);

// 2–30 chars, lowercase alphanumeric, internal hyphens allowed, must start and
// end with an alphanumeric (no leading/trailing hyphen).
const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/;

export const HANDLE_MIN = 2;
export const HANDLE_MAX = 30;

/** Lowercase + strip to the handle alphabet. Does not validate length/shape. */
export function normalizeHandle(input: string | null | undefined): string {
  return (input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, HANDLE_MAX);
}

export type HandleValidation = { ok: true; handle: string } | { ok: false; error: string };

/** Validate a user-supplied handle, returning the normalized value or an error. */
export function validateHandle(input: string | null | undefined): HandleValidation {
  const handle = normalizeHandle(input);
  if (handle.length < HANDLE_MIN) {
    return {
      ok: false,
      error: "Handle must be at least 2 characters (letters, numbers, hyphens).",
    };
  }
  if (!HANDLE_RE.test(handle)) {
    return {
      ok: false,
      error: "Use 2–30 lowercase letters, numbers, or hyphens (no leading or trailing hyphen).",
    };
  }
  if (RESERVED_HANDLES.has(handle)) {
    return { ok: false, error: "That handle is reserved. Pick another." };
  }
  return { ok: true, handle };
}

/**
 * Derive a safe initial handle from a GitHub login (or email/id fallback) for
 * the signup hook. Always returns a normalized, non-reserved candidate; the
 * caller is responsible for resolving uniqueness (e.g. appending a suffix).
 */
export function deriveInitialHandle(
  login: string | null | undefined,
  email: string | null | undefined,
  userId: string,
): string {
  const fromLogin = normalizeHandle(login);
  if (fromLogin.length >= HANDLE_MIN && !RESERVED_HANDLES.has(fromLogin)) return fromLogin;
  const fromEmail = normalizeHandle(email?.split("@")[0]);
  if (fromEmail.length >= HANDLE_MIN && !RESERVED_HANDLES.has(fromEmail)) return fromEmail;
  return `builder-${userId
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 8)
    .toLowerCase()}`;
}
