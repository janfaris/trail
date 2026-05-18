import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCursorWorkspace } from "../src/cursor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wsDb = path.join(__dirname, "fixtures", "cursor-workspace.vscdb");
const gDb = path.join(__dirname, "fixtures", "cursor-global.vscdb");

describe("parseCursorWorkspace", () => {
  it("extracts composers from workspace + global stores", async () => {
    const sessions = await parseCursorWorkspace(wsDb, "tester", {
      globalDbPath: gDb,
    });
    expect(sessions.length).toBe(1);
    const s = sessions[0]!;
    expect(s.tool).toBe("cursor");
    expect(s.id).toBe("comp-1");
    expect(s.user).toBe("tester");
    expect(s.summary).toBe("Demo Chat");
    expect(s.repo).toBe("/tmp/demo-project");
    expect(s.events.length).toBe(2);
    expect(s.events[0]!.kind).toBe("prompt");
    expect(s.events[1]!.kind).toBe("completion");
  });

  it("respects sinceMs watermark", async () => {
    const sessions = await parseCursorWorkspace(wsDb, "tester", {
      globalDbPath: gDb,
      sinceMs: 1700000060001,
    });
    expect(sessions.length).toBe(0);
  });

  it("returns [] when global db is missing", async () => {
    const sessions = await parseCursorWorkspace(wsDb, "tester", {
      globalDbPath: "/nonexistent/path.vscdb",
    });
    expect(sessions).toEqual([]);
  });
});
