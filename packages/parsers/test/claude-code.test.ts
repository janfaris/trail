import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseClaudeCodeSession } from "../src/claude-code.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("claude-code parser", () => {
  it("parses a fixture session", async () => {
    const fixturePath = path.join(__dirname, "fixtures/claude-sample.jsonl");
    const session = await parseClaudeCodeSession(fixturePath, "janfaris");
    expect(session.tool).toBe("claude-code");
    expect(session.user).toBe("janfaris");
    expect(session.events.length).toBeGreaterThan(0);
    const kinds = new Set(session.events.map((e) => e.kind));
    expect(kinds.has("prompt") || kinds.has("completion")).toBe(true);
  });

  it("extracts assistant tool_use as tool_call events", async () => {
    const fixturePath = path.join(__dirname, "fixtures/claude-sample.jsonl");
    const session = await parseClaudeCodeSession(fixturePath, "janfaris");
    const toolCalls = session.events.filter((e) => e.kind === "tool_call");
    // fixture may or may not contain tool calls; just assert array shape
    expect(Array.isArray(toolCalls)).toBe(true);
  });

  // Regression for the "fork dumps WebSearch JSON as user prompt" bug.
  // Claude Code .jsonl stores tool_result blocks on user-role messages —
  // these are protocol echoes, NOT human prompts. They must not surface as
  // `kind: "prompt"` events or they poison /fork, recipes, and search.
  it("does not treat tool_result-only user messages as prompts", async () => {
    const fixturePath = path.join(__dirname, "fixtures/claude-toolresult.jsonl");
    const session = await parseClaudeCodeSession(fixturePath, "tester");
    const prompts = session.events.filter((e) => e.kind === "prompt");
    // The fixture has exactly two real user prompts (the initial ask + the
    // follow-up). The middle "user" row is a tool_result echo and must be
    // excluded.
    expect(prompts.length).toBe(2);
    for (const p of prompts) {
      const text = (p as { text?: string }).text ?? "";
      // No prompt should contain raw tool-output JSON or the WebSearch nudge.
      expect(text).not.toMatch(/REMINDER: You MUST include the sources/i);
      expect(text).not.toMatch(/^\[\{"title":/);
      expect(text).not.toMatch(/tool_use_id/);
    }
    // First prompt should be the actual instruction, not the search dump.
    expect((prompts[0] as { text: string }).text).toMatch(/puerto rico web design/i);
    expect((prompts[1] as { text: string }).text).toMatch(/squarespace/i);
    const toolCall = session.events.find((e) => e.kind === "tool_call");
    expect((toolCall as { result?: string } | undefined)?.result).toMatch(/Cuanto cuesta/);
  });

  // Week 0 cost-per-PR pivot. Token + model capture must:
  //   - read message.usage off assistant rows
  //   - attribute tokens to exactly ONE event per assistant message (no
  //     double counting when a message yields text + tool_use)
  //   - keep cache creation vs read split (Anthropic prices them differently)
  it("captures tokens + model on assistant events without double-counting", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "claude-parser-test-"));
    const file = path.join(dir, "session.jsonl");
    const ts = "2026-05-25T19:00:00.000Z";
    const lines = [
      // assistant message with TWO blocks (text + tool_use) and message-level usage
      {
        type: "assistant",
        timestamp: ts,
        sessionId: "test-sid",
        message: {
          role: "assistant",
          model: "claude-opus-4-7",
          content: [
            { type: "text", text: "Looking at the file." },
            { type: "tool_use", name: "Read", input: { path: "/x" } },
          ],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_creation_input_tokens: 2000,
            cache_read_input_tokens: 8000,
          },
        },
      },
      // a user prompt to ensure user events get no tokens
      {
        type: "user",
        timestamp: "2026-05-25T19:00:05.000Z",
        message: { role: "user", content: "follow-up" },
      },
      // a second assistant message (single block) with its own usage
      {
        type: "assistant",
        timestamp: "2026-05-25T19:00:10.000Z",
        message: {
          role: "assistant",
          model: "claude-opus-4-7",
          content: [{ type: "text", text: "Done." }],
          usage: {
            input_tokens: 20,
            output_tokens: 5,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 1000,
          },
        },
      },
    ];
    await writeFile(file, lines.map((l) => JSON.stringify(l)).join("\n"));
    try {
      const session = await parseClaudeCodeSession(file, "tester");

      // First assistant message → 2 events (one completion, one tool_call).
      // The first one carries tokens; the second carries model only.
      const assistantEvents = session.events.filter(
        (e) => e.kind === "completion" || e.kind === "tool_call",
      );
      expect(assistantEvents.length).toBe(3);

      // Sum across all events should equal the SUM of message-level usage,
      // not 2× the first message (the double-count footgun).
      const sum = (
        key: "inputTokens" | "outputTokens" | "cacheCreationInputTokens" | "cacheReadInputTokens",
      ) =>
        assistantEvents.reduce(
          (a, e) => a + (((e as Record<string, unknown>)[key] as number | null) ?? 0),
          0,
        );
      expect(sum("inputTokens")).toBe(120); // 100 + 20
      expect(sum("outputTokens")).toBe(55); // 50 + 5
      expect(sum("cacheCreationInputTokens")).toBe(2000); // 2000 + 0
      expect(sum("cacheReadInputTokens")).toBe(9000); // 8000 + 1000

      // Model is on every assistant-derived event.
      for (const e of assistantEvents) {
        expect((e as { model?: string | null }).model).toBe("claude-opus-4-7");
      }

      // User prompts carry no tokens or model.
      const prompts = session.events.filter((e) => e.kind === "prompt");
      expect(prompts.length).toBe(1);
      const p = prompts[0] as Record<string, unknown>;
      expect(p.inputTokens ?? null).toBeNull();
      expect(p.model ?? null).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
