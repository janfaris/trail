import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseCopilotChatDB } from "../src/copilot-chat.js";

function seed(dbPath: string) {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, cwd TEXT, repository TEXT, host_type TEXT,
      branch TEXT, summary TEXT, agent_name TEXT, agent_description TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      turn_index INTEGER NOT NULL,
      user_message TEXT, assistant_response TEXT,
      timestamp TEXT
    );
  `);
  db.prepare(
    `INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    "sess-1",
    "/Users/u/proj",
    "git@github.com:u/proj.git",
    "vscode",
    "main",
    "Fix the thing",
    null,
    null,
    "2026-05-10T10:00:00.000Z",
    "2026-05-10T10:05:00.000Z",
  );
  db.prepare(
    `INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    "sess-2",
    "/Users/u/other",
    null,
    "vscode",
    "main",
    null,
    null,
    null,
    "2026-05-11T10:00:00.000Z",
    "2026-05-11T10:01:00.000Z",
  );
  const t = db.prepare(
    `INSERT INTO turns (session_id, turn_index, user_message, assistant_response, timestamp) VALUES (?,?,?,?,?)`,
  );
  t.run("sess-1", 0, "hello", "hi there", "2026-05-10T10:00:30.000Z");
  t.run("sess-1", 1, "do the thing", "done", "2026-05-10T10:04:00.000Z");
  t.run("sess-2", 0, "ping", "pong", "2026-05-11T10:00:30.000Z");
  db.close();
}

describe("copilot-chat parser", () => {
  it("parses sessions and turns into Trail sessions", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "trail-cc-"));
    const dbPath = path.join(dir, "session-store.db");
    try {
      seed(dbPath);
      const sessions = parseCopilotChatDB(dbPath, "u");
      expect(sessions.length).toBe(2);
      const s1 = sessions.find((s) => s.id === "sess-1")!;
      expect(s1.tool).toBe("copilot-chat");
      expect(s1.repo).toBe("git@github.com:u/proj.git");
      expect(s1.events.length).toBe(4); // 2 prompts + 2 completions
      expect(s1.events[0].kind).toBe("prompt");
      expect(s1.events[1].kind).toBe("completion");
      expect(s1.summary).toBe("Fix the thing");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("filters with `since` watermark", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "trail-cc-"));
    const dbPath = path.join(dir, "session-store.db");
    try {
      seed(dbPath);
      const sessions = parseCopilotChatDB(dbPath, "u", {
        since: "2026-05-10T23:59:59.999Z",
      });
      expect(sessions.length).toBe(1);
      expect(sessions[0].id).toBe("sess-2");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
