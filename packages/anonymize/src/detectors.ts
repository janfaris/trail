// Detectors: each scrubs strings for known credential / PII shapes.
// Ordered by specificity — more specific patterns run first so that a
// generic KEY=VALUE detector doesn't double-tag a value already caught
// by its provider-specific pattern.
//
// IMPORTANT: every pattern uses the /g flag so .replace() iterates all
// occurrences. Don't add a non-global one without rewriting scrubString.

export type RedactionCategory =
  | "secret"
  | "credential-url"
  | "path"
  | "email"
  | "internal-host";

export interface DetectorMatch {
  category: RedactionCategory;
  pattern: RegExp;
  // `replace` may return either a static string or a function of the match
  // groups (e.g. for postgres URLs we want to keep the host but mask creds).
  replace: (m: string, ...groups: string[]) => string;
}

// ──────────────────────────────────────────────────────────────────────────
// Provider-specific secret prefixes (highest signal — run first).
// Pattern guide:
//   * Use `\b` word boundaries when the prefix is short / ambiguous.
//   * Use non-greedy + reasonable minimum length to avoid scrubbing words.
//   * Length floors come from each provider's actual issued token lengths.
// ──────────────────────────────────────────────────────────────────────────
const SECRET_PATTERNS: DetectorMatch[] = [
  // LLM / agent provider keys
  { category: "secret", pattern: /sk-ant-[A-Za-z0-9_\-]{20,}/g, replace: () => "<redacted:anthropic>" },
  // OpenRouter MUST run before the generic OpenAI prefix or it'll be eaten.
  { category: "secret", pattern: /sk-or-v1-[A-Za-z0-9]{20,}/g, replace: () => "<redacted:openrouter>" },
  { category: "secret", pattern: /sk-(?:proj-)?[A-Za-z0-9_\-]{20,}/g, replace: () => "<redacted:openai>" },
  { category: "secret", pattern: /AIza[0-9A-Za-z_\-]{35}/g, replace: () => "<redacted:google>" },
  { category: "secret", pattern: /hf_[A-Za-z0-9]{30,}/g, replace: () => "<redacted:huggingface>" },
  { category: "secret", pattern: /r8_[A-Za-z0-9]{30,}/g, replace: () => "<redacted:replicate>" },
  { category: "secret", pattern: /gsk_[A-Za-z0-9]{40,}/g, replace: () => "<redacted:groq>" },
  { category: "secret", pattern: /pplx-[A-Za-z0-9]{40,}/g, replace: () => "<redacted:perplexity>" },
  { category: "secret", pattern: /xai-[A-Za-z0-9]{40,}/g, replace: () => "<redacted:xai>" },
  { category: "secret", pattern: /tgp_v[12]_[A-Za-z0-9_\-]{30,}/g, replace: () => "<redacted:together>" },
  { category: "secret", pattern: /fw_[A-Za-z0-9]{30,}/g, replace: () => "<redacted:fireworks>" },
  { category: "secret", pattern: /ds-[A-Za-z0-9]{30,}/g, replace: () => "<redacted:deepseek>" },

  // Source control / CI
  { category: "secret", pattern: /gh[pous]_[A-Za-z0-9]{20,}/g, replace: () => "<redacted:github-token>" },
  { category: "secret", pattern: /github_pat_[A-Za-z0-9_]{20,}/g, replace: () => "<redacted:github-pat>" },
  { category: "secret", pattern: /glpat-[A-Za-z0-9_\-]{20,}/g, replace: () => "<redacted:gitlab-pat>" },

  // Vercel — `dpl_*` deployment IDs are public, not credentials, but they're
  // high-entropy enough to trip the entropy guard if left untouched. Mask
  // them so they stop generating suspects in real coding-agent sessions.
  { category: "internal-host", pattern: /\bdpl_[A-Za-z0-9]{24,}\b/g, replace: () => "<redacted:vercel-deployment-id>" },

  // Payments / billing
  { category: "secret", pattern: /whsec_[A-Za-z0-9]{20,}/g, replace: () => "<redacted:stripe-webhook>" },
  { category: "secret", pattern: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g, replace: () => "<redacted:stripe>" },

  // Cloud
  { category: "secret", pattern: /AKIA[0-9A-Z]{16}/g, replace: () => "<redacted:aws-key-id>" },
  // GCP service-account private key JSON snippets — match the `private_key` line.
  { category: "secret", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g, replace: () => "<redacted:private-key>" },

  // Comms / SaaS
  { category: "secret", pattern: /xox[abpsr]-[A-Za-z0-9\-]{10,}/g, replace: () => "<redacted:slack>" },
  { category: "secret", pattern: /lin_(?:api|oauth)_[A-Za-z0-9]{30,}/g, replace: () => "<redacted:linear>" },
  { category: "secret", pattern: /SG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}/g, replace: () => "<redacted:sendgrid>" },
  { category: "secret", pattern: /\bkey-[a-f0-9]{32}\b/g, replace: () => "<redacted:mailgun>" },
  { category: "secret", pattern: /AC[a-f0-9]{32}/g, replace: () => "<redacted:twilio-sid>" },
  { category: "secret", pattern: /\bSK[a-f0-9]{32}\b/g, replace: () => "<redacted:twilio-key>" },

  // Sentry DSN
  { category: "secret", pattern: /https:\/\/[a-f0-9]{32}@[A-Za-z0-9\-]+\.ingest\.sentry\.io\/\d+/g, replace: () => "<redacted:sentry-dsn>" },

  // JWT: 3 base64url segments separated by dots
  { category: "secret", pattern: /eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g, replace: () => "<redacted:jwt>" },
];

