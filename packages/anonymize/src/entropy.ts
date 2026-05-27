// Entropy guard: scan strings AFTER named detectors run for tokens that
// look like opaque credentials we don't have a pattern for.
//
// We compute Shannon entropy over a candidate token's character set. Real
// English words / phrases cluster around 3.0-4.0 bits per char; random
// API keys, base64 nonces, and AWS-style identifiers usually exceed 4.5.
//
// To minimize false positives we only flag tokens that:
//   * are length 24+
//   * are made up of `[A-Za-z0-9_\-+/=]` (i.e. look like a token, not prose)
//   * mix at least two character classes (letters + digits, or letters +
//     symbols) — pure-letter or pure-digit strings are almost never creds
//   * have Shannon entropy > 4.0 bits/char
//
// Output is a list of `{ token, entropy, context }` suspects so the CLI
// preview can highlight them and the server can decide to block upload.

export interface EntropySuspect {
  token: string;
  entropy: number;
  /** Approximate location: the kind of event or json path that contained it. */
  location: string;
}

// We intentionally do NOT include `/` in the token character class. Path-like
// strings (e.g. `/Users/anon/Documents/long-hyphenated-name/file`) otherwise
// get matched as one giant high-entropy token. Real credentials almost never
// contain internal slashes — the rare ones that do (PEM blocks, base64
// service-account JSON) are already covered by named detectors that run first.
const TOKEN_RE = /[A-Za-z0-9_\-+=]{24,}/g;
const MIN_ENTROPY = 4.0;

function shannon(s: string): number {
  if (s.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function classMix(s: string): boolean {
  let hasLower = false;
  let hasUpper = false;
  let hasDigit = false;
  let hasSym = false;
  for (const ch of s) {
    if (ch >= "a" && ch <= "z") hasLower = true;
    else if (ch >= "A" && ch <= "Z") hasUpper = true;
    else if (ch >= "0" && ch <= "9") hasDigit = true;
    else hasSym = true;
  }
  const classes = (hasLower ? 1 : 0) + (hasUpper ? 1 : 0) + (hasDigit ? 1 : 0) + (hasSym ? 1 : 0);
  return classes >= 2;
}

/** Returns suspects found inside one string. */
export function scanString(s: string, location: string): EntropySuspect[] {
  // Already-redacted markers should never be flagged.
  if (!s || s.includes("<redacted:")) {
    // Strip the redaction markers before scanning the rest of the string —
    // a long line may contain both a redaction and a leftover token.
    s = s.replace(/<redacted:[a-z\-]+>/g, " ");
  }
  const out: EntropySuspect[] = [];
  for (const m of s.matchAll(TOKEN_RE)) {
    const tok = m[0];
    if (!classMix(tok)) continue;
    const h = shannon(tok);
    if (h < MIN_ENTROPY) continue;
    out.push({ token: tok, entropy: Number(h.toFixed(2)), location });
  }
  return out;
}

/** Walk an arbitrary JSON value and collect suspects from every string. */
export function scanValue(v: unknown, path: string = "$"): EntropySuspect[] {
  if (typeof v === "string") return scanString(v, path);
  if (Array.isArray(v)) {
    return v.flatMap((x, i) => scanValue(x, `${path}[${i}]`));
  }
  if (v && typeof v === "object") {
    return Object.entries(v as Record<string, unknown>).flatMap(([k, val]) =>
      scanValue(val, `${path}.${k}`),
    );
  }
  return [];
}
