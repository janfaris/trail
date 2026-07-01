import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
// node:sqlite is built into Node 22+ (stable). We use the synchronous API
// (DatabaseSync / StatementSync) which uses the same SQLite C library that
// better-sqlite3 wraps — same engine, same perf, no native module to ship.
// This removes the prebuild-install footgun that was breaking `npm i -g`
// for new users on v0.1.0.
import { DatabaseSync, type StatementSync } from "node:sqlite";

const TRAIL_DIR = path.join(homedir(), ".trail");
mkdirSync(TRAIL_DIR, { recursive: true });
export const DB_PATH = path.join(TRAIL_DIR, "db.sqlite");

export const db = new DatabaseSync(DB_PATH);
// PRAGMA via exec — node:sqlite doesn't have a dedicated .pragma() helper.
// WAL is required for safe concurrent read while the daemon writes.
db.exec("PRAGMA journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user TEXT NOT NULL,
    tool TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    repo TEXT,
    summary TEXT,
    share_slug TEXT,
    source_path TEXT,
    redacted_at TEXT,
    redaction_count INTEGER,
    redaction_report TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    at TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
  CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
    payload, session_id UNINDEXED
  );
`);

// Idempotent migration for DBs created before redaction-at-capture landed.
for (const col of ["redacted_at TEXT", "redaction_count INTEGER", "redaction_report TEXT"]) {
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN ${col}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/duplicate column name/i.test(msg)) throw err;
  }
}

/**
 * Execute `fn` inside a SQLite transaction. better-sqlite3's
 * `db.transaction(fn)` helper isn't available in node:sqlite, so we wrap
 * BEGIN/COMMIT/ROLLBACK by hand. Synchronous — fn must not return a Promise.
 * Returns whatever fn returns. Re-throws after ROLLBACK on error.
 */
export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ROLLBACK after COMMIT is harmless; ROLLBACK after a failed BEGIN
      // would also be a no-op. Swallow so the original error surfaces.
    }
    throw err;
  }
}

import type { Session } from "@trail/schema";

const upsertSession: StatementSync = db.prepare(`
  INSERT INTO sessions (id, user, tool, started_at, ended_at, repo, source_path, redacted_at, redaction_count, redaction_report, updated_at)
  VALUES (@id, @user, @tool, @startedAt, @endedAt, @repo, @sourcePath, @redactedAt, @redactionCount, @redactionReport, datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    ended_at = excluded.ended_at,
    repo = COALESCE(excluded.repo, sessions.repo),
    redacted_at = excluded.redacted_at,
    redaction_count = excluded.redaction_count,
    redaction_report = excluded.redaction_report,
    updated_at = datetime('now')
`);

const deleteEvents: StatementSync = db.prepare("DELETE FROM events WHERE session_id = ?");
const deleteFts: StatementSync = db.prepare("DELETE FROM events_fts WHERE session_id = ?");
const insertEvent: StatementSync = db.prepare(
  "INSERT INTO events (session_id, at, kind, payload) VALUES (?, ?, ?, ?)",
);
const insertFts: StatementSync = db.prepare(
  "INSERT INTO events_fts (session_id, payload) VALUES (?, ?)",
);

import { redactSessionForCapture, toStoredCaptureReport } from "./lib/capture-redact.js";

export function saveSession(session: Session, sourcePath: string): void {
  // Redact BEFORE any data touches SQLite. Local DB compromise must not
  // expose raw API keys / emails / credential URLs. share.ts keeps a second
  // anonymize() pass as a fallback for legacy rows captured pre-redaction.
  const { session: redacted, redactedAt, redactionCount, report } =
    redactSessionForCapture(session);
  // Persist the masked breakdown (no raw values) so `trail share --dry-run`
  // can show the user exactly what was stripped at capture time.
  const redactionReport = JSON.stringify(toStoredCaptureReport(report));
  transaction(() => {
    upsertSession.run({
      id: redacted.id,
      user: redacted.user,
      tool: redacted.tool,
      startedAt: redacted.startedAt,
      endedAt: redacted.endedAt ?? null,
      repo: redacted.repo ?? null,
      sourcePath,
      redactedAt,
      redactionCount,
      redactionReport,
    });
    deleteEvents.run(redacted.id);
    deleteFts.run(redacted.id);
    for (const ev of redacted.events) {
      const payload = JSON.stringify(ev);
      insertEvent.run(redacted.id, ev.at, ev.kind, payload);
      // index a text-only blob for FTS
      const text =
        ev.kind === "prompt" || ev.kind === "completion"
          ? ev.text
          : ev.kind === "tool_call"
            ? `${ev.name} ${JSON.stringify(ev.args ?? "")} ${JSON.stringify(ev.result ?? "")}`
            : ev.kind === "decision"
              ? ev.note
              : ev.kind === "file_diff"
                ? `${ev.path}`
                : "";
      insertFts.run(redacted.id, text);
    }
  });
}
