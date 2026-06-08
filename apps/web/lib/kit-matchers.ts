import type { KitRuleFile, KitStackManifest, Reproducibility } from "./kit-types";

// Pure Build Kit helpers — no DB, no network. Everything here is unit-testable
// in isolation (see kit-matchers.test.ts). The assembler (kit-assembler.ts)
// layers GitHub/Octokit + persistence on top of these.

/** Exact repo-relative paths that count as agent-rules files. */
export const KIT_RULE_PATHS: readonly string[] = [
  "CLAUDE.md",
  "AGENTS.md",
  ".cursorrules",
  ".windsurfrules",
  "GEMINI.md",
  ".github/copilot-instructions.md",
  ".aider.conf.yml",
];

/** Directory-glob rule files (Cursor's per-rule .mdc files). */
export const KIT_RULE_DIR_PATTERNS: readonly RegExp[] = [/^\.cursor\/rules\/.+\.mdc$/i];

/** Package manifests we read to derive the stack. Order = preference. */
export const KIT_MANIFEST_PATHS: readonly string[] = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "go.mod",
  "Cargo.toml",
  "Gemfile",
];

/** Framework/tooling config files worth capturing as scaffold signal. */
export const KIT_CONFIG_PATTERNS: readonly RegExp[] = [
  /^next\.config\.[mc]?[jt]s$/i,
  /^vite\.config\.[mc]?[jt]s$/i,
  /^tailwind\.config\.[mc]?[jt]s$/i,
  /^astro\.config\.[mc]?[jt]s$/i,
  /^svelte\.config\.[mc]?[jt]s$/i,
  /^\.env\.example$/i,
];

export interface MatchedKitFiles {
  rules: string[];
  manifests: string[];
  configs: string[];
}

