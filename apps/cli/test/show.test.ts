import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Session } from "@trail/schema";
// line-diff.ts has no DB dependency, so a static import is safe here.
import { lineDiff } from "../src/lib/line-diff.js";

type ShowMod = typeof import("../src/commands/show.js");
type DbMod = typeof import("../src/db.js");

let show: ShowMod;
let dbMod: DbMod;
let home: string;
let prevHome: string | undefined;

describe("lineDiff", () => {
  it("counts added and removed lines", () => {
    const d = lineDiff("a\nb\nc", "a\nx\nc");
    expect(d.added).toBe(1);
    expect(d.removed).toBe(1);
    expect(d.lines.some((l) => l.type === "add" && l.text === "x")).toBe(true);
    expect(d.lines.some((l) => l.type === "del" && l.text === "b")).toBe(true);
  });

  it("handles pure additions", () => {
    const d = lineDiff("", "one\ntwo");
    expect(d.added).toBe(2);
    expect(d.removed).toBe(0);
  });

  it("reports no changes for identical content", () => {
    const d = lineDiff("same\nlines", "same\nlines");
    expect(d.added).toBe(0);
    expect(d.removed).toBe(0);
  });
});

describe("trail show", () => {
  beforeAll(async () => {
    home = mkdtempSync(path.join(tmpdir(), "trail-show-"));
    prevHome = process.env.HOME;
    process.env.HOME = home;
    show = await import("../src/commands/show.js");
    dbMod = await import("../src/db.js");
  });

  afterAll(() => {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    rmSync(home, { recursive: true, force: true });
  });

  beforeEach(() => {
    dbMod.db.exec("DELETE FROM events_fts; DELETE FROM events; DELETE FROM sessions;");
  });

  function richSession(id: string): Session {
    return {
      id,
      user: "alice",
      tool: "claude-code",
      startedAt: "2026-01-05T10:00:00.000Z",
      endedAt: "2026-01-05T10:05:00.000Z",
      repo: "alice/widgets",
      events: [
        { kind: "prompt", at: "2026-01-05T10:00:01.000Z", text: "build a login form" },
        {
          kind: "tool_call",
          at: "2026-01-05T10:00:02.000Z",
          name: "write_file",
          args: { path: "src/login.ts" },
          result: "ok",
        },
        {
          kind: "file_diff",
          at: "2026-01-05T10:00:03.000Z",
          path: "src/login.ts",
          before: "export const x = 1;",
          after: "export const x = 2;\nexport const y = 3;",
        },
        { kind: "decision", at: "2026-01-05T10:00:04.000Z", note: "use bcrypt" },
        {
          kind: "completion",
          at: "2026-01-05T10:00:05.000Z",
          text: "done",
          inputTokens: 120,
          outputTokens: 40,
          model: "claude-opus",
        },
      ],
    };
  }

  describe("eventSummary", () => {
    it("summarizes each event kind on one line", () => {
      expect(show.eventSummary({ kind: "prompt", at: "t", text: "first line\nsecond" })).toBe(
        "first line",
      );
      expect(show.eventSummary({ kind: "decision", at: "t", note: "chose postgres" })).toBe(
        "chose postgres",
      );
      expect(
        show.eventSummary({ kind: "tool_call", at: "t", name: "bash", args: { command: "ls" } }),
      ).toContain("bash");
      const diff = show.eventSummary({
        kind: "file_diff",
        at: "t",
        path: "src/app.ts",
        before: "a\nb",
        after: "a\nc",
      });
      expect(diff).toContain("src/app.ts");
      expect(diff).toContain("+1");
    });
  });

  it("resolves a session by exact id and by unique prefix", () => {
    dbMod.saveSession(richSession("sess-login0001"), "/tmp/a");
    expect(show.resolveSession("sess-login0001").session?.id).toBe("sess-login0001");
    expect(show.resolveSession("sess-login").session?.id).toBe("sess-login0001");
    expect(show.resolveSession("nope").session).toBeUndefined();
  });

  it("flags ambiguous prefixes", () => {
    dbMod.saveSession(richSession("sess-dup0001"), "/tmp/a");
    dbMod.saveSession(richSession("sess-dup0002"), "/tmp/b");
    const r = show.resolveSession("sess-dup");
    expect(r.session).toBeUndefined();
    expect(r.candidates).toHaveLength(2);
  });

  it("loads events in chronological order", () => {
    dbMod.saveSession(richSession("sess-login0001"), "/tmp/a");
    const events = show.loadEvents("sess-login0001");
    expect(events.map((e) => e.kind)).toEqual([
      "prompt",
      "tool_call",
      "file_diff",
      "decision",
      "completion",
    ]);
  });

  it("renders a scannable timeline with a jump hint", () => {
    dbMod.saveSession(richSession("sess-login0001"), "/tmp/a");
    const session = show.resolveSession("sess-login0001").session;
    const out = show.renderTimeline(session!, show.loadEvents("sess-login0001"));
    expect(out).toContain("sess-login0001");
    expect(out).toContain("build a login form");
    expect(out).toContain("--event");
    expect(out).toContain("5 events");
  });

  it("renders a single event in full detail", () => {
    dbMod.saveSession(richSession("sess-login0001"), "/tmp/a");
    const session = show.resolveSession("sess-login0001").session;
    const events = show.loadEvents("sess-login0001");

    const diffView = show.renderSingleEvent(session!, events, 3);
    expect(diffView).toContain("event 3/5");
    expect(diffView).toContain("src/login.ts");
    expect(diffView).toContain("export const y = 3;");

    const completionView = show.renderSingleEvent(session!, events, 5);
    expect(completionView).toContain("claude-opus");
  });

  it("renders the full replay including bodies", () => {
    dbMod.saveSession(richSession("sess-login0001"), "/tmp/a");
    const session = show.resolveSession("sess-login0001").session;
    const full = show.renderFull(session!, show.loadEvents("sess-login0001"));
    expect(full).toContain("use bcrypt");
    expect(full).toContain("write_file");
  });

  it("handles a session with no events", () => {
    dbMod.saveSession(
      {
        id: "sess-empty0001",
        user: "alice",
        tool: "codex",
        startedAt: "2026-01-05T10:00:00.000Z",
        events: [],
      },
      "/tmp/e",
    );
    const session = show.resolveSession("sess-empty0001").session;
    const out = show.renderTimeline(session!, show.loadEvents("sess-empty0001"));
    expect(out).toContain("(no events recorded)");
  });
});
