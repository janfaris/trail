import { describe, it, expect } from "vitest";
import { parseOpenCodeSession } from "../src/opencode.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("opencode parser", () => {
  it("parses a synthetic messages.jsonl fixture", async () => {
    const fixturePath = path.join(__dirname, "fixtures/opencode-sample.jsonl");
    const session = await parseOpenCodeSession(fixturePath, "janfaris");
    expect(session.tool).toBe("opencode");
    expect(session.user).toBe("janfaris");
    const kinds = new Set(session.events.map((e) => e.kind));
    expect(kinds.has("prompt")).toBe(true);
    expect(kinds.has("completion")).toBe(true);
    expect(kinds.has("tool_call")).toBe(true);
  });
});
