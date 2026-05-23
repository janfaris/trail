import Database from "better-sqlite3";
import { homedir } from "node:os";
import path from "node:path";
import { mkdirSync } from "node:fs";

const TRAIL_DIR = path.join(homedir(), ".trail");
mkdirSync(TRAIL_DIR, { recursive: true });
export const DB_PATH = path.join(TRAIL_DIR, "db.sqlite");

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

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
for (const col of ["redacted_at TEXT", "redaction_count INTEGER"]) {
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN ${col}`);
  } catch {
    // already exists
  }
}

import type { Session } from "@trail/schema";

const upsertSession = db.prepare(`
  INSERT INTO sessions (id, user, tool, started_at, ended_at, repo, source_path, redacted_at, redaction_count, updated_at)
  VALUES (@id, @user, @tool, @startedAt, @endedAt, @repo, @sourcePath, @redactedAt, @redactionCount, datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    ended_at = excluded.ended_at,
    repo = COALESCE(excluded.repo, sessions.repo),
    redacted_at = excluded.redacted_at,
    redaction_count = excluded.redaction_count,
    updated_at = datetime('now')
`);

const deleteEvents = db.prepare(`DELETE FROM events WHERE session_id = ?`);
const deleteFts = db.prepare(`DELETE FROM events_fts WHERE session_id = ?`);
const insertEvent = db.prepare(
  `INSERT INTO events (session_id, at, kind, payload) VALUES (?, ?, ?, ?)`,
);
const insertFts = db.prepare(`INSERT INTO events_fts (session_id, payload) VALUES (?, ?)`);

import { redactSessionForCapture } from "./lib/capture-redact.js";

export function saveSession(session: Session, sourcePath: string): void {
  // Redact BEFORE any data touches SQLite. Local DB compromise must not
  // expose raw API keys / emails / credential URLs. share.ts keeps a second
  // anonymize() pass as a fallback for legacy rows captured pre-redaction.
  const { session: redacted, redactedAt, redactionCount } =
    redactSessionForCapture(session);
  const tx = db.transaction(() => {
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
            ? `${ev.name} ${JSON.stringify(ev.args ?? "")}`
            : ev.kind === "decision"
              ? ev.note
              : ev.kind === "file_diff"
                ? `${ev.path}`
                : "";
      insertFts.run(redacted.id, text);
    }
  });
  tx();
}
