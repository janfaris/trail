import { Command } from "commander";
import chalk from "chalk";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { Session, type Session as SessionT } from "@trail/schema";
import {
  anonymize,
  type EntropySuspect,
  type RedactionCategory,
  type RedactionCategoryDetail,
  type RedactionItem,
  type RedactionReport,
} from "@trail/anonymize";
import { createTrailClient, DEFAULT_TRAIL_API_URL } from "@trail/client";
import { db } from "../db.js";
import type { StoredCaptureReport } from "../lib/capture-redact.js";
import { getAuthCookie, clearAuth } from "../lib/auth-storage.js";
import { detectGitContext, type GitContext } from "../git-context.js";

interface SessionRow {
  id: string;
  user: string;
  tool: string;
  startedAt: string;
  endedAt: string | null;
  repo: string | null;
  redactedAt: string | null;
}

function listAllLocalSessionIds(): string[] {
  const rows = db
    .prepare(`SELECT id FROM sessions ORDER BY started_at DESC`)
    .all() as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

function getLatestLocalSessionId(): string | null {
  const row = db
    .prepare(`SELECT id FROM sessions ORDER BY started_at DESC LIMIT 1`)
    .get() as { id: string } | undefined;
  return row?.id ?? null;
}

// Format receipt verification status for terminal output. Mirrors the
// three-state classification produced by ensureReceipt() on the server:
//   shipped    — linked commit confirmed merged on GitHub
//   draft      — linked commit exists but not yet shipped
//   unverified — no commit link at all (or status missing from response)
function formatReceiptStatus(status: "shipped" | "draft" | "unverified" | undefined): string {
  switch (status) {
    case "shipped":
      return chalk.green("[x] Shipped");
    case "draft":
      return chalk.yellow("[~] Draft");
    case "unverified":
    default:
      return chalk.dim("[!] Unverified");
  }
}

// Pre-upload feedback so the user knows BEFORE sharing whether this trail can
// count toward their Verified Builder badge. Badge eligibility on the server
// requires a GitHub repo + a HEAD commit that later merges to the default
// branch; without both the upload still succeeds but never lights the badge.
function printLinkageFeedback(git: GitContext, opts: { indent?: string; bulk?: boolean } = {}): void {
  const indent = opts.indent ?? "";
  const subj = opts.bulk ? "these trails" : "this trail";
  if (git.repo && git.commitSha) {
    const verb = opts.bulk ? "linking all uploads to" : "linked to";
    console.log(
      indent + chalk.green("✓"),
      `${verb} ${git.repo}@${git.commitSha.slice(0, 7)} — counts toward your Verified Builder badge once this commit lands on the default branch`,
    );
  } else {
    const why = !git.repo ? "no GitHub repo detected" : "no HEAD commit detected";
    console.log(
      indent + chalk.yellow("⚠"),
      `${why} — ${subj} won't count toward your Verified Builder badge. Run \`trail share\` from inside the repo after your PR merges.`,
    );
  }
}

// Derive the uploader's profile URL. Prefer the server-provided profileUrl;
// fall back to stripping the slug off the receipt URL for older servers.
function profileUrlFrom(r: { profileUrl?: string; url: string }): string {
  return r.profileUrl ?? r.url.replace(/\/[^/]+$/, "");
}

// Post-share nudge pointing the user at their badge. Deliberately conservative:
// only claims the badge is "live" when the receipt is BOTH verified-shipped and
// public, matching the server's badge predicate. Private/pending shipped
// receipts and drafts get honest, softer copy.
function printBadgeNudge(
  r: {
    receiptStatus?: "shipped" | "draft" | "unverified";
    visibility?: string;
    profileUrl?: string;
    url: string;
  },
  git: GitContext,
  indent = "",
): void {
  const profile = profileUrlFrom(r);
  const at = git.repo && git.commitSha ? `${git.repo}@${git.commitSha.slice(0, 7)}` : "your commit";
  if (r.receiptStatus === "shipped") {
    if (r.visibility === "public") {
      console.log(indent + chalk.green("★"), `Verified shipped — your Verified Builder badge is live: ${profile}`);
    } else if (r.visibility === "private" || r.visibility === "pending") {
      const where = r.visibility === "private" ? "private" : "in pending review";
      console.log(
        indent + chalk.yellow("★"),
        `Verified shipped, but this receipt is ${where} so it won't show on your public badge yet: ${profile}`,
      );
    } else {
      console.log(indent + chalk.green("★"), `Verified shipped — view your profile: ${profile}`);
    }
    return;
  }
  if (r.receiptStatus === "draft") {
    console.log(
      indent + chalk.yellow("→"),
      `Draft: ${at} isn't on the default branch yet — it lights your badge once merged (re-run \`trail share\` after a squash merge): ${profile}`,
    );
    return;
  }
  console.log(
    indent + chalk.dim("→"),
    `Not counting toward your badge yet — link a merged commit from inside the repo: ${profile}`,
  );
}

function loadLocalSession(id: string): { session: SessionT; alreadyRedacted: boolean } | null {
  const row = db
    .prepare(
      `SELECT id, user, tool, started_at AS startedAt, ended_at AS endedAt, repo, redacted_at AS redactedAt
       FROM sessions WHERE id = ?`,
    )
    .get(id) as SessionRow | undefined;
  if (!row) return null;
  const events = (
    db
      .prepare(`SELECT payload FROM events WHERE session_id = ? ORDER BY id ASC`)
      .all(id) as Array<{ payload: string }>
  ).map((r) => JSON.parse(r.payload));
  const built = {
    id: row.id,
    user: row.user,
    tool: row.tool,
    startedAt: row.startedAt,
    endedAt: row.endedAt ?? undefined,
    repo: row.repo ?? undefined,
    events,
  };
  return { session: Session.parse(built), alreadyRedacted: row.redactedAt != null };
}

/**
 * Read the masked redaction breakdown that was recorded when this session was
 * captured (see saveSession in db.ts). Returns null when the session predates
 * report persistence or has no stored breakdown. The stored data contains only
 * masked previews — never raw secret material — so it is safe to print.
 */
function loadCaptureReport(id: string): StoredCaptureReport | null {
  const row = db
    .prepare(`SELECT redaction_report AS redactionReport FROM sessions WHERE id = ?`)
    .get(id) as { redactionReport: string | null } | undefined;
  if (!row?.redactionReport) return null;
  try {
    const parsed = JSON.parse(row.redactionReport) as Partial<StoredCaptureReport>;
    if (typeof parsed.total !== "number" || !Array.isArray(parsed.categories)) return null;
    return {
      total: parsed.total,
      byCategory: parsed.byCategory ?? {},
      categories: parsed.categories,
      suspectCount: parsed.suspectCount ?? 0,
    };
  } catch {
    return null;
  }
}

function confirm(prompt: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${prompt} [y/N] `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

function copyToClipboard(text: string): boolean {
  try {
    const r = spawnSync("pbcopy", { input: text });
    return r.status === 0;
  } catch {
    return false;
  }
}

function openInBrowser(filePath: string): void {
  const url = `file://${filePath}`;
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  spawnSync(cmd, [url], { stdio: "ignore" });
}

// ──────────────────────────────────────────────────────────────────────────
// Share-time scope filters. These strip event categories the user opted out
// of BEFORE re-validating against the schema (the schema requires events to
// be one of the known kinds, so we keep prompts + decisions as fallbacks).
// ──────────────────────────────────────────────────────────────────────────
function applyScopeFilters(
  s: SessionT,
  opts: { promptsOnly: boolean; noDiffs: boolean; noToolArgs: boolean },
): SessionT {
  const filtered = { ...s };
  filtered.events = s.events.flatMap((e): SessionT["events"] => {
    if (opts.promptsOnly && e.kind !== "prompt" && e.kind !== "decision") return [];
    if (opts.noDiffs && e.kind === "file_diff") return [];
    if (opts.noToolArgs && e.kind === "tool_call") {
      return [{ ...e, args: "<elided>", result: undefined }];
    }
    return [e];
  });
  return Session.parse(filtered);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CATEGORY_LABELS: Record<RedactionCategory, string> = {
  secret: "Secrets / API keys",
  "credential-url": "Credential URLs",
  path: "Absolute paths",
  email: "Email addresses",
  "internal-host": "Internal hostnames",
};

const CATEGORY_HELP: Record<RedactionCategory, string> = {
  secret: "tokens, keys, and other credentials",
  "credential-url": "user:password embedded in connection strings",
  path: "absolute filesystem paths that reveal your username/machine",
  email: "email addresses",
  "internal-host": "internal hostnames and private network identifiers",
};

function categoryLabel(cat: RedactionCategory): string {
  return CATEGORY_LABELS[cat] ?? cat;
}

/**
 * Prints the auditable "here's exactly what we removed" breakdown to the
 * terminal: one block per category with the total count and a few masked
 * preview samples. Previews come from the report and never contain the raw
 * secret, so this is safe to show, log, or pipe. Counts are exact even when
 * the number of shown samples is capped.
 */
function printRedactionReport(
  report: { total: number; categories: RedactionCategoryDetail[] },
  opts: { indent?: string } = {},
): void {
  const indent = opts.indent ?? "";
  if (report.total === 0) {
    console.log(
      indent + chalk.green("✓ redaction report"),
      chalk.dim("nothing matched — no secrets, paths, emails, or hosts detected"),
    );
    return;
  }

  const catCount = report.categories.length;
  console.log(
    indent + chalk.bold("redaction report"),
    chalk.dim(
      `— exactly what will be stripped before upload (${report.total} item${
        report.total === 1 ? "" : "s"
      } across ${catCount} categor${catCount === 1 ? "y" : "ies"})`,
    ),
  );

  for (const cat of report.categories) {
    console.log(
      `${indent}  ${chalk.cyan(categoryLabel(cat.category).padEnd(19))} ${chalk.bold(
        String(cat.count),
      )} ${chalk.dim(`(${CATEGORY_HELP[cat.category] ?? cat.category})`)}`,
    );
    for (const item of cat.samples) {
      console.log(
        `${indent}    ${chalk.dim("•")} ${chalk.magenta(item.label)}  ${item.preview}  ${chalk.dim(
          `${item.length} char${item.length === 1 ? "" : "s"} · ${item.location}`,
        )}`,
      );
    }
    const hidden = cat.count - cat.samples.length;
    if (hidden > 0) {
      console.log(`${indent}    ${chalk.dim(`… and ${hidden} more`)}`);
    }
  }
}

/**
 * The full auditable share preview. Shows, in trust order:
 *
 *   1. The breakdown recorded when the session was CAPTURED — the real removal
 *      event. Trail scrubs on write, so this is "exactly what was stripped
 *      before anything touched your disk." This is the report the user cares
 *      about when deciding whether it's safe to publish.
 *   2. A short verification line confirming the outgoing payload carries only
 *      masked placeholders.
 *
 * Capture and share run the SAME detectors, so a second pass over
 * already-redacted data can only ever re-match the masked placeholders it
 * produced earlier (e.g. `/Users/anon`) — never raw values. We therefore do
 * NOT surface that pass as "more to remove" for already-scrubbed sessions; that
 * would be a false alarm and erode the very trust this preview exists to build.
 * For legacy rows captured before redaction-at-capture, the live pass IS the
 * real scan and is shown as the primary report.
 */
function printShareRedactionPreview(
  captureReport: StoredCaptureReport | null,
  liveReport: RedactionReport,
  alreadyRedacted: boolean,
): void {
  if (captureReport) {
    if (captureReport.total > 0) {
      console.log(
        chalk.dim(
          "Removed when this session was captured — before anything was written to disk:",
        ),
      );
      printRedactionReport(captureReport);
      console.log(
        chalk.green("  ✓"),
        chalk.dim(
          "re-scanned at share time — the payload below carries only masked placeholders, no raw values",
        ),
      );
    } else {
      // Capture recorded a clean session: nothing sensitive was ever stored.
      printRedactionReport(captureReport);
    }
    return;
  }
  // No stored capture breakdown at all (row captured before report persistence).
  if (!alreadyRedacted) {
    // Legacy raw row: the live pass is the real, primary scan of raw content.
    printRedactionReport(liveReport);
    return;
  }
  // Redacted at capture but captured before the breakdown was persisted.
  if (liveReport.total === 0) {
    console.log(
      chalk.green("✓ redaction report"),
      chalk.dim("this session was scrubbed at capture; no detailed breakdown was recorded"),
    );
  } else {
    printRedactionReport(liveReport);
  }
}

/**
 * Merges per-session category details into a single aggregate breakdown for the
 * bulk dry-run view. Counts sum across sessions; sample previews are capped and
 * tagged with a short session prefix so each preview stays traceable.
 */
function mergeCategoriesAcrossReports(
  entries: Array<{ id: string; categories: RedactionCategoryDetail[] }>,
  maxSamplesPerCategory = 5,
): RedactionCategoryDetail[] {
  const order: RedactionCategory[] = [
    "secret",
    "credential-url",
    "path",
    "email",
    "internal-host",
  ];
  const counts = new Map<RedactionCategory, number>();
  const samples = new Map<RedactionCategory, RedactionItem[]>();

  for (const entry of entries) {
    const prefix = entry.id.slice(0, 8);
    for (const cat of entry.categories) {
      counts.set(cat.category, (counts.get(cat.category) ?? 0) + cat.count);
      const bucket = samples.get(cat.category) ?? [];
      for (const sample of cat.samples) {
        if (bucket.length >= maxSamplesPerCategory) break;
        bucket.push({ ...sample, location: `${prefix}:${sample.location}` });
      }
      samples.set(cat.category, bucket);
    }
  }

  return order
    .filter((cat) => (counts.get(cat) ?? 0) > 0)
    .map((cat) => ({
      category: cat,
      count: counts.get(cat) ?? 0,
      samples: samples.get(cat) ?? [],
    }));
}

function renderPreviewHtml(
  original: SessionT,
  scrubbed: SessionT,
  report: {
    total: number;
    byCategory: Record<string, number>;
    categories?: RedactionCategoryDetail[];
    suspects: EntropySuspect[];
  },
): string {
  const left = escapeHtml(JSON.stringify(original, null, 2));
  const right = escapeHtml(JSON.stringify(scrubbed, null, 2));
  const cats = Object.entries(report.byCategory)
    .filter(([, n]) => n > 0)
    .map(
      ([k, n]) =>
        `<span class="pill">${escapeHtml(k)}: ${n}</span>`,
    )
    .join(" ");
  const redactionRows = (report.categories ?? [])
    .flatMap((cat) =>
      cat.samples.map((item) => {
        const hidden = cat.count - cat.samples.length;
        return `<tr><td>${escapeHtml(categoryLabel(cat.category))}</td><td><code class="marker">${escapeHtml(
          item.label,
        )}</code></td><td><code>${escapeHtml(item.preview)}</code></td><td>${item.length}</td><td>${escapeHtml(
          item.location,
        )}</td></tr>`;
      }),
    )
    .join("");
  const redactionFootnotes = (report.categories ?? [])
    .filter((cat) => cat.count > cat.samples.length)
    .map(
      (cat) =>
        `<span class="pill">${escapeHtml(categoryLabel(cat.category))}: +${
          cat.count - cat.samples.length
        } more not shown</span>`,
    )
    .join(" ");
  const suspectRows = report.suspects
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.location)}</td><td>${s.entropy}</td><td><code>${escapeHtml(
          s.token.slice(0, 40),
        )}${s.token.length > 40 ? "…" : ""}</code></td></tr>`,
    )
    .join("");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Trail share preview</title>
<style>
  body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#0a0a0a;color:#e7e7e7;margin:0;padding:24px}
  h1{font-size:14px;letter-spacing:.05em;text-transform:uppercase;color:#a7f300;margin:0 0 4px}
  h2{font-size:13px;color:#a7f300;margin:24px 0 8px}
  .meta{color:#a1a1aa;font-size:12px;margin-bottom:16px}
  .pill{display:inline-block;background:#1f2937;color:#d1d5db;border-radius:999px;padding:2px 8px;font-size:11px;margin-right:6px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .pane{background:#111;border:1px solid #1f1f1f;border-radius:8px;padding:12px;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-word;max-height:60vh;overflow:auto}
  .pane.left{border-left:3px solid #f87171}
  .pane.right{border-left:3px solid #a7f300}
  table{border-collapse:collapse;font-size:12px;width:100%;margin-top:8px}
  th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #1f1f1f}
  th{color:#a1a1aa;font-weight:normal;font-size:11px;letter-spacing:.05em;text-transform:uppercase}
  code{background:#111;padding:1px 4px;border-radius:3px;color:#fca5a5}
  code.marker{color:#a7f300}
  .warn{color:#fbbf24}
  .ok{color:#a7f300}
</style></head>
<body>
<h1>Trail · share preview</h1>
<div class="meta">${report.total} redactions applied · ${cats || '<span class="ok">no named matches</span>'}</div>

${
  redactionRows
    ? `<h2>Redaction report — exactly what will be removed</h2>
       <p class="meta">Previews are masked — the raw values never appear here or in the upload.</p>
       <table>
         <thead><tr><th>Category</th><th>Marker</th><th>Masked preview</th><th>Length</th><th>Location</th></tr></thead>
         <tbody>${redactionRows}</tbody>
       </table>
       ${redactionFootnotes ? `<div class="meta" style="margin-top:8px">${redactionFootnotes}</div>` : ""}`
    : ""
}

<h2>Original (local-only — never uploaded)  &nbsp;→&nbsp;  Anonymized payload (uploads if you confirm)</h2>
<div class="grid">
  <div class="pane left">${left}</div>
  <div class="pane right">${right}</div>
</div>

${
  report.suspects.length > 0
    ? `<h2 class="warn">⚠ Entropy guard — ${report.suspects.length} suspicious token(s) survived</h2>
       <p class="meta">No named detector matched these, but they look like opaque credentials.
       Upload will be held in <code>pending</code> review unless you re-run with <code>--allow-suspects</code>.</p>
       <table>
         <thead><tr><th>Location</th><th>Entropy (bits/char)</th><th>Token preview</th></tr></thead>
         <tbody>${suspectRows}</tbody>
       </table>`
    : `<h2 class="ok">Entropy guard: clean</h2>`
}
</body></html>`;
}

