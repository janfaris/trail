import { Command } from "commander";
import chalk from "chalk";
import { db } from "../db.js";
import { DEFAULT_TRAIL_API_URL } from "@trail/client";
import { getAuthCookie } from "../lib/auth-storage.js";

// Local ranking blends FTS5 relevance (bm25) with a recency bonus so that a
// strong textual match still beats a weak-but-recent one, while same-relevance
// hits surface the freshest session first. bm25 is negative-better in SQLite,
// so we use `relevance = -bm25` (higher = better) and add an exponentially
// decaying recency term on top.
const RECENCY_HALF_LIFE_DAYS = 14;
const RECENCY_WEIGHT = 2;
// Cap the rows pulled out of SQLite before JS-side dedupe/rank. Keeps `search`
// instant even when a common term matches thousands of events.
const INTERNAL_ROW_CAP = 500;
const DAY_MS = 86_400_000;

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

export interface LocalSearchHit {
  sessionId: string;
  shortId: string;
  tool: string;
  startedAt: string;
  repo: string | null;
  title: string | null;
  snippet: string;
  score: number;
  relevance: number;
}

interface RawHit {
  sessionId: string;
  bm25: number;
  snippet: string;
  tool: string;
  startedAt: string;
  repo: string | null;
}

function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 12) : id;
}

