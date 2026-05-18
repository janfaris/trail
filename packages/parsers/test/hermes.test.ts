import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHermesSession } from "../src/hermes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("hermes parser", () => {
  it("parses a hermes session_*.json into prompt/completion/tool_call events", async () => {
    const fp = path.join(__dirname, "fixtures/hermes-sample.json");
    const s = await parseHermesSession(fp, "u");
    expect(s.tool).toBe("hermes");
    expect(s.id).toBe("test_hermes_abc123");
    expect(s.user).toBe("u");
    const kinds = s.events.map((e) => e.kind);
    expect(kinds).toContain("prompt");
    expect(kinds).toContain("tool_call");
    // tool_call should have a name and an attached result from the matching tool row
    const tc = s.events.find(
      (e) => e.kind === "tool_call" && e.result !== undefined,
    );
    expect(tc).toBeDefined();
    // system messages should not produce events
    expect(kinds).not.toContain("decision");
    expect(s.startedAt).toBeTruthy();
  });
});
