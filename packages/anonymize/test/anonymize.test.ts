import { describe, it, expect } from "vitest";
import { anonymize } from "../src/index.js";
import type { Session } from "@trail/schema";

function s(events: Session["events"]): Session {
  return {
    id: "sess-1",
    user: "alice",
    tool: "claude-code",
    startedAt: "2025-01-01T00:00:00Z",
    events,
  };
}

describe("anonymize", () => {
  it("scrubs OpenAI/Anthropic/GitHub/Stripe/AWS keys + JWTs", () => {
    const r = anonymize(
      s([
        { kind: "prompt", at: "t", text: "key=sk-ant-abc123def456ghi789jkl012mno" },
        { kind: "completion", at: "t", text: "openai sk-proj-abcdefghijklmnopqrstuvwx" },
        { kind: "completion", at: "t", text: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" },
        { kind: "completion", at: "t", text: "stripe sk_live_abcdefghijklmnopqrstuv" },
        { kind: "completion", at: "t", text: "AKIAIOSFODNN7EXAMPLE" },
        { kind: "completion", at: "t", text: "eyJhbGciOiJIUzI1NiIs.eyJzdWIiOiIxMjM0NQ.SflKxwRJSMeKKF2QT" },
      ]),
    );
    expect(r.report.byCategory.secret).toBeGreaterThanOrEqual(6);
    const allText = JSON.stringify(r.session);
    expect(allText).not.toMatch(/sk-ant-abc/);
    expect(allText).not.toMatch(/sk-proj-/);
    expect(allText).not.toMatch(/ghp_/);
    expect(allText).not.toMatch(/AKIA/);
  });

  it("scrubs home paths", () => {
    const r = anonymize(s([{ kind: "decision", at: "t", note: "saw /Users/janfaris/trail/foo.ts" }]));
    expect(r.report.byCategory.path).toBe(1);
    expect((r.session.events[0] as { note: string }).note).toContain("/Users/anon/trail/foo.ts");
  });

  it("scrubs emails", () => {
    const r = anonymize(s([{ kind: "prompt", at: "t", text: "ping me at jan@example.com" }]));
    expect(r.report.byCategory.email).toBe(1);
    expect((r.session.events[0] as { text: string }).text).toContain("<redacted:email>");
  });

  it("scrubs internal hosts", () => {
    const r = anonymize(s([{ kind: "prompt", at: "t", text: "see http://api.corp.internal/v1/foo" }]));
    expect(r.report.byCategory["internal-host"]).toBe(1);
  });

  it("is idempotent", () => {
    const input = s([
      { kind: "prompt", at: "t", text: "key=sk-ant-abc123def456ghi789jkl012m at /Users/jan/repo" },
    ]);
    const a = anonymize(input).session;
    const b = anonymize(a).session;
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("walks nested tool_call args and results", () => {
    const r = anonymize(
      s([
        {
          kind: "tool_call",
          at: "t",
          name: "bash",
          args: { cmd: "echo ghp_abcdefghijklmnopqrstuvwxyz0123456789" },
          result: { stdout: "user@example.com" },
        },
      ]),
    );
    expect(r.report.byCategory.secret).toBeGreaterThanOrEqual(1);
    expect(r.report.byCategory.email).toBe(1);
  });
});
