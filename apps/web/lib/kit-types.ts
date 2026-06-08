// Shared Build Kit types. Pure type-only module so both the Drizzle schema
// (apps/web/db/schema.ts) and the pure matcher/assembler logic can import them
// without pulling in DB or network code. Keep this file dependency-free.

/** A captured agent-rules / config file bundled into a Build Kit. */
export interface KitRuleFile {
  /** Repo-relative path, e.g. "CLAUDE.md" or ".cursor/rules/style.mdc". */
  path: string;
  /** File contents, already run through secret redaction before persisting. */
  body: string;
}

/** Parsed stack signal derived from a repo's package manifest. */
export interface KitStackManifest {
  /** "npm" | "pnpm" | "yarn" | "bun" | "pip" | "poetry" | "go" | "cargo" | "bundler" | null */
  packageManager: string | null;
  /** Human-facing framework labels, e.g. ["Next.js", "Tailwind", "Drizzle"]. */
  frameworks: string[];
  /** Flat dependency names (deps + devDeps), capped. */
  dependencies: string[];
  /** Primary language label when known, e.g. "TypeScript". */
  language: string | null;
}

/**
 * How confidently a kit can be reproduced:
 *  - "verified"     repo-derived rules + stack AND a public, shipped commit
 *  - "partial"      repo-derived rules and/or stack, no shipped-commit proof
 *  - "prompts-only" pasted prompts with no repo files behind them
 */
export type Reproducibility = "verified" | "partial" | "prompts-only";
