import { Command } from "commander";
import chalk from "chalk";
import { db } from "../db.js";

const DAY_MS = 86_400_000;

export interface RecapRow {
  id: string;
  tool: string;
  startedAt: string;
  repo: string | null;
  events: number;
  prompts: number;
  completions: number;
  toolCalls: number;
  fileDiffs: number;
  decisions: number;
  inputTokens: number;
  outputTokens: number;
}

export interface RecapStats {
  sessionCount: number;
  eventTotal: number;
  kinds: {
    prompt: number;
    completion: number;
    tool_call: number;
    file_diff: number;
    decision: number;
  };
  tokens: { input: number; output: number };
  tools: Array<{ tool: string; count: number }>;
  repos: string[];
  firstAt: string | null;
  lastAt: string | null;
  busiest: { id: string; events: number } | null;
}

function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 12) : id;
}

function humanCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

function fmtDate(at: string): string {
  const ms = Date.parse(at);
  if (Number.isNaN(ms)) return at.slice(0, 10);
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Fold per-session rows into recap totals. Pure so it can be unit-tested
 * without a database. Tools are returned most-used first; repos are the
 * distinct non-empty repositories touched.
 */
export function summarizeRecap(rows: RecapRow[]): RecapStats {
  const kinds = { prompt: 0, completion: 0, tool_call: 0, file_diff: 0, decision: 0 };
  const tokens = { input: 0, output: 0 };
  const toolCounts = new Map<string, number>();
  const repos = new Set<string>();
  let eventTotal = 0;
  let firstAt: string | null = null;
  let lastAt: string | null = null;
  let busiest: { id: string; events: number } | null = null;

  for (const r of rows) {
    kinds.prompt += r.prompts;
    kinds.completion += r.completions;
    kinds.tool_call += r.toolCalls;
    kinds.file_diff += r.fileDiffs;
    kinds.decision += r.decisions;
    tokens.input += r.inputTokens;
    tokens.output += r.outputTokens;
    eventTotal += r.events;

    toolCounts.set(r.tool, (toolCounts.get(r.tool) ?? 0) + 1);
    if (r.repo && r.repo.trim().length > 0) repos.add(r.repo);

    if (firstAt === null || r.startedAt < firstAt) firstAt = r.startedAt;
    if (lastAt === null || r.startedAt > lastAt) lastAt = r.startedAt;
    if (!busiest || r.events > busiest.events) busiest = { id: r.id, events: r.events };
  }

  const tools = [...toolCounts.entries()]
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count || a.tool.localeCompare(b.tool));

  return {
    sessionCount: rows.length,
    eventTotal,
    kinds,
    tokens,
    tools,
    repos: [...repos].sort(),
    firstAt,
    lastAt,
    busiest,
  };
}

function fetchRecapRows(sinceIso: string | null): RecapRow[] {
  const where = sinceIso ? "WHERE s.started_at >= ?" : "";
  const sql = `
    SELECT s.id AS id, s.tool AS tool, s.started_at AS startedAt, s.repo AS repo,
           COUNT(e.id) AS events,
           COALESCE(SUM(e.kind = 'prompt'), 0) AS prompts,
           COALESCE(SUM(e.kind = 'completion'), 0) AS completions,
           COALESCE(SUM(e.kind = 'tool_call'), 0) AS toolCalls,
           COALESCE(SUM(e.kind = 'file_diff'), 0) AS fileDiffs,
           COALESCE(SUM(e.kind = 'decision'), 0) AS decisions,
           COALESCE(SUM(json_extract(e.payload, '$.inputTokens')), 0) AS inputTokens,
           COALESCE(SUM(json_extract(e.payload, '$.outputTokens')), 0) AS outputTokens
    FROM sessions s
    LEFT JOIN events e ON e.session_id = s.id
    ${where}
    GROUP BY s.id
    ORDER BY s.started_at DESC`;
  const stmt = db.prepare(sql);
  return (sinceIso ? stmt.all(sinceIso) : stmt.all()) as RecapRow[];
}

