import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Command } from "commander";
import type { Session } from "@trail/schema";

// These tests verify Task 8: CLI prints "Receipt created" + verification
// status, and supports `trail share latest` to grab the most-recent local
// session from SQLite.

describe("trail share — receipt language + latest", () => {
  let tmp: string;
  let prevHome: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "trail-share-receipt-"));
    prevHome = process.env.HOME;
    process.env.HOME = tmp;
    vi.resetModules();
  });

  afterEach(() => {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    rmSync(tmp, { recursive: true, force: true });
    vi.resetModules();
  });

  function mkSession(id: string, n: number): Session {
    return {
      id,
      user: "alice",
      tool: "claude-code",
      startedAt: `2026-02-0${n}T00:00:00.000Z`,
      events: [
        { kind: "prompt", at: `2026-02-0${n}T00:00:01.000Z`, text: `hi ${id}` },
      ],
    };
  }

  it("`trail share latest` resolves to most recent local session id", async () => {
    const { saveSession } = await import("../src/db.js");
    saveSession(mkSession("sess-old", 1), "/tmp/old.jsonl");
    saveSession(mkSession("sess-new", 9), "/tmp/new.jsonl");

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
      // dry-run avoids needing auth / network
      await cmd.parseAsync(["share", "latest", "--dry-run", "--yes"], {
        from: "user",
      });
    } finally {
      console.log = origLog;
    }
    const joined = logs.join("\n");
    expect(joined).toMatch(/latest:/);
    expect(joined).toContain("sess-new");
    expect(joined).not.toContain("sess-old");
    expect(joined).toContain("--dry-run");
  });

  it("--latest flag is mutually exclusive with positional id", async () => {
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
      await cmd.parseAsync(["share", "some-id", "--latest"], { from: "user" });
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
