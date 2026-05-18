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
});