interface BulkSessionSummary {
  id: string;
  startedAt: string;
  tool: string;
  eventCount: number;
  redactionCount: number;
}

function renderBulkPreviewHtml(summaries: BulkSessionSummary[], totalRedactions: number): string {
  const totalEvents = summaries.reduce((n, s) => n + s.eventCount, 0);
  const rows = summaries
    .map(
      (s) =>
        `<tr><td><code>${escapeHtml(s.id.slice(0, 12))}</code></td><td>${escapeHtml(s.startedAt)}</td><td>${escapeHtml(s.tool)}</td><td>${s.eventCount}</td><td>${s.redactionCount}</td></tr>`,
    )
    .join("");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Trail bulk share preview</title>
<style>
  body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#0a0a0a;color:#e7e7e7;margin:0;padding:24px}
  h1{font-size:14px;letter-spacing:.05em;text-transform:uppercase;color:#a7f300;margin:0 0 4px}
  h2{font-size:13px;color:#a7f300;margin:24px 0 8px}
  .meta{color:#a1a1aa;font-size:12px;margin-bottom:16px}
  .pill{display:inline-block;background:#1f2937;color:#d1d5db;border-radius:999px;padding:2px 8px;font-size:11px;margin-right:6px}
  table{border-collapse:collapse;font-size:12px;width:100%;margin-top:8px}
  th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #1f1f1f}
  th{color:#a1a1aa;font-weight:normal;font-size:11px;letter-spacing:.05em;text-transform:uppercase}
  code{background:#111;padding:1px 4px;border-radius:3px;color:#a7f300}
</style></head>
<body>
<h1>Trail · bulk share preview</h1>
<div class="meta">
  <span class="pill">${summaries.length} sessions</span>
  <span class="pill">${totalEvents} events</span>
  <span class="pill">${totalRedactions} redactions</span>
</div>
<p class="meta">All sessions below will be anonymized at upload time. Per-session previews use the same pipeline as <code>trail share &lt;id&gt;</code>. Close this tab and confirm in the terminal to upload.</p>
<table>
  <thead><tr><th>Session</th><th>Started</th><th>Tool</th><th>Events</th><th>Redactions</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;
}

interface BulkShareOpts {
  yes: boolean;
  dryRun: boolean;
  preview: boolean;
  promptsOnly: boolean;
  diffs: boolean;
  toolArgs: boolean;
  allowSuspects: boolean;
  baseUrl: string;
}

async function runBulkShare(opts: BulkShareOpts): Promise<void> {
  const ids = listAllLocalSessionIds();
  if (ids.length === 0) {
    console.log(chalk.yellow("no local sessions to share"));
    return;
  }

  // Anonymize all up front so the preview is honest about what would upload.
  type Prepared = {
    id: string;
    original: SessionT;
    scrubbed: SessionT;
    redactionCount: number;
    suspectCount: number;
    categories: RedactionCategoryDetail[];
  };
  const prepared: Prepared[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const sid of ids) {
    const loaded = loadLocalSession(sid);
    if (!loaded) {
      skipped.push({ id: sid, reason: "not found" });
      continue;
    }
    const scoped = applyScopeFilters(loaded.session, {
      promptsOnly: opts.promptsOnly,
      noDiffs: !opts.diffs,
      noToolArgs: !opts.toolArgs,
    });
    const { session: scrubbed, report } = anonymize(scoped);
    // Prefer the breakdown recorded at capture (the real removal event); fall
    // back to the live pass for legacy rows with no stored breakdown.
    const captureReport = loadCaptureReport(sid);
    const useCapture = captureReport != null && captureReport.total > 0;
    prepared.push({
      id: sid,
      original: loaded.session,
      scrubbed,
      redactionCount: useCapture ? captureReport.total : report.total,
      suspectCount: report.suspects.length,
      categories: useCapture ? captureReport.categories : report.categories,
    });
  }

  const totalRedactions = prepared.reduce((n, p) => n + p.redactionCount, 0);
  const totalSuspects = prepared.reduce((n, p) => n + p.suspectCount, 0);
  const summaries: BulkSessionSummary[] = prepared.map((p) => ({
    id: p.id,
    startedAt: p.original.startedAt,
    tool: p.original.tool,
    eventCount: p.scrubbed.events.length,
    redactionCount: p.redactionCount,
  }));

  console.log(
    chalk.cyan("bulk"),
    `${prepared.length} session(s), ${totalRedactions} redaction(s), ${totalSuspects} entropy suspect(s)`,
  );

  // Aggregate, auditable breakdown across every session that would upload.
  // Shown on --dry-run and before the interactive confirm; skipped under --yes.
  const aggregateCategories = mergeCategoriesAcrossReports(
    prepared.map((p) => ({ id: p.id, categories: p.categories })),
  );

  if (opts.dryRun || !opts.yes) {
    printRedactionReport({ total: totalRedactions, categories: aggregateCategories });
  }

  if (opts.dryRun) {
    console.log(chalk.yellow("--dry-run: not uploading. Bulk preview:"));
    for (const s of summaries) {
      console.log(
        " ",
        chalk.cyan(s.id.slice(0, 12)),
        chalk.dim(s.startedAt),
        chalk.magenta(s.tool),
        chalk.dim(`${s.eventCount} ev`),
        chalk.dim(`${s.redactionCount} redactions`),
      );
    }
    return;
  }

  if (opts.preview && !opts.yes) {
    const previewPath = path.join(tmpdir(), `trail-bulk-preview-${Date.now()}.html`);
    writeFileSync(previewPath, renderBulkPreviewHtml(summaries, totalRedactions), "utf8");
    console.log(chalk.dim("preview:"), previewPath);
    openInBrowser(previewPath);
  }

  if (!opts.yes) {
    const proceed = await confirm(`Upload ${prepared.length} anonymized session(s)?`);
    if (!proceed) {
      console.log(chalk.yellow("aborted"));
      return;
    }
  }

  const cookie = getAuthCookie();
  if (!cookie) {
    console.error(chalk.red("✗"), "not logged in — run `trail login` first");
    process.exit(1);
  }

  const git = detectGitContext();
  const linkHeaders: Record<string, string> = {};
  if (git.repo) linkHeaders["x-trail-linked-repo"] = git.repo;
  if (git.commitSha) linkHeaders["x-trail-linked-commit"] = git.commitSha;
  if (git.repoUrl && git.commitSha) {
    linkHeaders["x-trail-linked-commit-url"] = `${git.repoUrl}/commit/${git.commitSha}`;
  }
  printLinkageFeedback(git, { bulk: true });

  const client = createTrailClient({
    baseUrl: opts.baseUrl,
    getAuthCookie: () => cookie,
    extraHeaders: {
      ...(opts.allowSuspects ? { "x-trail-allow-suspects": "true" } : {}),
      ...linkHeaders,
    },
  });

  const succeeded: Array<{ id: string; url: string; profileUrl?: string }> = [];
  for (let i = 0; i < prepared.length; i++) {
    const p = prepared[i];
    console.log(chalk.dim(`Uploading ${i + 1}/${prepared.length}...`), chalk.cyan(p.id.slice(0, 12)));
    const result = await client.uploadSession(p.scrubbed);
    if (!result.ok) {
      console.error(chalk.red("✗"), `failed on ${p.id}: ${result.error.kind}`);
      if (result.error.kind === "unauthenticated") clearAuth();
      console.log(
        chalk.yellow("partial:"),
        `${succeeded.length}/${prepared.length} uploaded before failure`,
      );
      for (const s of succeeded) console.log(chalk.dim("  ✓"), s.url);
      process.exit(1);
    }
    db.prepare(`UPDATE sessions SET share_slug = ? WHERE id = ?`).run(result.value.slug, p.id);
    const v = result.value as { url: string; slug: string; profileUrl?: string; receiptStatus?: "shipped" | "draft" | "unverified" };
    succeeded.push({ id: p.id, url: v.url, profileUrl: v.profileUrl });
    console.log(chalk.green("  ✓"), "Receipt created:", v.url);
    console.log(chalk.dim("    Status:"), formatReceiptStatus(v.receiptStatus));
  }

  console.log(chalk.green(`done: ${succeeded.length}/${prepared.length} uploaded`));
  const first = succeeded[0];
  if (first) {
    console.log(chalk.dim("profile:"), profileUrlFrom(first));
  }
  if (skipped.length > 0) {
    console.log(chalk.yellow(`skipped: ${skipped.length}`));
    for (const s of skipped) console.log(chalk.dim(`  - ${s.id}: ${s.reason}`));
  }
}

export function shareCommand(): Command {
  return new Command("share")
    .description("Anonymize and upload a session, returning a public URL")
    .argument("[id]", "session id from `trail view` / SQLite (omit when using --all)")
    .option("--all", "share every local session in one flow (mutually exclusive with <id>)", false)
    .option("--latest", "share the most recently started local session (mutually exclusive with <id> and --all)", false)
    .option("--yes", "skip confirmation prompt", false)
    .option("--copy", "copy the resulting URL to the clipboard (macOS pbcopy)", false)
    .option("--dry-run", "anonymize + print what would be uploaded; do not upload", false)
    .option("--no-preview", "skip the browser preview confirmation step")
    .option("--prompts-only", "drop tool_call args and file_diff blobs; share only prompts+decisions", false)
    .option("--no-diffs", "drop file_diff events", false)
    .option("--no-tool-args", "drop tool_call args+results (keep tool names)", false)
    .option("--allow-suspects", "publish even if the entropy guard found unknown high-entropy tokens", false)
    .option("--base-url <url>", "Trail web base URL", process.env.TRAIL_API_URL || DEFAULT_TRAIL_API_URL)
    .action(async (idArg: string | undefined, opts: {
      all: boolean;
      latest: boolean;
      yes: boolean;
      copy: boolean;
      dryRun: boolean;
      preview: boolean;
      promptsOnly: boolean;
      diffs: boolean;
      toolArgs: boolean;
      allowSuspects: boolean;
      baseUrl: string;
    }) => {
      // Treat a literal `trail share latest` subcommand the same as --latest.
      let id = idArg;
      let latest = opts.latest;
      if (id === "latest") {
        id = undefined;
        latest = true;
      }
      if (opts.all && id) {
        console.error(chalk.red("✗"), "--all and <id> are mutually exclusive");
        process.exit(1);
      }
      if (latest && (opts.all || id)) {
        console.error(chalk.red("✗"), "--latest is mutually exclusive with --all and <id>");
        process.exit(1);
      }
      if (!opts.all && !latest && !id) {
        console.error(chalk.red("✗"), "missing session <id> (or pass --all / --latest / `share latest`)");
        process.exit(1);
      }

      if (opts.all) {
        await runBulkShare(opts);
        return;
      }
      if (latest) {
        const latestId = getLatestLocalSessionId();
        if (!latestId) {
          console.error(chalk.red("✗"), "no local sessions found");
          process.exit(1);
        }
        console.log(chalk.dim("latest:"), chalk.cyan(latestId));
        id = latestId;
      }
      const sid = id as string;
      const loaded = loadLocalSession(sid);
      if (!loaded) {
        console.error(chalk.red("✗"), `no local session with id ${id}`);
        process.exit(1);
      }
      const { session, alreadyRedacted } = loaded;

      // Commander negates --no-* flags into positive booleans (opts.diffs = true means diffs allowed).
      const scoped = applyScopeFilters(session, {
        promptsOnly: opts.promptsOnly,
        noDiffs: !opts.diffs,
        noToolArgs: !opts.toolArgs,
      });

      // Capture-time redaction (Task 4) is the primary defense; this second
      // anonymize() pass is a fallback for sessions captured pre-redaction.
      // For redacted-at-capture rows it will be a near no-op (idempotent).
      const { session: scrubbed, report } = anonymize(scoped);
      // The breakdown recorded at capture is the real removal event (Trail
      // scrubs on write). Prefer it for every display surface; fall back to the
      // live pass for legacy rows that have no stored breakdown.
      const captureReport = loadCaptureReport(sid);
      const displayReport =
        captureReport && captureReport.total > 0
          ? {
              total: captureReport.total,
              byCategory: captureReport.byCategory,
              categories: captureReport.categories,
              suspects: report.suspects,
            }
          : report;
      if (alreadyRedacted) {
        console.log(chalk.dim("scrub"), "session already redacted at capture-time");
      }
      console.log(
        chalk.cyan("scrub"),
        `${displayReport.total} redactions:`,
        Object.entries(displayReport.byCategory)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `${n} ${k}`)
          .join(", ") || "none",
      );
      if (report.suspects.length > 0) {
        console.log(
          chalk.yellow("entropy"),
          `${report.suspects.length} suspicious token(s) found — server will hold this session in pending review`,
        );
        if (!opts.allowSuspects) {
          console.log(
            chalk.dim("       pass --allow-suspects after manually reviewing to publish directly"),
          );
        }
      }

      // Auditable, human-readable breakdown of exactly what was stripped.
      // Printed on --dry-run and before the interactive confirm so the user can
      // trust the scrub before anything leaves their machine. Skipped under
      // --yes (an explicit, non-interactive opt-out of review).
      if (opts.dryRun || !opts.yes) {
        printShareRedactionPreview(captureReport, report, alreadyRedacted);
      }

      if (opts.dryRun) {
        console.log(chalk.yellow("--dry-run: not uploading. Anonymized payload:"));
        console.log(JSON.stringify(scrubbed, null, 2));
        return;
      }

      // Browser preview (default on, unless --no-preview or --yes was set).
      if (opts.preview && !opts.yes) {
        const previewPath = path.join(tmpdir(), `trail-preview-${session.id.slice(0, 8)}-${Date.now()}.html`);
        writeFileSync(previewPath, renderPreviewHtml(session, scrubbed, displayReport), "utf8");
        console.log(chalk.dim("preview:"), previewPath);
        openInBrowser(previewPath);
      }

      if (!opts.yes) {
        const proceed = await confirm("Upload anonymized session?");
        if (!proceed) {
          console.log(chalk.yellow("aborted"));
          return;
        }
      }

      const cookie = getAuthCookie();
      if (!cookie) {
        console.error(chalk.red("✗"), "not logged in — run `trail login` first");
        process.exit(1);
      }

      // Best-effort GitHub linkage — populates "Shipped in <repo>@<sha>" pill
      // on the published session. Never blocks upload.
      const git = detectGitContext();
      const linkHeaders: Record<string, string> = {};
      if (git.repo) linkHeaders["x-trail-linked-repo"] = git.repo;
      if (git.commitSha) linkHeaders["x-trail-linked-commit"] = git.commitSha;
      if (git.repoUrl && git.commitSha) {
        linkHeaders["x-trail-linked-commit-url"] = `${git.repoUrl}/commit/${git.commitSha}`;
      }
      printLinkageFeedback(git);

      const client = createTrailClient({
        baseUrl: opts.baseUrl,
        getAuthCookie: () => cookie,
        extraHeaders: {
          ...(opts.allowSuspects ? { "x-trail-allow-suspects": "true" } : {}),
          ...linkHeaders,
        },
      });
      const result = await client.uploadSession(scrubbed);

      if (!result.ok) {
        switch (result.error.kind) {
          case "unauthenticated":
            clearAuth();
            console.error(chalk.red("✗"), "auth expired — run `trail login` again");
            break;
          case "invalid-session":
            console.error(chalk.red("✗"), "server rejected the session as invalid:");
            console.error(JSON.stringify(result.error.issues, null, 2));
            break;
          case "network":
            console.error(chalk.red("✗"), `network error: ${result.error.message}`);
            break;
          case "server":
            console.error(chalk.red("✗"), `server error (${result.error.status}): ${result.error.message}`);
            break;
          case "bad-response":
            console.error(chalk.red("✗"), `bad server response: ${result.error.message}`);
            break;
        }
        process.exit(1);
      }

      db.prepare(`UPDATE sessions SET share_slug = ? WHERE id = ?`).run(result.value.slug, sid);

      const r = result.value as { url: string; slug: string; visibility?: string; pendingReviewReasons?: string[]; profileUrl?: string; receiptStatus?: "shipped" | "draft" | "unverified" };
      console.log(chalk.green("✓"), "Receipt created:", r.url);
      console.log(chalk.dim("Status:"), formatReceiptStatus(r.receiptStatus));
      if (r.visibility === "pending" && r.pendingReviewReasons?.length) {
        console.log(chalk.yellow("hold:"), "session is in pending review:");
        for (const reason of r.pendingReviewReasons) {
          console.log(chalk.dim("       -"), reason);
        }
        console.log(chalk.dim("       confirm at " + r.url + "/settings  (coming soon)"));
      }
      printBadgeNudge(r, git);
      if (opts.copy) {
        const ok = copyToClipboard(r.url);
        console.log(ok ? chalk.dim("(copied to clipboard)") : chalk.dim("(pbcopy not available)"));
      }
    });
}
