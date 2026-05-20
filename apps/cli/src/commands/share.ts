import { Command } from "commander";
import chalk from "chalk";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { Session, type Session as SessionT } from "@trail/schema";
import { anonymize, type EntropySuspect } from "@trail/anonymize";
import { createTrailClient, DEFAULT_TRAIL_API_URL } from "@trail/client";
import { db } from "../db.js";
import { getAuthCookie, clearAuth } from "../lib/auth-storage.js";

interface SessionRow {
  id: string;
  user: string;
  tool: string;
  startedAt: string;
  endedAt: string | null;
  repo: string | null;
}

function loadLocalSession(id: string): SessionT | null {
  const row = db
    .prepare(
      `SELECT id, user, tool, started_at AS startedAt, ended_at AS endedAt, repo
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
  return Session.parse(built);
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

function renderPreviewHtml(
  original: SessionT,
  scrubbed: SessionT,
  report: { total: number; byCategory: Record<string, number>; suspects: EntropySuspect[] },
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
  .warn{color:#fbbf24}
  .ok{color:#a7f300}
</style></head>
<body>
<h1>Trail · share preview</h1>
<div class="meta">${report.total} redactions applied · ${cats || '<span class="ok">no named matches</span>'}</div>

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

export function shareCommand(): Command {
  return new Command("share")
    .description("Anonymize and upload a session, returning a public URL")
    .argument("<id>", "session id from `trail view` / SQLite")
    .option("--yes", "skip confirmation prompt", false)
    .option("--copy", "copy the resulting URL to the clipboard (macOS pbcopy)", false)
    .option("--dry-run", "anonymize + print what would be uploaded; do not upload", false)
    .option("--no-preview", "skip the browser preview confirmation step")
    .option("--prompts-only", "drop tool_call args and file_diff blobs; share only prompts+decisions", false)
    .option("--no-diffs", "drop file_diff events", false)
    .option("--no-tool-args", "drop tool_call args+results (keep tool names)", false)
    .option("--allow-suspects", "publish even if the entropy guard found unknown high-entropy tokens", false)
    .option("--base-url <url>", "Trail web base URL", process.env.TRAIL_API_URL || DEFAULT_TRAIL_API_URL)
    .action(async (id: string, opts: {
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
      const session = loadLocalSession(id);
      if (!session) {
        console.error(chalk.red("✗"), `no local session with id ${id}`);
        process.exit(1);
      }

      // Commander negates --no-* flags into positive booleans (opts.diffs = true means diffs allowed).
      const scoped = applyScopeFilters(session, {
        promptsOnly: opts.promptsOnly,
        noDiffs: !opts.diffs,
        noToolArgs: !opts.toolArgs,
      });

      const { session: scrubbed, report } = anonymize(scoped);
      console.log(
        chalk.cyan("scrub"),
        `${report.total} redactions:`,
        Object.entries(report.byCategory)
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

      if (opts.dryRun) {
        console.log(chalk.yellow("--dry-run: not uploading. Anonymized payload:"));
        console.log(JSON.stringify(scrubbed, null, 2));
        return;
      }

      // Browser preview (default on, unless --no-preview or --yes was set).
      if (opts.preview && !opts.yes) {
        const previewPath = path.join(tmpdir(), `trail-preview-${session.id.slice(0, 8)}-${Date.now()}.html`);
        writeFileSync(previewPath, renderPreviewHtml(session, scrubbed, report), "utf8");
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

      const client = createTrailClient({
        baseUrl: opts.baseUrl,
        getAuthCookie: () => cookie,
        extraHeaders: opts.allowSuspects ? { "x-trail-allow-suspects": "true" } : undefined,
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

      db.prepare(`UPDATE sessions SET share_slug = ? WHERE id = ?`).run(result.value.slug, id);

      const r = result.value as { url: string; slug: string; visibility?: string; pendingReviewReasons?: string[] };
      console.log(chalk.green("✓"), r.url);
      if (r.visibility === "pending" && r.pendingReviewReasons?.length) {
        console.log(chalk.yellow("hold:"), "session is in pending review:");
        for (const reason of r.pendingReviewReasons) {
          console.log(chalk.dim("       -"), reason);
        }
        console.log(chalk.dim("       confirm at " + r.url + "/settings  (coming soon)"));
      }
      if (opts.copy) {
        const ok = copyToClipboard(r.url);
        console.log(ok ? chalk.dim("(copied to clipboard)") : chalk.dim("(pbcopy not available)"));
      }
    });
}
