import { Command } from "commander";
import chalk from "chalk";
import { db } from "../db.js";

interface SessionRow {
  id: string;
  tool: string;
  started_at: string;
  event_count: number;
  first_prompt: string | null;
}

const PREVIEW_MAX = 60;

function truncate(text: string, max: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max - 1) + "…";
}

function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 12) : id;
}

function listSessions(limit: number): SessionRow[] {
  return db
    .prepare(
      `SELECT s.id AS id,
              s.tool AS tool,
              s.started_at AS started_at,
              (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id) AS event_count,
              (SELECT json_extract(e.payload, '$.text')
                 FROM events e
                 WHERE e.session_id = s.id AND e.kind = 'prompt'
                 ORDER BY e.at ASC, e.id ASC
                 LIMIT 1) AS first_prompt
       FROM sessions s
       ORDER BY s.started_at DESC
       LIMIT ?`,
    )
    .all(limit) as SessionRow[];
}

export function listCommand(): Command {
  return new Command("list")
    .description("List recent recorded sessions (most recent first)")
    .option("-n, --limit <n>", "max sessions to show", "20")
    .option("--json", "output as JSON", false)
    .action((opts: { limit: string; json: boolean }) => {
      const limit = Math.max(1, Number.parseInt(opts.limit, 10) || 20);
      const rows = listSessions(limit);

      if (opts.json) {
        console.log(
          JSON.stringify(
            rows.map((r) => ({
              id: r.id,
              shortId: shortId(r.id),
              tool: r.tool,
              startedAt: r.started_at,
              eventCount: r.event_count,
              firstPrompt: r.first_prompt,
            })),
            null,
            2,
          ),
        );
        return;
      }

      if (rows.length === 0) {
        console.log(chalk.yellow("no sessions recorded yet"));
        return;
      }

      for (const r of rows) {
        const preview = r.first_prompt ? truncate(r.first_prompt, PREVIEW_MAX) : chalk.dim("(no prompt)");
        console.log(
          chalk.cyan(shortId(r.id)),
          chalk.dim(r.started_at),
          chalk.magenta(r.tool),
          chalk.dim(`${r.event_count} ev`),
        );
        console.log("  " + preview);
      }
    });
}
