import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCopilotCliSession } from "../src/copilot-cli.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("copilot-cli parser", () => {
  it("parses events.jsonl + workspace.yaml", async () => {
    const fp = path.join(__dirname, "fixtures/copilot-cli-events.jsonl");
    const s = await parseCopilotCliSession(fp, "u");
    expect(s.tool).toBe("copilot-cli");
    expect(s.user).toBe("u");
    expect(s.id).toBeTruthy();
    const kinds = s.events.map((e) => e.kind);
    expect(kinds).toContain("prompt");
    expect(kinds).toContain("completion");
    expect(s.startedAt).toBeTruthy();
    expect(s.repo).toBeTruthy();
  });
});
