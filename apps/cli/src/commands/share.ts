import { Command } from "commander";
import chalk from "chalk";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { Session, type Session as SessionT } from "@trail/schema";
import { anonymize } from "@trail/anonymize";
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

export function shareCommand(): Command {
  return new Command("share")
    .description("Anonymize and upload a session, returning a public URL")
    .argument("<id>", "session id from `trail view` / SQLite")
    .option("--yes", "skip confirmation prompt", false)
    .option("--copy", "copy the resulting URL to the clipboard (macOS pbcopy)", false)
    .option("--dry-run", "anonymize + print what would be uploaded; do not upload", false)
    .option("--base-url <url>", "Trail web base URL", process.env.TRAIL_API_URL || DEFAULT_TRAIL_API_URL)
    .action(async (id: string, opts: { yes: boolean; copy: boolean; dryRun: boolean; baseUrl: string }) => {
      const session = loadLocalSession(id);
      if (!session) {
        console.error(chalk.red("✗"), `no local session with id ${id}`);
        process.exit(1);
      }

      const { session: scrubbed, report } = anonymize(session);
      console.log(
        chalk.cyan("scrub"),
        `${report.total} redactions:`,
        Object.entries(report.byCategory)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `${n} ${k}`)
          .join(", ") || "none",
      );

      if (opts.dryRun) {
        console.log(chalk.yellow("--dry-run: not uploading. Anonymized payload:"));
        console.log(JSON.stringify(scrubbed, null, 2));
        return;
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

      console.log(chalk.green("✓"), result.value.url);
      if (opts.copy) {
        const ok = copyToClipboard(result.value.url);
        console.log(ok ? chalk.dim("(copied to clipboard)") : chalk.dim("(pbcopy not available)"));
      }
    });
}