// ──────────────────────────────────────────────────────────────────────────
// Credential-bearing URLs — preserve scheme + host (useful context) but
// mask the userinfo portion. Examples:
//   postgres://user:pass@host:5432/db  →  postgres://<redacted:db-creds>@host:5432/db
//   mongodb+srv://u:p@cluster.mongo... →  mongodb+srv://<redacted:db-creds>@cluster.mongo...
//   redis://default:pwd@h:6379         →  redis://<redacted:db-creds>@h:6379
// ──────────────────────────────────────────────────────────────────────────
const CRED_URL: DetectorMatch = {
  category: "credential-url",
  pattern: /(\b(?:postgres(?:ql)?|mongodb(?:\+srv)?|redis(?:s)?|mysql|amqps?|smtps?|ssh):\/\/)([^:\s/@'"]+):([^@\s'"]+)@/g,
  replace: (_m, scheme: string) => `${scheme}<redacted:db-creds>@`,
};

// ──────────────────────────────────────────────────────────────────────────
// Generic ENV-style KEY = VALUE / KEY: VALUE / "KEY": "VALUE"
// Runs AFTER named secret detectors. Sensitive key-name heuristic; the
// value is replaced with <redacted:env-value> regardless of shape so we
// catch tokens that don't match any provider pattern (Vercel, custom apps,
// internal services, Azure OpenAI keys, etc.).
//
// We capture quote style + key name and rebuild the line so the structure
// stays human-readable in shared sessions.
// ──────────────────────────────────────────────────────────────────────────
// Sensitive key-name confirmation: used inside the ENV_KV replace callback
// to double-check the captured key actually looks like a credential name.
// Allowed prefix: any alphanumeric/underscore run (e.g. NEXT_PUBLIC_,
// AZURE_OPENAI_) — the *suffix* is what must match the sensitive list.
const SENSITIVE_KEY_RE =
  /(?:^|[^A-Za-z0-9_])[A-Za-z0-9_]*?(API[_-]?KEY|API[_-]?TOKEN|API[_-]?SECRET|SECRET(?:[_-]?KEY)?|TOKEN|PASSWORD|PASSWD|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET|ACCESS[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|BEARER(?:[_-]?TOKEN)?|DATABASE[_-]?URL|DB[_-]?URL|CONNECTION[_-]?STRING|WEBHOOK[_-]?SECRET|SIGNING[_-]?SECRET|REFRESH[_-]?TOKEN|ENCRYPTION[_-]?KEY|SESSION[_-]?SECRET|JWT[_-]?SECRET|COOKIE[_-]?SECRET)(?![A-Za-z0-9_])/i;

// Match:  KEY=value, KEY = "value", "KEY": 'value', `KEY`: value
// Allows whitespace; value may be unquoted (until end of line / whitespace),
// single-quoted, double-quoted, or backtick-quoted.
const ENV_KV: DetectorMatch = {
  category: "secret",
  pattern:
    /(["'`]?(?:[A-Za-z][A-Za-z0-9_]*?(?:API[_-]?KEY|API[_-]?TOKEN|API[_-]?SECRET|SECRET(?:[_-]?KEY)?|TOKEN|PASSWORD|PASSWD|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET|ACCESS[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|BEARER(?:[_-]?TOKEN)?|DATABASE[_-]?URL|DB[_-]?URL|CONNECTION[_-]?STRING|WEBHOOK[_-]?SECRET|SIGNING[_-]?SECRET|REFRESH[_-]?TOKEN|ENCRYPTION[_-]?KEY|SESSION[_-]?SECRET|JWT[_-]?SECRET|COOKIE[_-]?SECRET)[A-Za-z0-9_]*?)["'`]?\s*[:=]\s*)(?:"([^"]{4,})"|'([^']{4,})'|`([^`]{4,})`|([^\s"'`,;}{\][)(]{4,}))/gi,
  replace: (_m, prefix: string, dq?: string, sq?: string, bq?: string, raw?: string) => {
    // Confirm the captured key name itself matches the sensitive list — the
    // outer pattern is intentionally loose to allow prefixed variants
    // (e.g. NEXT_PUBLIC_FOO_API_KEY); this re-check prevents false positives
    // when the key name is just "TOKENIZED" or similar.
    if (!SENSITIVE_KEY_RE.test(prefix)) return _m;
    if (dq !== undefined) return `${prefix}"<redacted:env-value>"`;
    if (sq !== undefined) return `${prefix}'<redacted:env-value>'`;
    if (bq !== undefined) return `${prefix}\`<redacted:env-value>\``;
    return `${prefix}<redacted:env-value>`;
  },
};

// ──────────────────────────────────────────────────────────────────────────
// Email
// ──────────────────────────────────────────────────────────────────────────
const EMAIL: DetectorMatch = {
  category: "email",
  pattern: /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g,
  replace: () => "<redacted:email>",
};

// ──────────────────────────────────────────────────────────────────────────
// Absolute home paths — /Users/<name>/... or /home/<name>/...
// ──────────────────────────────────────────────────────────────────────────
const HOME_PATH: DetectorMatch = {
  category: "path",
  pattern: /\/(?:Users|home)\/([A-Za-z0-9_\-.]+)/g,
  replace: () => "/Users/anon",
};

// ──────────────────────────────────────────────────────────────────────────
// Internal-looking hostnames: *.internal, *.local, *.lan, *.corp, *.intra
// ──────────────────────────────────────────────────────────────────────────
const INTERNAL_HOST: DetectorMatch = {
  category: "internal-host",
  pattern: /\bhttps?:\/\/[A-Za-z0-9_\-.]+\.(?:internal|local|lan|corp|intra)(?::\d+)?(?:\/[^\s"'`]*)?/g,
  replace: () => "<redacted:internal-host>",
};

export const DETECTORS: DetectorMatch[] = [
  ...SECRET_PATTERNS,
  CRED_URL,
  ENV_KV,
  EMAIL,
  HOME_PATH,
  INTERNAL_HOST,
];
