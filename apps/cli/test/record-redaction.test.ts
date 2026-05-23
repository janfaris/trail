import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { redactSessionForCapture } from "../src/lib/capture-redact.js";
import type { Session } from "@trail/schema";

const RAW_KEY = "sk-test-abc123def456ghi789jkl012mno345pq";
const RAW_EMAIL = "user@example.com";

function fakeSession(): Session {
  return {
    id: "test-session-1",
    user: "alice",
    tool: "claude-code",
    startedAt: "2026-01-01T00:00:00.000Z",
    events: [
      {
        kind: "prompt",
        at: "2026-01-01T00:00:01.000Z",
        text: `Use the key ${RAW_KEY} and ping ${RAW_EMAIL} when ready.`,
      },
      {
        kind: "tool_call",
        at: "2026-01-01T00:00:02.000Z",
        name: "http",
        args: { authorization: `Bearer ${RAW_KEY}` },
      },
    ],
  };
}

describe("redactSessionForCapture", () => {
  it("strips raw secrets and emails before persistence", () => {
    const { session, redactionCount, redactedAt } = redactSessionForCapture(
      fakeSession(),
    );
    const serialized = JSON.stringify(session);
    expect(serialized).not.toContain(RAW_KEY);
    expect(serialized).not.toContain(RAW_EMAIL);
    expect(redactionCount).toBeGreaterThan(0);
    expect(typeof redactedAt).toBe("string");
    expect(() => new Date(redactedAt).toISOString()).not.toThrow();
  });

  it("preserves session id and event count", () => {
    const original = fakeSession();
    const { session } = redactSessionForCapture(original);
    expect(session.id).toBe(original.id);
    expect(session.events.length).toBe(original.events.length);
  });
});

describe("saveSession round-trip redaction", () => {
  it("persists redacted payloads with no raw secrets in SQLite", async () => {
    const RT_KEY = "sk-test-roundtrip-abc123def456ghi789";
    const RT_EMAIL = "roundtrip@example.com";

    const tmp = mkdtempSync(path.join(tmpdir(), "trail-rt-"));
    const prevHome = process.env.HOME;
    process.env.HOME = tmp;

    try {
      // Dynamic import so db.ts initializes against our temp HOME.
      const { db, saveSession, DB_PATH } = await import("../src/db.js");
      expect(DB_PATH.startsWith(tmp)).toBe(true);

      const session: Session = {
        id: "rt-session-1",
        user: "alice",
        tool: "claude-code",
        startedAt: "2026-01-01T00:00:00.000Z",
        events: [
          {
            kind: "prompt",
            at: "2026-01-01T00:00:01.000Z",
            text: `auth ${RT_KEY}`,
          },
          {
            kind: "tool_call",
            at: "2026-01-01T00:00:02.000Z",
            name: "mail",
            args: { to: RT_EMAIL },
          },
        ],
      };

      saveSession(session, "/tmp/source.jsonl");

      const sessRow = db
        .prepare("SELECT * FROM sessions WHERE id = ?")
        .get(session.id) as any;
      expect(sessRow).toBeTruthy();
      expect(sessRow.redacted_at).not.toBeNull();
      expect(sessRow.redaction_count).toBeGreaterThan(0);

      const evRows = db
        .prepare("SELECT payload FROM events WHERE session_id = ?")
        .all(session.id) as Array<{ payload: string }>;
      expect(evRows.length).toBe(2);
      for (const row of evRows) {
        expect(row.payload).not.toContain(RT_KEY);
        expect(row.payload).not.toContain(RT_EMAIL);
      }
      db.close();
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
