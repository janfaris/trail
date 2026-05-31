import { describe, expect, it } from "vitest";
import {
  type BuilderRowInput,
  type EntityStat,
  type RankableEntitySession,
  displayLabel,
  entityHref,
  rankEntities,
  rankEntitySessions,
  sessionHref,
  sessionScore,
  smoothedShippedRate,
  summarizeOutcomes,
  topBuilders,
} from "./entity-tags";

describe("entityHref / sessionHref", () => {
  it("builds plural entity paths", () => {
    expect(entityHref("tool", "cursor")).toBe("/tools/cursor");
    expect(entityHref("framework", "nextjs")).toBe("/frameworks/nextjs");
  });
  it("builds session permalinks", () => {
    expect(sessionHref("ada", "my-session")).toBe("/u/ada/my-session");
  });
});

describe("displayLabel", () => {
  it("prefers a non-empty stored label", () => {
    expect(displayLabel("nextjs", "Next.js")).toBe("Next.js");
  });
  it("falls back to canonical label when stored is blank", () => {
    expect(displayLabel("nextjs", "  ")).toBe("Next.js");
    expect(displayLabel("nextjs", null)).toBe("Next.js");
  });
  it("titleizes an unknown slug as a last resort", () => {
    expect(displayLabel("some-new-tool", null)).toBe("Some New Tool");
  });
});

describe("summarizeOutcomes", () => {
  it("counts each bucket and computes shipped rate", () => {
    const s = summarizeOutcomes([
      { outcome: "shipped" },
      { outcome: "shipped" },
      { outcome: "abandoned" },
      { outcome: "rabbithole" },
      { outcome: null },
      { outcome: "weird-unknown-value" },
    ]);
    expect(s.total).toBe(6);
    expect(s.shipped).toBe(2);
    expect(s.abandoned).toBe(1);
    expect(s.rabbithole).toBe(1);
    expect(s.unknown).toBe(2);
    expect(s.shippedRate).toBeCloseTo(2 / 6);
  });
  it("is safe on empty input", () => {
    const s = summarizeOutcomes([]);
    expect(s.total).toBe(0);
    expect(s.shippedRate).toBe(0);
  });
});

describe("smoothedShippedRate", () => {
  it("returns 0 for no sessions", () => {
    expect(smoothedShippedRate(0, 0)).toBe(0);
  });
  it("pulls a sparse 1/1 below a proven 20/30", () => {
    const sparse = smoothedShippedRate(1, 1);
    const proven = smoothedShippedRate(20, 30);
    expect(sparse).toBeLessThan(proven);
  });
});

describe("sessionScore", () => {
  const base: RankableEntitySession = {
    id: "a",
    outcome: "abandoned",
    receiptStatus: null,
    startedAt: new Date("2024-01-01"),
    sharedAt: null,
    positiveReactions: 0,
    negativeReactions: 0,
  };
  it("rewards shipped + verified receipt + positive reactions", () => {
    const strong = sessionScore({
      ...base,
      outcome: "shipped",
      receiptStatus: "shipped",
      positiveReactions: 3,
    });
    expect(strong).toBe(3 * 2 + 3 + 2); // pos*2 + outcome(shipped=3) + receipt(2)
  });
  it("penalizes negative reactions", () => {
    const flagged = sessionScore({ ...base, outcome: "shipped", negativeReactions: 4 });
    const clean = sessionScore({ ...base, outcome: "shipped" });
    expect(flagged).toBeLessThan(clean);
  });
});

describe("rankEntitySessions", () => {
  const mk = (over: Partial<RankableEntitySession>): RankableEntitySession => ({
    id: "x",
    outcome: null,
    receiptStatus: null,
    startedAt: new Date("2024-01-01"),
    sharedAt: null,
    positiveReactions: 0,
    negativeReactions: 0,
    ...over,
  });
  it("orders by score desc, then recency, then id desc; pure", () => {
    const input = [
      mk({ id: "low", outcome: "abandoned" }),
      mk({ id: "high", outcome: "shipped", positiveReactions: 5 }),
      mk({ id: "mid", outcome: "rabbithole" }),
    ];
    const copy = [...input];
    const out = rankEntitySessions(input);
    expect(out.map((r) => r.id)).toEqual(["high", "mid", "low"]);
    expect(input).toEqual(copy); // not mutated
  });
  it("breaks score ties by recency then id desc", () => {
    const out = rankEntitySessions([
      mk({ id: "older", outcome: "shipped", sharedAt: new Date("2024-01-01") }),
      mk({ id: "newer", outcome: "shipped", sharedAt: new Date("2024-06-01") }),
    ]);
    expect(out.map((r) => r.id)).toEqual(["newer", "older"]);
  });
});

describe("rankEntities", () => {
  const mk = (over: Partial<EntityStat>): EntityStat => ({
    tag: "t",
    label: null,
    sessions: 0,
    builders: 0,
    shipped: 0,
    ...over,
  });
  it("sorts by sessions desc first", () => {
    const out = rankEntities([
      mk({ tag: "a", sessions: 2, shipped: 2 }),
      mk({ tag: "b", sessions: 10, shipped: 3 }),
    ]);
    expect(out.map((r) => r.tag)).toEqual(["b", "a"]);
  });
  it("breaks usage ties by smoothed shipped rate", () => {
    const out = rankEntities([
      mk({ tag: "weak", sessions: 5, shipped: 1 }),
      mk({ tag: "strong", sessions: 5, shipped: 5 }),
    ]);
    expect(out.map((r) => r.tag)).toEqual(["strong", "weak"]);
  });
});

describe("topBuilders", () => {
  const rows: BuilderRowInput[] = [
    { handle: "ada", name: "Ada", image: null, outcome: "shipped" },
    { handle: "ada", name: "Ada", image: null, outcome: "abandoned" },
    { handle: "grace", name: "Grace", image: null, outcome: "shipped" },
    { handle: null, name: "ghost", image: null, outcome: "shipped" },
  ];
  it("rolls up by handle, skipping null handles", () => {
    const out = topBuilders(rows);
    expect(out).toHaveLength(2);
    const ada = out.find((b) => b.handle === "ada");
    expect(ada?.sessions).toBe(2);
    expect(ada?.shipped).toBe(1);
  });
  it("respects the limit", () => {
    expect(topBuilders(rows, 1)).toHaveLength(1);
  });
});
