import { describe, it, expect } from "vitest";
import { aggregate, type SessionInput } from "./aggregate";

const mkSession = (overrides: Partial<SessionInput> = {}): SessionInput => ({
  id: "s1",
  slug: "s1",
  title: null,
  summary: null,
  startedAt: new Date("2026-05-18T10:00:00Z"),
  endedAt: new Date("2026-05-18T11:00:00Z"),
  durationSeconds: 3600,
  models: ["claude-opus-4.7"],
  toolsUsed: ["cursor"],
  frameworks: ["next.js"],
  taskType: "shipped",
  outcome: "shipped",
  linkedRepo: "janfaris/trail",
  linkedCommitSha: "abc123",
  receiptStatus: "shipped",
  promptCount: 12,
  distinctFiles: 4,
  failedToolCalls: 0,
  ...overrides,
});

describe("aggregate()", () => {
  it("returns zeroed payload for empty session list", () => {
    const p = aggregate([], { tier: "weekly" });
    expect(p.sessionCount).toBe(0);
    expect(p.shippedRatio).toBe(0);
    expect(p.vibeScore).toBe(0);
    expect(p.velocity).toEqual([]);
  });

  it("counts shipped via outcome OR receiptStatus", () => {
    const sessions = [
      mkSession({ id: "a", outcome: "shipped", receiptStatus: null }),
      mkSession({ id: "b", outcome: null, receiptStatus: "shipped" }),
      mkSession({ id: "c", outcome: "abandoned", receiptStatus: "draft" }),
    ];
    const p = aggregate(sessions, { tier: "monthly" });
    expect(p.sessionCount).toBe(3);
    expect(p.shippedCount).toBe(2);
    expect(p.shippedRatio).toBeCloseTo(2 / 3);
  });

  it("ranks top models by frequency", () => {
    const sessions = [
      mkSession({ id: "a", models: ["claude-opus-4.7", "gpt-5"] }),
      mkSession({ id: "b", models: ["claude-opus-4.7"] }),
      mkSession({ id: "c", models: ["gpt-5"] }),
    ];
    const p = aggregate(sessions, { tier: "weekly" });
    expect(p.topModels[0].name).toBe("claude-opus-4.7");
    expect(p.topModels[0].count).toBe(2);
    expect(p.topModels[1].name).toBe("gpt-5");
  });

  it("sets sessionId for pulse/project, null for windowed tiers", () => {
    const s = mkSession();
    expect(aggregate([s], { tier: "pulse" }).sessionId).toBe("s1");
    expect(aggregate([s], { tier: "project" }).sessionId).toBe("s1");
    expect(aggregate([s], { tier: "weekly" }).sessionId).toBeNull();
    expect(aggregate([s], { tier: "wrapped" }).sessionId).toBeNull();
  });

  it("populates velocity only for windowed tiers", () => {
    const s = mkSession();
    expect(aggregate([s], { tier: "pulse" }).velocity).toEqual([]);
    expect(aggregate([s], { tier: "weekly" }).velocity.length).toBe(1);
  });

  it("vibe score bounded 0..100", () => {
    const allShipped = Array.from({ length: 8 }, (_, i) =>
      mkSession({
        id: `s${i}`,
        startedAt: new Date(`2026-${String(1 + i).padStart(2, "0")}-15T10:00:00Z`),
        endedAt: new Date(`2026-${String(1 + i).padStart(2, "0")}-15T11:00:00Z`),
        models: ["claude-opus-4.7", "gpt-5", "grok-4.2"],
        toolsUsed: ["cursor", "claude-code"],
        frameworks: ["next.js", "drizzle"],
        linkedRepo: `janfaris/proj-${i}`,
      }),
    );
    const score = aggregate(allShipped, { tier: "wrapped" }).vibeScore;
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThan(60); // shipped+diverse should score well
  });

  it("vibe score is monotonic in shipped ratio (holding stack constant)", () => {
    const base = (shippedCount: number, total: number) =>
      Array.from({ length: total }, (_, i) =>
        mkSession({
          id: `s${i}`,
          outcome: i < shippedCount ? "shipped" : "abandoned",
          receiptStatus: null,
        }),
      );
    const lower = aggregate(base(2, 10), { tier: "weekly" }).vibeScore;
    const higher = aggregate(base(8, 10), { tier: "weekly" }).vibeScore;
    expect(higher).toBeGreaterThan(lower);
  });
});