/** Fetch + summarize local sessions, optionally limited to the last `days`. */
export function computeRecap(days: number | null, now: number = Date.now()): RecapStats {
  const sinceIso = days != null ? new Date(now - days * DAY_MS).toISOString() : null;
  return summarizeRecap(fetchRecapRows(sinceIso));
}

function periodLabel(days: number | null, stats: RecapStats): string {
  if (days === 7) return "last 7 days";
  if (days != null) return `last ${days} days`;
  if (stats.firstAt && stats.lastAt) {
    return `all time · ${fmtDate(stats.firstAt)} → ${fmtDate(stats.lastAt)}`;
  }
  return "all time";
}

/** Build the printable recap text (without trailing newline). */
export function formatRecap(stats: RecapStats, days: number | null): string {
  const out: string[] = [];
  out.push(chalk.bold("trail recap"), chalk.dim(periodLabel(days, stats)), "");

  if (stats.sessionCount === 0) {
    out.push(chalk.yellow("no sessions in this period"));
    out.push(chalk.dim("capture some with `trail record` or `trail daemon install`."));
    return out.join("\n");
  }

  out.push(
    `${chalk.cyan(String(stats.sessionCount))} session${stats.sessionCount === 1 ? "" : "s"}  ${chalk.dim(
      `${humanCount(stats.eventTotal)} events`,
    )}`,
  );

  out.push("");
  out.push(chalk.bold("tools"));
  for (const t of stats.tools) {
    out.push(`  ${chalk.magenta(t.tool.padEnd(14, " "))} ${chalk.dim(`${t.count}`)}`);
  }

  out.push("");
  out.push(chalk.bold("activity"));
  const k = stats.kinds;
  out.push(`  ${chalk.dim("prompts")}      ${humanCount(k.prompt)}`);
  out.push(`  ${chalk.dim("replies")}      ${humanCount(k.completion)}`);
  out.push(`  ${chalk.dim("tool calls")}   ${humanCount(k.tool_call)}`);
  out.push(`  ${chalk.dim("file edits")}   ${humanCount(k.file_diff)}`);
  out.push(`  ${chalk.dim("decisions")}    ${humanCount(k.decision)}`);

  if (stats.tokens.input > 0 || stats.tokens.output > 0) {
    out.push("");
    out.push(chalk.bold("tokens"));
    out.push(
      `  ${chalk.green(humanCount(stats.tokens.input))} in  /  ${chalk.green(
        humanCount(stats.tokens.output),
      )} out`,
    );
  }

  if (stats.repos.length > 0) {
    out.push("");
    out.push(chalk.bold(`repos (${stats.repos.length})`));
    for (const repo of stats.repos.slice(0, 10)) out.push(`  ${chalk.dim(repo)}`);
    if (stats.repos.length > 10) {
      out.push(chalk.dim(`  … and ${stats.repos.length - 10} more`));
    }
  }

  if (stats.busiest) {
    out.push("");
    out.push(
      chalk.dim(`busiest session: ${shortId(stats.busiest.id)} (${stats.busiest.events} events)`),
    );
  }

  return out.join("\n");
}

export function recapCommand(): Command {
  return new Command("recap")
    .description("Private local summary of what you shipped (sessions, tools, totals)")
    .option("--week", "limit to the last 7 days", false)
    .option("--days <n>", "limit to the last N days")
    .option("--json", "output the recap as JSON", false)
    .action((opts: { week: boolean; days?: string; json: boolean }) => {
      let days: number | null = null;
      if (opts.days !== undefined) {
        const parsed = Number.parseInt(opts.days, 10);
        if (!Number.isInteger(parsed) || parsed < 1) {
          console.error(chalk.red("✗"), `--days must be a positive integer (got "${opts.days}")`);
          process.exit(1);
          return;
        }
        days = parsed;
      } else if (opts.week) {
        days = 7;
      }

      const stats = computeRecap(days);

      if (opts.json) {
        console.log(JSON.stringify({ period: { days }, ...stats }, null, 2));
        return;
      }

      console.log(formatRecap(stats, days));
    });
}
