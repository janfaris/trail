import { Command } from "commander";
import chalk from "chalk";
import type { Event } from "@trail/schema";
import { db } from "../db.js";
import { lineDiff } from "../lib/line-diff.js";

// Per-block / per-diff render caps so `show` never dumps a 10k-line file into
// the terminal. The timeline stays scannable; full bodies stay bounded.
const MAX_BLOCK_LINES = 200;
const MAX_DIFF_LINES = 200;

export interface SessionRow {
  id: string;
  user: string;
  tool: string;
  startedAt: string;
  endedAt: string | null;
  repo: string | null;
}

export interface ResolveResult {
  session?: SessionRow;
  candidates?: string[];
}

interface KindMeta {
  glyph: string;
  label: string;
  color: (s: string) => string;
}

const KIND_META: Record<string, KindMeta> = {
  prompt: { glyph: "›", label: "prompt", color: chalk.cyan },
  completion: { glyph: "‹", label: "reply", color: chalk.green },
  tool_call: { glyph: "⚙", label: "tool", color: chalk.magenta },
  file_diff: { glyph: "±", label: "edit", color: chalk.yellow },
  decision: { glyph: "•", label: "note", color: chalk.blue },
};

function metaFor(kind: string): KindMeta {
  return KIND_META[kind] ?? { glyph: "·", label: kind, color: (s: string) => s };
}

function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 12) : id;
}

function firstLine(text: string): string {
  const idx = text.indexOf("\n");
  return idx === -1 ? text : text.slice(0, idx);
}

