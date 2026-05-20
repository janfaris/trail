import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseZedSession } from "../src/zed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("zed parser", () => {
  it("parses a synthetic session JSON", async () => {
    const fp = path.join(__dirname, "fixtures/zed-session.json");
    const s = await parseZedSession(fp, "u");
    expect(s.tool).toBe("zed");
    expect(s.user).toBe("u");
    expect(s.events.length).toBeGreaterThan(0);
    const kinds = s.events.map((e) => e.kind);
    expect(kinds).toContain("prompt");
    expect(kinds).toContain("completion");
    expect(kinds).toContain("tool_call");
  });
});
