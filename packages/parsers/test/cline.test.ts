import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseClineTask } from "../src/cline.js";

describe("cline parser", () => {
  it("parses a synthetic task directory", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cline-task-"));
    const api = [
      { role: "user", content: "hello cline" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "hi there" },
          { type: "tool_use", name: "read_file", input: { path: "foo.ts" } },
        ],
      },
    ];
    const ui = [
      { ts: 1_700_000_000_000, type: "say", say: "text", text: "starting" },
      {
        ts: 1_700_000_001_000,
        type: "say",
        say: "tool",
        tool: "write_to_file",
        path: "bar.ts",
        content: "export const x = 1;\n",
      },
      {
        ts: 1_700_000_002_000,
        type: "say",
        say: "tool",
        text: JSON.stringify({
          tool: "replace_in_file",
          path: "baz.ts",
          diff: "@@ -1 +1 @@\n-foo\n+bar\n",
        }),
      },
    ];
    writeFileSync(path.join(dir, "api_conversation_history.json"), JSON.stringify(api));
    writeFileSync(path.join(dir, "ui_messages.json"), JSON.stringify(ui));

    const session = await parseClineTask(dir, "janfaris");
    expect(session.tool).toBe("cline");
    expect(session.user).toBe("janfaris");
    const kinds = new Set(session.events.map((e) => e.kind));
    expect(kinds.has("prompt")).toBe(true);
    expect(kinds.has("completion")).toBe(true);
    expect(kinds.has("tool_call")).toBe(true);
    expect(kinds.has("file_diff")).toBe(true);
    const diffs = session.events.filter((e) => e.kind === "file_diff");
    expect(diffs.length).toBe(2);
  });
});