function truncate(text: string, max: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

function timeOf(at: string): string {
  const ms = Date.parse(at);
  if (Number.isNaN(ms)) return "--:--:--";
  return new Date(ms).toISOString().slice(11, 19);
}

function fmtDateTime(at: string): string {
  const ms = Date.parse(at);
  if (Number.isNaN(ms)) return at;
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}

function humanCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

function formatDuration(startedAt: string, endedAt: string): string {
  const a = Date.parse(startedAt);
  const b = Date.parse(endedAt);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return "";
  const sec = Math.round((b - a) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

/** Resolve an exact id, or a unique short prefix, to a session row. */
export function resolveSession(idOrPrefix: string): ResolveResult {
  const cols = "id, user, tool, started_at AS startedAt, ended_at AS endedAt, repo FROM sessions";
  const exact = db.prepare(`SELECT ${cols} WHERE id = ?`).get(idOrPrefix) as SessionRow | undefined;
  if (exact) return { session: exact };
  const rows = db
    .prepare(`SELECT ${cols} WHERE id LIKE ? ORDER BY started_at DESC`)
    .all(`${idOrPrefix}%`) as SessionRow[];
  if (rows.length === 0) return {};
  const only = rows[0];
  if (rows.length === 1 && only) return { session: only };
  return { candidates: rows.map((r) => r.id) };
}

/** Load and parse a session's events in chronological order. */
export function loadEvents(sessionId: string): Event[] {
  const rows = db
    .prepare("SELECT payload FROM events WHERE session_id = ? ORDER BY id ASC")
    .all(sessionId) as Array<{ payload: string }>;
  const events: Event[] = [];
  for (const r of rows) {
    try {
      events.push(JSON.parse(r.payload) as Event);
    } catch {
      // Skip a corrupt row rather than abort the whole replay.
    }
  }
  return events;
}

function summarizeArgs(args: unknown): string {
  if (args == null) return "";
  if (typeof args === "string") return truncate(firstLine(args), 60);
  if (typeof args === "object") {
    const o = args as Record<string, unknown>;
    for (const key of [
      "command",
      "cmd",
      "file_path",
      "filePath",
      "path",
      "pattern",
      "query",
      "url",
    ]) {
      const v = o[key];
      if (typeof v === "string" && v.length > 0) return truncate(firstLine(v), 60);
    }
    try {
      return truncate(JSON.stringify(args), 60);
    } catch {
      return "";
    }
  }
  return truncate(String(args), 60);
}

/** One-line, human summary of an event for the scannable timeline. */
export function eventSummary(ev: Event): string {
  switch (ev.kind) {
    case "prompt":
    case "completion":
      return truncate(firstLine(ev.text) || "(empty)", 88);
    case "decision":
      return truncate(firstLine(ev.note) || "(empty)", 88);
    case "tool_call": {
      const arg = summarizeArgs(ev.args);
      return arg ? `${ev.name} ${chalk.dim(arg)}` : ev.name;
    }
    case "file_diff": {
      const { added, removed } = lineDiff(ev.before, ev.after);
      return `${ev.path} ${chalk.green(`+${added}`)} ${chalk.red(`−${removed}`)}`;
    }
    default:
      return "";
  }
}

function tokenLine(ev: Event): string {
  const parts: string[] = [];
  if (ev.model) parts.push(ev.model);
  const io: string[] = [];
  if (ev.inputTokens != null) io.push(`${humanCount(ev.inputTokens)} in`);
  if (ev.outputTokens != null) io.push(`${humanCount(ev.outputTokens)} out`);
  if (io.length) parts.push(io.join(" / "));
  return parts.join(" · ");
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function block(text: string, indent: string): string[] {
  const raw = text.length === 0 ? ["(empty)"] : text.split("\n");
  const shown = raw.slice(0, MAX_BLOCK_LINES).map((l) => indent + l);
  if (raw.length > MAX_BLOCK_LINES) {
    shown.push(indent + chalk.dim(`… ${raw.length - MAX_BLOCK_LINES} more lines`));
  }
  return shown;
}

function renderDiff(before: string, after: string, indent: string): string[] {
  const d = lineDiff(before, after);
  const out: string[] = [];
  out.push(
    `${indent}${chalk.green(`+${d.added}`)} ${chalk.red(`−${d.removed}`)}${
      d.truncated ? chalk.dim(" (large file, counts approximate)") : ""
    }`,
  );
  const changed = d.lines.filter((l) => l.type !== "ctx");
  const shown = changed.slice(0, MAX_DIFF_LINES);
  for (const l of shown) {
    out.push(
      l.type === "add" ? indent + chalk.green(`+ ${l.text}`) : indent + chalk.red(`− ${l.text}`),
    );
  }
  if (changed.length > shown.length) {
    out.push(indent + chalk.dim(`… ${changed.length - shown.length} more changed lines`));
  }
  return out;
}

function eventHeaderLine(ev: Event, index: number, width: number): string {
  const meta = metaFor(ev.kind);
  const idx = chalk.dim(`[${String(index + 1).padStart(width, " ")}]`);
  const time = chalk.dim(timeOf(ev.at));
  const label = meta.color(`${meta.glyph} ${meta.label.padEnd(6, " ")}`);
  return `${idx} ${time} ${label} ${eventSummary(ev)}`;
}

function eventBodyLines(ev: Event): string[] {
  const indent = "      ";
  const lines: string[] = [];
  const tokens = tokenLine(ev);
  if (tokens) lines.push(indent + chalk.dim(tokens));
  switch (ev.kind) {
    case "prompt":
    case "completion":
      lines.push(...block(ev.text, indent));
      break;
    case "decision":
      lines.push(...block(ev.note, indent));
      break;
    case "tool_call":
      lines.push(`${indent}${chalk.bold(ev.name)}`);
      if (ev.args !== undefined) {
        lines.push(`${indent}${chalk.dim("args:")}`);
        lines.push(...block(prettyJson(ev.args), `${indent}  `));
      }
      if (ev.result !== undefined) {
        lines.push(`${indent}${chalk.dim("result:")}`);
        lines.push(...block(prettyJson(ev.result), `${indent}  `));
      }
      break;
    case "file_diff":
      lines.push(`${indent}${chalk.bold(ev.path)}`);
      lines.push(...renderDiff(ev.before, ev.after, indent));
      break;
  }
  return lines;
}

function countKinds(events: Event[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const ev of events) counts[ev.kind] = (counts[ev.kind] ?? 0) + 1;
  return counts;
}

function summarizeCounts(counts: Record<string, number>): string {
  const order = ["prompt", "completion", "tool_call", "file_diff", "decision"];
  const parts: string[] = [];
  for (const k of order) {
    const n = counts[k];
    if (n) parts.push(`${n} ${metaFor(k).label}${n === 1 ? "" : "s"}`);
  }
  return parts.join("  ");
}

function renderHeader(session: SessionRow, events: Event[]): string[] {
  const last = events[events.length - 1];
  const ended = session.endedAt ?? last?.at ?? session.startedAt;
  const dur = formatDuration(session.startedAt, ended);
  const lines: string[] = [];
  lines.push(chalk.bold(session.id));
  lines.push(
    `${chalk.magenta(session.tool)}  ${chalk.dim(fmtDateTime(session.startedAt))}  ${chalk.dim(
      `${events.length} event${events.length === 1 ? "" : "s"}`,
    )}${dur ? chalk.dim(`  ${dur}`) : ""}`,
  );
  if (session.repo) lines.push(chalk.dim(session.repo));
  const counts = summarizeCounts(countKinds(events));
  if (counts) lines.push(chalk.dim(counts));
  return lines;
}

/** Render the scannable one-line-per-event timeline. */
export function renderTimeline(session: SessionRow, events: Event[]): string {
  const out = renderHeader(session, events);
  out.push("");
  if (events.length === 0) {
    out.push(chalk.dim("(no events recorded)"));
    return out.join("\n");
  }
  const width = String(events.length).length;
  events.forEach((ev, i) => out.push(eventHeaderLine(ev, i, width)));
  out.push("");
  out.push(chalk.dim(`jump to an event:  trail show ${shortId(session.id)} --event <n>`));
  out.push(chalk.dim(`expand everything: trail show ${shortId(session.id)} --full`));
  return out.join("\n");
}

/** Render the full replay: every event header followed by its full body. */
export function renderFull(session: SessionRow, events: Event[]): string {
  const out = renderHeader(session, events);
  out.push("");
  if (events.length === 0) {
    out.push(chalk.dim("(no events recorded)"));
    return out.join("\n");
  }
  const width = String(events.length).length;
  events.forEach((ev, i) => {
    out.push(eventHeaderLine(ev, i, width));
    out.push(...eventBodyLines(ev));
    out.push("");
  });
  return out.join("\n").trimEnd();
}

/** Render a single event in full detail (used by `--event <n>`). */
export function renderSingleEvent(session: SessionRow, events: Event[], n: number): string {
  const ev = events[n - 1];
  if (!ev) return chalk.yellow(`event ${n} not found`);
  const out: string[] = [];
  out.push(chalk.dim(`${shortId(session.id)} · event ${n}/${events.length}`));
  out.push(eventHeaderLine(ev, n - 1, String(events.length).length));
  out.push(...eventBodyLines(ev));
  return out.join("\n");
}

export function showCommand(): Command {
  return new Command("show")
    .description("Replay a recorded session's timeline in the terminal")
    .argument("<id>", "session id or short prefix")
    .option("-e, --event <n>", "jump to a single event and show it in full")
    .option("--full", "expand every event (full prompts, diffs, tool I/O)", false)
    .option("--json", "output the parsed session as JSON", false)
    .action((id: string, opts: { event?: string; full: boolean; json: boolean }) => {
      const { session, candidates } = resolveSession(id);
      if (!session) {
        if (candidates && candidates.length > 0) {
          console.error(
            chalk.red("✗"),
            `prefix "${id}" is ambiguous (${candidates.length} matches):`,
          );
          for (const c of candidates.slice(0, 10)) console.error("  ", chalk.cyan(shortId(c)));
        } else {
          console.error(chalk.red("✗"), `no session matches "${id}"`);
        }
        process.exit(1);
        return;
      }

      const events = loadEvents(session.id);

      if (opts.json) {
        console.log(JSON.stringify({ ...session, events }, null, 2));
        return;
      }

      if (opts.event !== undefined) {
        const n = Number.parseInt(opts.event, 10);
        if (!Number.isInteger(n) || n < 1 || n > events.length) {
          console.error(chalk.red("✗"), `event "${opts.event}" out of range (1–${events.length})`);
          process.exit(1);
          return;
        }
        console.log(renderSingleEvent(session, events, n));
        return;
      }

      console.log(opts.full ? renderFull(session, events) : renderTimeline(session, events));
    });
}
