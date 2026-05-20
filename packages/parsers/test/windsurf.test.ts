import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseWindsurfSession } from "../src/windsurf.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("windsurf parser", () => {
  it("parses a synthetic session JSON", async () => {
    const fp = path.join(__dirname, "fixtures/windsurf-session.json");
    const s = await parseWindsurfSession(fp, "u");
    expect(s.tool).toBe("windsurf");
    expect(s.user).toBe("u");
    expect(s.events.length).toBeGreaterThan(0);
    const kinds = s.events.map((e) => e.kind);
    expect(kinds).toContain("prompt");
    expect(kinds).toContain("completion");
    expect(kinds).toContain("tool_call");
  });
});
