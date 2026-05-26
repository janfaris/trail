import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { parseCursorWorkspace, probeCursorTokens } from "../src/cursor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wsDb = path.join(__dirname, "fixtures", "cursor-workspace.vscdb");
const gDb = path.join(__dirname, "fixtures", "cursor-global.vscdb");

describe("parseCursorWorkspace", () => {
  it("extracts composers from workspace + global stores", async () => {
    const sessions = await parseCursorWorkspace(wsDb, "tester", {
      globalDbPath: gDb,
    });
    expect(sessions.length).toBe(1);
    const s = sessions[0]!;
    expect(s.tool).toBe("cursor");
    expect(s.id).toBe("comp-1");
    expect(s.user).toBe("tester");
    expect(s.summary).toBe("Demo Chat");
    expect(s.repo).toBe("/tmp/demo-project");
    expect(s.events.length).toBe(2);
    expect(s.events[0]!.kind).toBe("prompt");
    expect(s.events[1]!.kind).toBe("completion");
  });

  it("respects sinceMs watermark", async () => {
    const sessions = await parseCursorWorkspace(wsDb, "tester", {
      globalDbPath: gDb,
      sinceMs: 1700000060001,
    });
    expect(sessions.length).toBe(0);
  });

  it("returns [] when global db is missing", async () => {
    const sessions = await parseCursorWorkspace(wsDb, "tester", {
      globalDbPath: "/nonexistent/path.vscdb",
    });
    expect(sessions).toEqual([]);
  });
});

// Build a minimal pair of workspace + global vscdb files matching the
// schema parseCursorWorkspace expects (ItemTable.composer.composerData →
// cursorDiskKV.composerData:<id> → cursorDiskKV.bubbleId:<cid>:<bid>).
// Lets us inject arbitrary bubble shapes per test without touching the
// committed binary fixtures.
function buildSyntheticCursorDbs(bubbles: {
  composerId: string;
  composerName?: string;
  createdAt: number;
  lastUpdatedAt: number;
  bubbles: Array<{ bubbleId: string; type: number; body: unknown }>;
}): { wsDb: string; gDb: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "cursor-fixt-"));
  const wsDbPath = path.join(dir, "workspace.vscdb");
  const gDbPath = path.join(dir, "global.vscdb");

  const ws = new Database(wsDbPath);
  ws.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB)");
  ws.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run(
    "composer.composerData",
    JSON.stringify({
      allComposers: [
        { composerId: bubbles.composerId, createdAt: bubbles.createdAt },
      ],
    }),
  );
  ws.close();

  const g = new Database(gDbPath);
  g.exec("CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value BLOB)");
  const ins = g.prepare("INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)");
  ins.run(
    `composerData:${bubbles.composerId}`,
    JSON.stringify({
      name: bubbles.composerName,
      createdAt: bubbles.createdAt,
      lastUpdatedAt: bubbles.lastUpdatedAt,
      fullConversationHeadersOnly: bubbles.bubbles.map((b) => ({
        bubbleId: b.bubbleId,
        type: b.type,
      })),
    }),
  );
  for (const b of bubbles.bubbles) {
    ins.run(
      `bubbleId:${bubbles.composerId}:${b.bubbleId}`,
      JSON.stringify(b.body),
    );
  }
  g.close();

  return { wsDb: wsDbPath, gDb: gDbPath };
}

describe("parseCursorWorkspace token capture", () => {
  it("populates_token_fields_when_present", async () => {
    const { wsDb, gDb } = buildSyntheticCursorDbs({
      composerId: "comp-tok",
      composerName: "Token Demo",
      createdAt: 1_700_000_000_000,
      lastUpdatedAt: 1_700_000_060_000,
      bubbles: [
        {
          bubbleId: "b1",
          type: 1,
          body: { type: 1, text: "hi" },
        },
        {
          bubbleId: "b2",
          type: 2,
          body: {
            type: 2,
            text: "hello back",
            model: "claude-opus-4-7",
            usage: {
              input_tokens: 1500,
              output_tokens: 300,
              cache_creation_input_tokens: 8000,
              cache_read_input_tokens: 2000,
            },
          },
        },
      ],
    });
    const sessions = await parseCursorWorkspace(wsDb, "tester", {
      globalDbPath: gDb,
    });
    expect(sessions.length).toBe(1);
    const evts = sessions[0]!.events;
    expect(evts.length).toBe(2);

    const prompt = evts[0]!;
    expect(prompt.kind).toBe("prompt");
    expect(prompt.inputTokens).toBeNull();
    expect(prompt.outputTokens).toBeNull();
    expect(prompt.cacheCreationInputTokens).toBeNull();
    expect(prompt.cacheReadInputTokens).toBeNull();
    expect(prompt.model).toBeNull();

    const completion = evts[1]!;
    expect(completion.kind).toBe("completion");
    expect(completion.inputTokens).toBe(1500);
    expect(completion.outputTokens).toBe(300);
    expect(completion.cacheCreationInputTokens).toBe(8000);
    expect(completion.cacheReadInputTokens).toBe(2000);
    expect(completion.model).toBe("claude-opus-4-7");
  });

  it("nulls_token_fields_when_absent", async () => {
    const { wsDb, gDb } = buildSyntheticCursorDbs({
      composerId: "comp-no-tok",
      composerName: "No Usage",
      createdAt: 1_700_000_000_000,
      lastUpdatedAt: 1_700_000_060_000,
      bubbles: [
        { bubbleId: "b1", type: 1, body: { type: 1, text: "ask" } },
        { bubbleId: "b2", type: 2, body: { type: 2, text: "answer" } },
      ],
    });
    const sessions = await parseCursorWorkspace(wsDb, "tester", {
      globalDbPath: gDb,
    });
    expect(sessions.length).toBe(1);
    for (const e of sessions[0]!.events) {
      expect(e.inputTokens).toBeNull();
      expect(e.outputTokens).toBeNull();
      expect(e.cacheCreationInputTokens).toBeNull();
      expect(e.cacheReadInputTokens).toBeNull();
      expect(e.model).toBeNull();
      // Guard against the easy bug: 0 / undefined would silently mean
      // "Cursor said zero tokens" downstream. The contract is explicit null.
      expect(e.inputTokens).not.toBe(0);
      expect(e.outputTokens).not.toBe(0);
      expect(e.inputTokens).not.toBeUndefined();
    }
  });
});

describe("probeCursorTokens", () => {
  it("probeCursorTokens_camelCase_fallback", () => {
    const result = probeCursorTokens({
      promptTokens: 42,
      completionTokens: 99,
      modelName: "cursor-fast",
    });
    expect(result.inputTokens).toBe(42);
    expect(result.outputTokens).toBe(99);
    expect(result.cacheCreationInputTokens).toBeNull();
    expect(result.cacheReadInputTokens).toBeNull();
    expect(result.model).toBe("cursor-fast");
  });

  it("probeCursorTokens_rejects_NaN", () => {
    const result = probeCursorTokens({
      usage: {
        input_tokens: Number.NaN,
        output_tokens: Number.NaN,
        cache_creation_input_tokens: Number.NaN,
        cache_read_input_tokens: Number.NaN,
      },
    });
    expect(result.inputTokens).toBeNull();
    expect(result.outputTokens).toBeNull();
    expect(result.cacheCreationInputTokens).toBeNull();
    expect(result.cacheReadInputTokens).toBeNull();
    expect(Number.isNaN(result.inputTokens as unknown as number)).toBe(false);
    expect(Number.isNaN(result.outputTokens as unknown as number)).toBe(false);
  });
});
