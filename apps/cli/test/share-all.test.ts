import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Command } from "commander";
import type { Session } from "@trail/schema";

describe("trail share --all", () => {
  let tmp: string;
  let prevHome: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "trail-share-all-"));
    prevHome = process.env.HOME;
    process.env.HOME = tmp;
  });

  afterEach(() => {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    rmSync(tmp, { recursive: true, force: true });
  });

  function mkSession(id: string, n: number): Session {
    return {
      id,
      user: "alice",
      tool: "claude-code",
      startedAt: `2026-01-0${n}T00:00:00.000Z`,
      events: [
        { kind: "prompt", at: `2026-01-0${n}T00:00:01.000Z`, text: `hello ${id}` },
      ],
    };
  }

  it("parses --all without an id and lists all local sessions (dry-run)", async () => {
    const { saveSession } = await import("../src/db.js");
    saveSession(mkSession("sess-aaa", 1), "/tmp/a.jsonl");
    saveSession(mkSession("sess-bbb", 2), "/tmp/b.jsonl");
    saveSession(mkSession("sess-ccc", 3), "/tmp/c.jsonl");

    const { shareCommand } = await import("../src/commands/share.js");
    const cmd = new Command();
    cmd.exitOverride();
    cmd.addCommand(shareCommand());

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      await cmd.parseAsync(["share", "--all", "--dry-run", "--yes"], {
        from: "user",
      });
    } finally {
      console.log = origLog;
    }
    const joined = logs.join("\n");
    expect(joined).toContain("3 session(s)");
    expect(joined).toContain("--dry-run");
    expect(joined).toMatch(/sess-aaa/);
    expect(joined).toMatch(/sess-bbb/);
    expect(joined).toMatch(/sess-ccc/);
  });

  it("rejects --all combined with a positional id", async () => {
    const { shareCommand } = await import("../src/commands/share.js");
    const cmd = new Command();
    cmd.exitOverride();
    cmd.addCommand(shareCommand());

    const errs: string[] = [];
    const origErr = console.error;
    console.error = (...args: unknown[]) => {
      errs.push(args.map(String).join(" "));
    };
    let exited = false;
    const origExit = process.exit;
    // @ts-expect-error stub
    process.exit = (() => {
      exited = true;
      throw new Error("__exit__");
    }) as never;
    try {
      await cmd.parseAsync(["share", "some-id", "--all"], { from: "user" });
    } catch {
      /* expected */
    } finally {
      console.error = origErr;
      process.exit = origExit;
    }
    expect(exited).toBe(true);
    expect(errs.join("\n")).toMatch(/mutually exclusive/);
  });
});
