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

import type { Session } from "@trail/schema";

const upsertSession = db.prepare(`
  INSERT INTO sessions (id, user, tool, started_at, ended_at, repo, source_path, updated_at)
  VALUES (@id, @user, @tool, @startedAt, @endedAt, @repo, @sourcePath, datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    ended_at = excluded.ended_at,
    repo = COALESCE(excluded.repo, sessions.repo),
    updated_at = datetime('now')
`);

const deleteEvents = db.prepare(`DELETE FROM events WHERE session_id = ?`);
const deleteFts = db.prepare(`DELETE FROM events_fts WHERE session_id = ?`);
const insertEvent = db.prepare(
  `INSERT INTO events (session_id, at, kind, payload) VALUES (?, ?, ?, ?)`,
);
const insertFts = db.prepare(`INSERT INTO events_fts (session_id, payload) VALUES (?, ?)`);

export function saveSession(session: Session, sourcePath: string): void {
  const tx = db.transaction(() => {
    upsertSession.run({
      id: session.id,
      user: session.user,
      tool: session.tool,
      startedAt: session.startedAt,
      endedAt: session.endedAt ?? null,
      repo: session.repo ?? null,
      sourcePath,
    });
    deleteEvents.run(session.id);
    deleteFts.run(session.id);
    for (const ev of session.events) {
      const payload = JSON.stringify(ev);
      insertEvent.run(session.id, ev.at, ev.kind, payload);
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
      insertFts.run(session.id, text);
    }
  });
  tx();
}