/** Bucket a repo's file paths into the kit-relevant ones. */
export function matchKitFiles(paths: readonly string[]): MatchedKitFiles {
  const rules: string[] = [];
  const manifests: string[] = [];
  const configs: string[] = [];

  for (const raw of paths) {
    const path = raw.replace(/^\.\//, "");
    if (KIT_RULE_PATHS.includes(path) || KIT_RULE_DIR_PATTERNS.some((re) => re.test(path))) {
      rules.push(path);
    } else if (KIT_MANIFEST_PATHS.includes(path)) {
      manifests.push(path);
    } else if (KIT_CONFIG_PATTERNS.some((re) => re.test(path))) {
      configs.push(path);
    }
  }

  // Manifests sorted by preference order so package.json wins when present.
  manifests.sort((a, b) => KIT_MANIFEST_PATHS.indexOf(a) - KIT_MANIFEST_PATHS.indexOf(b));
  return { rules, manifests, configs };
}

// Dependency name → human framework label. First match wins per dependency.
const FRAMEWORK_LABELS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^next$/, "Next.js"],
  [/^@remix-run\//, "Remix"],
  [/^@sveltejs\/kit$/, "SvelteKit"],
  [/^svelte$/, "Svelte"],
  [/^nuxt$/, "Nuxt"],
  [/^astro$/, "Astro"],
  [/^vue$/, "Vue"],
  [/^react$/, "React"],
  [/^vite$/, "Vite"],
  [/^tailwindcss$/, "Tailwind"],
  [/^drizzle-orm$/, "Drizzle"],
  [/^prisma$|^@prisma\/client$/, "Prisma"],
  [/^express$/, "Express"],
  [/^fastify$/, "Fastify"],
  [/^hono$/, "Hono"],
  [/^@trpc\//, "tRPC"],
  [/^@tanstack\/react-query$/, "React Query"],
  [/^better-auth$/, "Better Auth"],
  [/^stripe$|^@stripe\//, "Stripe"],
  [/^supabase$|^@supabase\//, "Supabase"],
];

const MAX_DEPENDENCIES = 60;

function labelFrameworks(depNames: readonly string[]): string[] {
  const labels = new Set<string>();
  for (const dep of depNames) {
    for (const [re, label] of FRAMEWORK_LABELS) {
      if (re.test(dep)) {
        labels.add(label);
        break;
      }
    }
  }
  return [...labels];
}

/**
 * Parse a package.json body into a stack manifest. Tolerant of malformed JSON —
 * returns a best-effort manifest rather than throwing, since a kit is still
 * useful without a clean stack read.
 */
export function parseStack(packageJsonText: string): KitStackManifest {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(packageJsonText) as Record<string, unknown>;
  } catch {
    return { packageManager: null, frameworks: [], dependencies: [], language: null };
  }

  const deps = {
    ...(isRecord(parsed.dependencies) ? parsed.dependencies : {}),
    ...(isRecord(parsed.devDependencies) ? parsed.devDependencies : {}),
  };
  const depNames = Object.keys(deps).sort();
  const packageManager = readPackageManager(parsed.packageManager);
  const language = depNames.includes("typescript") ? "TypeScript" : "JavaScript";

  return {
    packageManager,
    frameworks: labelFrameworks(depNames),
    dependencies: depNames.slice(0, MAX_DEPENDENCIES),
    language,
  };
}

function readPackageManager(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.split("@")[0]?.trim();
  return name ? name : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Decide how reproducible a kit is from what we managed to capture. */
export function gradeReproducibility(input: {
  hasRules: boolean;
  hasStack: boolean;
  hasPrompts: boolean;
  shippedPublicCommit: boolean;
}): Reproducibility {
  const repoDerived = input.hasRules || input.hasStack;
  if (!repoDerived) return "prompts-only";
  if (input.shippedPublicCommit && input.hasRules && input.hasStack) return "verified";
  return "partial";
}

// Conservative secret patterns. We deliberately keep this small and high-signal:
// kit files are rules/manifests/configs (rarely secret-bearing), and we never
// read a real `.env` — only `.env.example`. This is defense-in-depth on top of
// that, not the primary guard.
const SECRET_PATTERNS: readonly RegExp[] = [
  /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g,
  /\bsk-[A-Za-z0-9]{20,}\b/g, // OpenAI-style
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, // GitHub tokens
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, // Slack
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWT
  // KEY=value / TOKEN=value / SECRET=value / PASSWORD=value with a real-looking value
  /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|API)[A-Z0-9_]*)\s*[:=]\s*["']?([A-Za-z0-9_\-./+]{8,})["']?/g,
];

/** Redact obvious secrets from a captured file body before it is persisted. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (match, key?: string) =>
      // For KEY=value matches keep the key name, redact only the value.
      key && /[:=]/.test(match) ? `${key}=<redacted:secret>` : "<redacted:secret>",
    );
  }
  return out;
}

/** Build the lowest-common-denominator markdown rendering of a kit. */
export function renderKitMarkdown(input: {
  title: string;
  sourceRepo: string;
  reproducibility: Reproducibility;
  stack: KitStackManifest | null;
  rules: readonly KitRuleFile[];
  prompts: readonly string[];
}): string {
  const lines: string[] = [`# ${input.title}`, ""];
  lines.push(`> Build Kit from ${input.sourceRepo} · ${input.reproducibility}`, "");

  if (input.stack && (input.stack.frameworks.length > 0 || input.stack.dependencies.length > 0)) {
    lines.push("## Stack");
    if (input.stack.frameworks.length > 0)
      lines.push(`**Frameworks:** ${input.stack.frameworks.join(", ")}`);
    if (input.stack.packageManager)
      lines.push(`**Package manager:** ${input.stack.packageManager}`);
    lines.push("");
  }

  for (const rule of input.rules) {
    lines.push(`## ${rule.path}`, "```", rule.body.trim(), "```", "");
  }

  if (input.prompts.length > 0) {
    lines.push("## Prompts");
    input.prompts.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
    lines.push("");
  }

  lines.push(
    "## How to use",
    "1. Drop the rules file(s) into your repo root.",
    "2. Open your AI tool and seed it with the prompts above.",
    "3. Share your run back at https://gettrail.vercel.app",
  );
  return lines.join("\n");
}
