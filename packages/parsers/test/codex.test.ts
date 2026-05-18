import { describe, it, expect } from "vitest";
import { parseCodexSession } from "../src/codex.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("codex parser", () => {
  it("parses a current-format (event_msg/response_item) rollout", async () => {
    const fp = path.join(__dirname, "fixtures/codex-sample.jsonl");
    const s = await parseCodexSession(fp, "u");
    expect(s.tool).toBe("codex");
    expect(s.user).toBe("u");
    expect(s.id).toBe("019cc0e2-2ffe-7760-9c7e-148ba17194d9");
    expect(s.repo).toBe("/Users/u/proj");
    const kinds = s.events.map((e) => e.kind);
    expect(kinds).toContain("prompt");
    expect(kinds).toContain("completion");
    expect(kinds).toContain("tool_call");
    const tc = s.events.find((e) => e.kind === "tool_call");
    if (tc && tc.kind === "tool_call") {
      expect(tc.name).toBe("exec_command");
    }
  });

  it("parses the legacy header+message rollout format", async () => {
    const fp = path.join(__dirname, "fixtures/codex-legacy.jsonl");
    const s = await parseCodexSession(fp, "u");
    expect(s.tool).toBe("codex");
    expect(s.id).toBe("7990a183-f64c-4798-8c0f-1da46b637711");
    expect(s.repo).toBe("https://github.com/u/proj.git");
    expect(s.events.some((e) => e.kind === "prompt")).toBe(true);
    expect(s.events.some((e) => e.kind === "completion")).toBe(true);
  });
});
