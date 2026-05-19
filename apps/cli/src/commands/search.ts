import { Command } from "commander";
import chalk from "chalk";
import { db } from "../db.js";
import { DEFAULT_TRAIL_API_URL } from "@trail/client";
import { getAuthCookie } from "../lib/auth-storage.js";

interface RemoteHit {
  slug: string;
  handle: string;
  title: string;
  summary: string | null;
  score: number;
  tool: string;
  eventCount: number;
  startedAt: string;
}

async function remoteSearch(baseUrl: string, query: string, limit: number): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/search?q=${encodeURIComponent(query)}`;
  const cookie = getAuthCookie();
  const res = await fetch(url, {
    headers: cookie ? { Cookie: cookie } : undefined,
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(chalk.red("✗"), `remote search failed (${res.status}): ${body.slice(0, 200)}`);
    process.exit(1);
  }
  const data = (await res.json()) as { results: RemoteHit[] };
  const hits = data.results.slice(0, limit);
  if (hits.length === 0) {
    console.log(chalk.yellow("no matches"));
    return;
  }
  for (const h of hits) {
    const pct = (h.score * 100).toFixed(0).padStart(3, " ");
    console.log(
      chalk.dim(`${pct}%`),
      chalk.cyan(`@${h.handle}/${h.slug}`),
      chalk.magenta(h.tool),
      chalk.dim(`${h.eventCount} ev`),
      chalk.dim(new Date(h.startedAt).toISOString().slice(0, 10)),
    );
    console.log("  " + chalk.bold(h.title));
    if (h.summary) {
      console.log("  " + chalk.gray(h.summary));
    }
  }
}

function localSearch(query: string, limit: number): void {
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
}

export function searchCommand(): Command {
  return new Command("search")
    .description("Search recorded sessions (local FTS5 by default, --remote for semantic search across all public Trail sessions)")
    .argument("<query>", "search query")
    .option("-n, --limit <n>", "max results", "20")
    .option("--remote", "search across public sessions on the Trail server (semantic + literal)", false)
    .option(
      "--base-url <url>",
      "Trail web base URL (--remote only)",
      process.env.TRAIL_API_URL || DEFAULT_TRAIL_API_URL,
    )
    .action(async (query: string, opts: { limit: string; remote: boolean; baseUrl: string }) => {
      const limit = Math.max(1, Number.parseInt(opts.limit, 10) || 20);
      if (opts.remote) {
        await remoteSearch(opts.baseUrl, query, limit);
      } else {
        localSearch(query, limit);
      }
    });
}
