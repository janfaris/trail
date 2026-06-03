// Pure tag canonicalization + extraction for the sessionTag corpus. Kept free
// of DB/Next imports so it's trivially unit-testable and shared by the upload
// hook and the backfill script.
//
// Why this exists: trail_session already carries LLM-extracted `tool`,
// `toolsUsed`, `frameworks`, and `models` arrays. Those power /learn's jsonb
// faceting fine, but the 60-day entity pages (/tools/[slug], /frameworks/[slug])
// need a normalized, indexed projection so we can outcome-rank, find related
// tools, and roll up per-builder usage. This module turns the raw LLM labels
// into stable canonical slugs (the URL key) + display labels.

export type TagKind = "tool" | "framework" | "model" | "community";

export interface SessionTagInput {
  /** Canonical slug — the stable URL key, e.g. "nextjs". */
  tag: string;
  /** Human display label, derived from the slug, e.g. "Next.js". */
  label: string;
  kind: TagKind;
  /** 1.0 for the vendor `tool` (always present); LLM array values slightly lower. */
  confidence: number;
  /** Provenance so we can later mix in heuristic enrichment without ambiguity. */
  source: "llm" | "heuristic";
}

// Conservative slug aliases. Only map variants we're confident collapse to the
// same canonical thing. We deliberately do NOT map ambiguous short forms like
// bare "next" → "nextjs" (could be unrelated) — slugifyRaw handles the common
// dot/space/casing/.js variants generically, and this map only covers the
// remaining well-known spellings.
const SLUG_ALIASES: Record<string, string> = {
  nextjs: "nextjs",
  "next-js": "nextjs",
  nodejs: "nodejs",
  "node-js": "nodejs",
  reactjs: "react",
  vuejs: "vue",
  nuxtjs: "nuxt",
  tailwind: "tailwindcss",
  "tailwind-css": "tailwindcss",
  postgres: "postgresql",
  postgre: "postgresql",
  golang: "go",
  "vs-code": "vscode",
  "visual-studio-code": "vscode",
};

// Preferred display labels for known slugs. Anything not listed falls back to a
// titleized version of the slug.
const DISPLAY_LABELS: Record<string, string> = {
  nextjs: "Next.js",
  nodejs: "Node.js",
  react: "React",
  vue: "Vue",
  nuxt: "Nuxt",
  tailwindcss: "Tailwind CSS",
  postgresql: "PostgreSQL",
  go: "Go",
  vscode: "VS Code",
  typescript: "TypeScript",
  javascript: "JavaScript",
  drizzle: "Drizzle",
  prisma: "Prisma",
  eslint: "ESLint",
  cursor: "Cursor",
  vite: "Vite",
  graphql: "GraphQL",
  css: "CSS",
  html: "HTML",
  npm: "npm",
};

/**
 * Lowercase + strip to a clean slug: collapse whitespace/punctuation to single
 * hyphens, drop a trailing `.js`/`-js` (handled generically before the alias
 * lookup), and trim stray hyphens. Returns "" for unusable input.
 */
function slugifyRaw(raw: string): string {
  let s = raw.trim().toLowerCase();
  if (!s) return "";
  // Normalize the common framework ".js" suffix so "Next.js" and "Next js"
  // both reduce to the same base before aliasing.
  s = s.replace(/[._\s]?js$/i, "js");
  s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s;
}

/** Canonical slug for a raw LLM label, applying the alias map. "" if unusable. */
export function slugifyTag(raw: string): string {
  const base = slugifyRaw(raw);
  if (!base) return "";
  return SLUG_ALIASES[base] ?? base;
}

/** Display label for a canonical slug: explicit override, else titleized. */
export function canonicalLabel(slug: string): string {
  if (!slug) return "";
  const known = DISPLAY_LABELS[slug];
  if (known) return known;
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

interface ExtractInput {
  /** Vendor tool slug from trail_session.tool — always present (e.g. "cursor"). */
  tool?: string | null;
  toolsUsed?: string[] | null;
  frameworks?: string[] | null;
  models?: string[] | null;
}

/**
 * Build the deduped tag projection for one session from its existing LLM
 * arrays. Dedup grain is (kind, tag) — the same slug may legitimately appear
 * under two kinds (e.g. a thing the LLM lists as both a tool and a framework),
 * and the DB unique index is (sessionId, tag, kind) to match.
 *
 * Confidence: the vendor `tool` is recorded by the client itself, so it's 1.0;
 * the LLM-inferred arrays are slightly lower (0.9) so future ranking can prefer
 * first-party signal.
 */
export function extractSessionTags(input: ExtractInput): SessionTagInput[] {
  const seen = new Set<string>();
  const out: SessionTagInput[] = [];

  const push = (raw: unknown, kind: TagKind, confidence: number) => {
    if (typeof raw !== "string") return;
    const tag = slugifyTag(raw);
    if (!tag) return;
    const key = `${kind}:${tag}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ tag, label: canonicalLabel(tag), kind, confidence, source: "llm" });
  };

  if (input.tool) push(input.tool, "tool", 1.0);
  for (const t of input.toolsUsed ?? []) push(t, "tool", 0.9);
  for (const f of input.frameworks ?? []) push(f, "framework", 0.9);
  for (const m of input.models ?? []) push(m, "model", 0.9);

  return out;
}