function truncate(text: string, max: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

function fmtDate(startedAt: string): string {
  const ms = Date.parse(startedAt);
  if (Number.isNaN(ms)) return startedAt.slice(0, 10);
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Build a syntactically-safe FTS5 MATCH expression from arbitrary user input.
 * Splits on anything that isn't a letter/number/underscore, wraps each token in
 * double quotes (so stray punctuation or operator characters can't trigger an
 * FTS5 syntax error), and ANDs them implicitly. Returns "" when there are no
 * searchable tokens.
 */
export function sanitizeFtsQuery(query: string): string {
  const tokens = query.match(/[\p{L}\p{N}_]+/gu);
  if (!tokens || tokens.length === 0) return "";
  return tokens.map((t) => `"${t}"`).join(" ");
}

/** Exponentially-decaying recency bonus added to a hit's textual relevance. */
export function recencyBonus(startedAt: string, now: number): number {
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return 0;
  const ageDays = Math.max(0, (now - started) / DAY_MS);
  return RECENCY_WEIGHT * Math.exp(-ageDays / RECENCY_HALF_LIFE_DAYS);
}

/**
 * Collapse per-event matches down to the best hit per session, then rank by a
 * relevance+recency score (highest first, newest as tiebreak). Pure so it can
 * be unit-tested without a database.
 */
export function rankSessionHits(raw: RawHit[], now: number): LocalSearchHit[] {
  const best = new Map<string, RawHit>();
  for (const h of raw) {
    const prev = best.get(h.sessionId);
    if (!prev || h.bm25 < prev.bm25) best.set(h.sessionId, h);
  }

  const hits: LocalSearchHit[] = [];
  for (const h of best.values()) {
    const relevance = -h.bm25;
    hits.push({
      sessionId: h.sessionId,
      shortId: shortId(h.sessionId),
      tool: h.tool,
      startedAt: h.startedAt,
      repo: h.repo,
      title: null,
      snippet: h.snippet,
      relevance,
      score: relevance + recencyBonus(h.startedAt, now),
    });
  }

  hits.sort((a, b) => b.score - a.score || b.startedAt.localeCompare(a.startedAt));
  return hits;
}

function fetchRawHits(matchExpr: string): RawHit[] {
  return db
    .prepare(
      `SELECT f.session_id AS sessionId,
              bm25(events_fts) AS bm25,
              snippet(events_fts, 0, '[', ']', '…', 12) AS snippet,
              s.tool AS tool, s.started_at AS startedAt, s.repo AS repo
       FROM events_fts f
       JOIN sessions s ON s.id = f.session_id
       WHERE events_fts MATCH ?
       ORDER BY bm25
       LIMIT ?`,
    )
    .all(matchExpr, INTERNAL_ROW_CAP) as RawHit[];
}

function runFtsMatch(query: string): RawHit[] {
  // Try the raw query first so power users keep FTS5 syntax (OR, NEAR,
  // "quoted phrase", prefix*). Fall back to the sanitized AND-of-tokens form
  // when the raw expression is invalid FTS5 syntax (e.g. it contains a stray
  // `-`, `:` or unbalanced quote).
  try {
    return fetchRawHits(query);
  } catch {
    const safe = sanitizeFtsQuery(query);
    if (!safe) return [];
    try {
      return fetchRawHits(safe);
    } catch {
      return [];
    }
  }
}

/** Fill in each hit's session title (its first prompt) in a single query. */
function attachTitles(hits: LocalSearchHit[]): void {
  if (hits.length === 0) return;
  const ids = hits.map((h) => h.sessionId);
  const placeholders = ids.map(() => "?").join(",");
  // SQLite "bare column" rule: with MIN(at) the other selected columns come
  // from the matching (earliest) row, so json_extract reads the first prompt.
  const rows = db
    .prepare(
      `SELECT session_id AS sessionId,
              json_extract(payload, '$.text') AS title,
              MIN(at) AS firstAt
       FROM events
       WHERE session_id IN (${placeholders}) AND kind = 'prompt'
       GROUP BY session_id`,
    )
    .all(...ids) as Array<{ sessionId: string; title: string | null; firstAt: string }>;
  const titleById = new Map(rows.map((r) => [r.sessionId, r.title]));
  for (const h of hits) {
    h.title = titleById.get(h.sessionId) ?? null;
  }
}

/** Run the full local search pipeline: match → rank → trim → titles. */
export function runLocalSearch(
  query: string,
  limit: number,
  now: number = Date.now(),
): LocalSearchHit[] {
  const ranked = rankSessionHits(runFtsMatch(query), now).slice(0, limit);
  attachTitles(ranked);
  return ranked;
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
    console.log(`  ${chalk.bold(h.title)}`);
    if (h.summary) {
      console.log(`  ${chalk.gray(h.summary)}`);
    }
  }
}

function localSearch(query: string, limit: number, json: boolean): void {
  const hits = runLocalSearch(query, limit);

  if (json) {
    console.log(JSON.stringify(hits, null, 2));
    return;
  }

  if (hits.length === 0) {
    console.log(chalk.yellow("no matches"));
    return;
  }

  for (const h of hits) {
    console.log(
      chalk.cyan(h.shortId),
      chalk.dim(fmtDate(h.startedAt)),
      chalk.magenta(h.tool),
      h.repo ? chalk.dim(h.repo) : "",
    );
    if (h.title) {
      console.log(`  ${chalk.bold(truncate(h.title, 80))}`);
    }
    console.log(`  ${chalk.gray(h.snippet.replace(/\s+/g, " ").trim())}`);
  }
}

export function searchCommand(): Command {
  return new Command("search")
    .description(
      "Search recorded sessions (local FTS5 by default, --remote for semantic search across all public Trail sessions)",
    )
    .argument("<query>", "search query")
    .option("-n, --limit <n>", "max results", "20")
    .option("--json", "output results as JSON (local only)", false)
    .option(
      "--remote",
      "search across public sessions on the Trail server (semantic + literal)",
      false,
    )
    .option(
      "--base-url <url>",
      "Trail web base URL (--remote only)",
      process.env.TRAIL_API_URL || DEFAULT_TRAIL_API_URL,
    )
    .action(
      async (
        query: string,
        opts: { limit: string; remote: boolean; baseUrl: string; json: boolean },
      ) => {
        const limit = Math.max(1, Number.parseInt(opts.limit, 10) || 20);
        if (opts.remote) {
          await remoteSearch(opts.baseUrl, query, limit);
        } else {
          localSearch(query, limit, opts.json);
        }
      },
    );
}
