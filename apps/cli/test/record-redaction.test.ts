import { describe, it, expect } from "vitest";
import { redactSessionForCapture } from "../src/lib/capture-redact.js";
import type { Session } from "@trail/schema";

const RAW_KEY = "sk-test-abc123def456ghi789jkl012mno345pq";
const RAW_EMAIL = "user@example.com";

function fakeSession(): Session {
  return {
    id: "test-session-1",
    user: "alice",
    tool: "claude-code",
    startedAt: "2026-01-01T00:00:00.000Z",
    events: [
      {
        kind: "prompt",
        at: "2026-01-01T00:00:01.000Z",
        text: `Use the key ${RAW_KEY} and ping ${RAW_EMAIL} when ready.`,
      },
      {
        kind: "tool_call",
        at: "2026-01-01T00:00:02.000Z",
        name: "http",
        args: { authorization: `Bearer ${RAW_KEY}` },
      },
    ],
  };
}

describe("redactSessionForCapture", () => {
  it("strips raw secrets and emails before persistence", () => {
    const { session, redactionCount, redactedAt } = redactSessionForCapture(
      fakeSession(),
    );
    const serialized = JSON.stringify(session);
    expect(serialized).not.toContain(RAW_KEY);
    expect(serialized).not.toContain(RAW_EMAIL);
    expect(redactionCount).toBeGreaterThan(0);
    expect(typeof redactedAt).toBe("string");
    expect(() => new Date(redactedAt).toISOString()).not.toThrow();
  });

  it("preserves session id and event count", () => {
    const original = fakeSession();
    const { session } = redactSessionForCapture(original);
    expect(session.id).toBe(original.id);
    expect(session.events.length).toBe(original.events.length);
  });
});
