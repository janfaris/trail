import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Session } from "@trail/schema";

type RecapMod = typeof import("../src/commands/recap.js");
type DbMod = typeof import("../src/db.js");

let recap: RecapMod;
let dbMod: DbMod;
let home: string;
let prevHome: string | undefined;

// Local mirror of RecapRow so the pure-summary tests don't depend on the DB.
interface RecapRow {
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

function row(partial: Partial<RecapRow> & { id: string; startedAt: string }): RecapRow {
  return {
    tool: "claude-code",
    repo: null,
    events: 0,
    prompts: 0,
    completions: 0,
    toolCalls: 0,
    fileDiffs: 0,
    decisions: 0,
    inputTokens: 0,
    outputTokens: 0,
    ...partial,
  };
}

beforeAll(async () => {
  home = mkdtempSync(path.join(tmpdir(), "trail-recap-"));
  prevHome = process.env.HOME;
  process.env.HOME = home;
  recap = await import("../src/commands/recap.js");
  dbMod = await import("../src/db.js");
});

afterAll(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
});

describe("summarizeRecap", () => {
  it("aggregates totals across sessions", () => {
    const stats = recap.summarizeRecap([
      row({
        id: "s1",
        startedAt: "2026-01-05T00:00:00.000Z",
        tool: "claude-code",
        repo: "me/app",
        events: 5,
        prompts: 2,
        completions: 1,
        toolCalls: 1,
        fileDiffs: 1,
        inputTokens: 100,
        outputTokens: 50,
      }),
      row({
        id: "s2",
        startedAt: "2026-01-03T00:00:00.000Z",
        tool: "codex",
        repo: "me/app",
        events: 2,
        prompts: 1,
        completions: 1,
      }),
      row({
        id: "s3",
        startedAt: "2026-01-06T00:00:00.000Z",
        tool: "claude-code",
        repo: null,
        events: 9,
        prompts: 4,
        decisions: 2,
      }),
    ]);

    expect(stats.sessionCount).toBe(3);
    expect(stats.eventTotal).toBe(16);
    expect(stats.kinds.prompt).toBe(7);
    expect(stats.kinds.decision).toBe(2);
    expect(stats.tokens.input).toBe(100);
    expect(stats.tokens.output).toBe(50);
    expect(stats.tools[0]).toEqual({ tool: "claude-code", count: 2 });
    expect(stats.tools[1]).toEqual({ tool: "codex", count: 1 });
    expect(stats.repos).toEqual(["me/app"]);
    expect(stats.firstAt).toBe("2026-01-03T00:00:00.000Z");
    expect(stats.lastAt).toBe("2026-01-06T00:00:00.000Z");
    expect(stats.busiest).toEqual({ id: "s3", events: 9 });
  });

  it("returns an empty summary for no rows", () => {
    const stats = recap.summarizeRecap([]);
    expect(stats.sessionCount).toBe(0);
    expect(stats.eventTotal).toBe(0);
    expect(stats.tools).toEqual([]);
    expect(stats.repos).toEqual([]);
    expect(stats.busiest).toBeNull();
  });
});

describe("formatRecap", () => {
  it("prints a friendly message when there are no sessions", () => {
    const out = recap.formatRecap(recap.summarizeRecap([]), 7);
    expect(out).toContain("no sessions");
    expect(out).toContain("last 7 days");
  });

  it("prints totals, tools and tokens when there is data", () => {
    const stats = recap.summarizeRecap([
      row({
        id: "s1",
        startedAt: "2026-01-05T00:00:00.000Z",
        tool: "claude-code",
        events: 3,
        prompts: 1,
        completions: 1,
        toolCalls: 1,
        inputTokens: 10,
        outputTokens: 5,
      }),
    ]);
    const out = recap.formatRecap(stats, null);
    expect(out).toContain("1 session");
    expect(out).toContain("claude-code");
    expect(out).toContain("tokens");
  });
});

describe("computeRecap (integration)", () => {
  const NOW = Date.parse("2026-02-01T00:00:00.000Z");

  beforeEach(() => {
    dbMod.db.exec("DELETE FROM events_fts; DELETE FROM events; DELETE FROM sessions;");
  });

  function mkSession(id: string, iso: string, tool: Session["tool"]): Session {
    return {
      id,
      user: "alice",
      tool,
      startedAt: iso,
      repo: "alice/widgets",
      events: [
        { kind: "prompt", at: iso, text: "do the thing" },
        { kind: "completion", at: iso, text: "did the thing", inputTokens: 30, outputTokens: 12 },
      ],
    };
  }

  it("counts all sessions and sums per-kind + token totals", () => {
    dbMod.saveSession(mkSession("sess-a", "2026-01-20T00:00:00.000Z", "claude-code"), "/tmp/a");
    dbMod.saveSession(mkSession("sess-b", "2026-01-28T00:00:00.000Z", "codex"), "/tmp/b");

    const stats = recap.computeRecap(null, NOW);
    expect(stats.sessionCount).toBe(2);
    expect(stats.kinds.prompt).toBe(2);
    expect(stats.kinds.completion).toBe(2);
    expect(stats.tokens.input).toBe(60);
    expect(stats.tokens.output).toBe(24);
    expect(stats.tools.map((t) => t.tool).sort()).toEqual(["claude-code", "codex"]);
  });

  it("restricts to the last N days when a window is given", () => {
    // 4 days before NOW (in window) and ~48 days before NOW (out of 7-day window)
    dbMod.saveSession(
      mkSession("sess-recent", "2026-01-28T00:00:00.000Z", "claude-code"),
      "/tmp/a",
    );
    dbMod.saveSession(mkSession("sess-old", "2025-12-15T00:00:00.000Z", "claude-code"), "/tmp/b");

    const weekly = recap.computeRecap(7, NOW);
    expect(weekly.sessionCount).toBe(1);
    expect(weekly.busiest?.id).toBe("sess-recent");

    expect(recap.computeRecap(null, NOW).sessionCount).toBe(2);
  });
});
