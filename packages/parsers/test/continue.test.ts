import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseContinueSession } from "../src/continue.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("continue parser", () => {
  it("parses a synthetic session JSON", async () => {
    const fp = path.join(__dirname, "fixtures/continue-session.json");
    const s = await parseContinueSession(fp, "u");
    expect(s.tool).toBe("continue");
    expect(s.user).toBe("u");
    expect(s.repo).toBe("/home/user/proj");
    const kinds = s.events.map((e) => e.kind);
    expect(kinds).toContain("prompt");
    expect(kinds).toContain("completion");
  });
});
