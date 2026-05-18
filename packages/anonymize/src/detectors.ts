// Detectors: each returns a list of [match, replacement] for a given string.
// Ordered by specificity — more specific patterns run first.

export type RedactionCategory =
  | "secret"
  | "path"
  | "email"
  | "internal-host";

export interface DetectorMatch {
  category: RedactionCategory;
  pattern: RegExp;
  replace: (m: string) => string;
}

// Specific secret prefixes first (highest signal).
const SECRET_PATTERNS: DetectorMatch[] = [
  { category: "secret", pattern: /sk-ant-[A-Za-z0-9_\-]{20,}/g, replace: () => "<redacted:anthropic>" },
  { category: "secret", pattern: /sk-(?:proj-)?[A-Za-z0-9_\-]{20,}/g, replace: () => "<redacted:openai>" },
  { category: "secret", pattern: /gh[pous]_[A-Za-z0-9]{20,}/g, replace: () => "<redacted:github-token>" },
  { category: "secret", pattern: /github_pat_[A-Za-z0-9_]{20,}/g, replace: () => "<redacted:github-pat>" },
  { category: "secret", pattern: /whsec_[A-Za-z0-9]{20,}/g, replace: () => "<redacted:stripe-webhook>" },
  { category: "secret", pattern: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g, replace: () => "<redacted:stripe>" },
  { category: "secret", pattern: /AKIA[0-9A-Z]{16}/g, replace: () => "<redacted:aws-key-id>" },
  // JWT: 3 base64url segments separated by dots
  { category: "secret", pattern: /eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g, replace: () => "<redacted:jwt>" },
];

// Email
const EMAIL: DetectorMatch = {
  category: "email",
  pattern: /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g,
  replace: () => "<redacted:email>",
};

// Absolute home paths — /Users/<name>/... or /home/<name>/...
const HOME_PATH: DetectorMatch = {
  category: "path",
  pattern: /\/(?:Users|home)\/([A-Za-z0-9_\-.]+)/g,
  replace: () => "/Users/anon",
};

// Internal-looking hostnames: *.internal, *.local, *.lan, *.corp, *.intra
const INTERNAL_HOST: DetectorMatch = {
  category: "internal-host",
  pattern: /\bhttps?:\/\/[A-Za-z0-9_\-.]+\.(?:internal|local|lan|corp|intra)(?::\d+)?(?:\/[^\s"'`]*)?/g,
  replace: () => "<redacted:internal-host>",
};

export const DETECTORS: DetectorMatch[] = [
  ...SECRET_PATTERNS,
  EMAIL,
  HOME_PATH,
  INTERNAL_HOST,
];
