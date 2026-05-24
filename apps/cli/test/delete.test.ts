import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Session } from "@trail/schema";

describe("trail delete", () => {
  let tmp: string;
  let prevHome: string | undefined;

  beforeEach(async () => {
    tmp = mkdtempSync(path.join(tmpdir(), "trail-delete-"));
    prevHome = process.env.HOME;
    process.env.HOME = tmp;
    // db module is a singleton on first import; HOME hop doesn't redirect
    // an already-open connection. Wipe rows so tests start clean.
    const { db } = await import("../src/db.js");
    db.exec(`DELETE FROM events_fts; DELETE FROM events; DELETE FROM sessions;`);
  });

  afterEach(() => {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    rmSync(tmp, { recursive: true, force: true });
  });

  function mkSession(id: string, n: number): Session {
    return {
      id,
      user: "alice",
      tool: "claude-code",
      startedAt: `2026-01-0${n}T00:00:00.000Z`,
      events: [
        { kind: "prompt", at: `2026-01-0${n}T00:00:01.000Z`, text: `hello ${id}` },
      ],
    };
  }

  it("deletes sessions by prefix, leaves others untouched", async () => {
    const { saveSession, db } = await import("../src/db.js");
    saveSession(mkSession("sess-aaa1xyz", 1), "/tmp/a.jsonl");
    saveSession(mkSession("sess-bbb2xyz", 2), "/tmp/b.jsonl");
    saveSession(mkSession("sess-ccc3xyz", 3), "/tmp/c.jsonl");

    const { resolvePrefixes, deleteSessionIds } = await import(
      "../src/commands/delete.js"
    );
    const { matched, unknown, ambiguous } = resolvePrefixes([
      "sess-aaa",
      "sess-bbb",
    ]);
    expect(unknown).toEqual([]);
    expect(ambiguous).toEqual([]);
    expect(matched.map((m) => m.id).sort()).toEqual([
      "sess-aaa1xyz",
      "sess-bbb2xyz",
    ]);

    const deleted = deleteSessionIds(matched.map((m) => m.id));
    expect(deleted).toBe(2);

    const remaining = db
      .prepare(`SELECT id FROM sessions ORDER BY id`)
      .all() as Array<{ id: string }>;
    expect(remaining.map((r) => r.id)).toEqual(["sess-ccc3xyz"]);

    // Events for deleted sessions are gone via FK cascade.
    const orphanEvents = db
      .prepare(`SELECT COUNT(*) AS n FROM events WHERE session_id LIKE 'sess-aaa%' OR session_id LIKE 'sess-bbb%'`)
      .get() as { n: number };
    expect(orphanEvents.n).toBe(0);
  });

  it("reports unknown prefixes without deleting anything", async () => {
    const { saveSession, db } = await import("../src/db.js");
    saveSession(mkSession("sess-keep111", 1), "/tmp/k.jsonl");

    const { resolvePrefixes, deleteSessionIds } = await import(
      "../src/commands/delete.js"
    );
    const r = resolvePrefixes(["nope-zzz"]);
    expect(r.unknown).toEqual(["nope-zzz"]);
    expect(r.matched).toEqual([]);
    // Caller should not delete on unknowns; verify table intact.
    expect(deleteSessionIds([])).toBe(0);
    const rows = db.prepare(`SELECT id FROM sessions`).all() as Array<{ id: string }>;
    expect(rows).toHaveLength(1);
  });
});
