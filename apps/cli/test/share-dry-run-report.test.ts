import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Command } from "commander";
import type { Session } from "@trail/schema";

// A realistic Anthropic key shape (sk-ant- + 30 opaque chars). Kept as a
// single constant so the test can assert the raw value never appears in the
// auditable report output.
const RAW_SECRET = "sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
const RAW_EMAIL = "alice.builder@example.com";
const RAW_PATH = "/Users/aliceb/projects/secret-thing/main.ts";

describe("trail share --dry-run redaction report", () => {
  let tmp: string;
  let prevHome: string | undefined;

  beforeEach(async () => {
    tmp = mkdtempSync(path.join(tmpdir(), "trail-share-report-"));
    prevHome = process.env.HOME;
    process.env.HOME = tmp;
    // db module is a singleton on first import; the HOME hop doesn't redirect
    // an already-open connection. Wipe rows so each test starts clean.
    const { db } = await import("../src/db.js");
    db.exec(`DELETE FROM events_fts; DELETE FROM events; DELETE FROM sessions;`);
  });

  afterEach(() => {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    rmSync(tmp, { recursive: true, force: true });
  });

  function mkSession(id: string): Session {
    return {
      id,
      user: "alice",
      tool: "claude-code",
      startedAt: "2026-01-01T00:00:00.000Z",
      events: [
        {
          kind: "prompt",
          at: "2026-01-01T00:00:01.000Z",
          text: `here is my key ${RAW_SECRET} and email ${RAW_EMAIL}`,
        },
        {
          kind: "decision",
          at: "2026-01-01T00:00:02.000Z",
          note: `editing ${RAW_PATH} now`,
        },
      ],
    };
  }

  async function runDryRun(id: string): Promise<string> {
    const { saveSession } = await import("../src/db.js");
    saveSession(mkSession(id), "/tmp/a.jsonl");

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
      await cmd.parseAsync(["share", id, "--dry-run"], { from: "user" });
    } finally {
      console.log = origLog;
    }
    return logs.join("\n");
  }

  it("prints a grouped, auditable breakdown of what will be removed", async () => {
    const out = await runDryRun("sess-report-1");

    expect(out).toContain("redaction report");
    // Category labels grouped most-sensitive first.
    expect(out).toContain("Secrets / API keys");
    expect(out).toContain("Email addresses");
    expect(out).toContain("Absolute paths");
    // Replacement markers (labels) show what each match became.
    expect(out).toContain("<redacted:anthropic>");
    expect(out).toContain("<redacted:email>");
    // Locations point back to the originating JSON path.
    expect(out).toMatch(/\$\.events\[0\]/);
    expect(out).toMatch(/\$\.events\[1\]/);
  });

  it("never leaks the raw secret, email, or absolute path", async () => {
    const out = await runDryRun("sess-report-2");

    expect(out).not.toContain(RAW_SECRET);
    expect(out).not.toContain(RAW_EMAIL);
    expect(out).not.toContain(RAW_PATH);
    // The username embedded in the path must be scrubbed to the anon stand-in.
    expect(out).not.toContain("/Users/aliceb");
    expect(out).toContain("/Users/anon");
  });

  it("reports a clean result when nothing matches", async () => {
    const { saveSession } = await import("../src/db.js");
    const clean: Session = {
      id: "sess-clean",
      user: "alice",
      tool: "claude-code",
      startedAt: "2026-01-01T00:00:00.000Z",
      events: [{ kind: "prompt", at: "2026-01-01T00:00:01.000Z", text: "just a normal prompt" }],
    };
    saveSession(clean, "/tmp/clean.jsonl");

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
      await cmd.parseAsync(["share", "sess-clean", "--dry-run"], { from: "user" });
    } finally {
      console.log = origLog;
    }
    const out = logs.join("\n");
    expect(out).toContain("nothing matched");
  });
});
