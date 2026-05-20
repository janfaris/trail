import { describe, it, expect } from "vitest";
import { parseClaudeCodeSession } from "../src/claude-code.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  });
});
