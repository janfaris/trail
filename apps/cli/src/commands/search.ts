import { Command } from "commander";
import chalk from "chalk";
import { db } from "../db.js";

export function searchCommand(): Command {
  return new Command("search")
    .description("Full-text search across recorded sessions")
    .argument("<query>", "search query")
    .option("-n, --limit <n>", "max results", "20")
    .action((query: string, opts: { limit: string }) => {
      const limit = Math.max(1, Number.parseInt(opts.limit, 10) || 20);
      const rows = db
        .prepare(
          `SELECT f.session_id AS session_id,
                  snippet(events_fts, 0, '[', ']', '…', 12) AS snip,
                  s.tool, s.started_at, s.repo
           FROM events_fts f
           JOIN sessions s ON s.id = f.session_id
           WHERE events_fts MATCH ?
           ORDER BY s.started_at DESC
           LIMIT ?`,
        )
        .all(query, limit) as Array<{
        session_id: string;
        snip: string;
        tool: string;
        started_at: string;
        repo: string | null;
      }>;

      if (rows.length === 0) {
        console.log(chalk.yellow("no matches"));
        return;
      }
      for (const r of rows) {
        console.log(
          chalk.cyan(r.session_id),
          chalk.dim(r.started_at),
          chalk.magenta(r.tool),
          r.repo ?? "",
        );
        console.log("  " + r.snip.replace(/\s+/g, " "));
      }
    });
}
