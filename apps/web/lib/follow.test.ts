import { describe, expect, it } from "vitest";
import {
  type RankableSession,
  canFollow,
  normalizeFeedView,
  rankFeed,
  toggleDecision,
} from "./follow";

describe("normalizeFeedView", () => {
  it("defaults to the public everyone feed", () => {
    expect(normalizeFeedView(undefined)).toBe("everyone");
    expect(normalizeFeedView(null)).toBe("everyone");
    expect(normalizeFeedView("")).toBe("everyone");
    expect(normalizeFeedView("popular")).toBe("everyone");
  });

  it("accepts the signed-in following feed", () => {
    expect(normalizeFeedView("following")).toBe("following");
  });

  it("normalizes repeated query params from the first value", () => {
    expect(normalizeFeedView(["following", "everyone"])).toBe("following");
    expect(normalizeFeedView(["everyone", "following"])).toBe("everyone");
  });
});

describe("canFollow", () => {
  it("allows following a different, valid user", () => {
    expect(canFollow("a", "b")).toBe(true);
  });

  it("rejects self-follow", () => {
    expect(canFollow("a", "a")).toBe(false);
  });

  it("rejects empty ids", () => {
    expect(canFollow("", "b")).toBe(false);
    expect(canFollow("a", "")).toBe(false);
    expect(canFollow("", "")).toBe(false);
  });
});

describe("toggleDecision", () => {
  it("removes when a row already exists", () => {
    expect(toggleDecision(true)).toBe("removed");
  });

  it("adds when no row exists", () => {
    expect(toggleDecision(false)).toBe("added");
  });
});

function row(p: Partial<RankableSession> & { id: string }): RankableSession {
  return {
    visibility: "public",
    sharedAt: new Date("2024-01-01T00:00:00Z"),
    startedAt: new Date("2024-01-01T00:00:00Z"),
    ...p,
  };
}

describe("rankFeed", () => {
  it("drops non-public sessions", () => {
    const out = rankFeed([
      row({ id: "1", visibility: "public" }),
      row({ id: "2", visibility: "pending" }),
      row({ id: "3", visibility: "private" }),
      row({ id: "4", visibility: "redacted" }),
    ]);
    expect(out.map((r) => r.id)).toEqual(["1"]);
  });

  it("orders by sharedAt desc", () => {
    const out = rankFeed([
      row({ id: "old", sharedAt: new Date("2024-01-01T00:00:00Z") }),
      row({ id: "new", sharedAt: new Date("2024-03-01T00:00:00Z") }),
      row({ id: "mid", sharedAt: new Date("2024-02-01T00:00:00Z") }),
    ]);
    expect(out.map((r) => r.id)).toEqual(["new", "mid", "old"]);
  });

  it("drops public sessions that have not been explicitly shared", () => {
    const out = rankFeed([
      row({ id: "a", sharedAt: null, startedAt: new Date("2024-01-01T00:00:00Z") }),
      row({ id: "b", sharedAt: null, startedAt: new Date("2024-05-01T00:00:00Z") }),
    ]);
    expect(out).toEqual([]);
  });

  it("does not rank startedAt-only rows above shared receipts", () => {
    const out = rankFeed([
      row({ id: "started-only", sharedAt: null, startedAt: new Date("2024-06-01T00:00:00Z") }),
      row({
        id: "shared",
        sharedAt: new Date("2024-02-01T00:00:00Z"),
        startedAt: new Date("2024-01-01T00:00:00Z"),
      }),
    ]);
    expect(out.map((r) => r.id)).toEqual(["shared"]);
  });

  it("handles string timestamps", () => {
    const out = rankFeed([
      row({ id: "a", sharedAt: "2024-01-01T00:00:00Z" }),
      row({ id: "b", sharedAt: "2024-09-01T00:00:00Z" }),
    ]);
    expect(out.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("dedupes by id, keeping the first occurrence", () => {
    const out = rankFeed([
      row({ id: "dup", sharedAt: new Date("2024-01-01T00:00:00Z") }),
      row({ id: "dup", sharedAt: new Date("2024-09-01T00:00:00Z") }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("dup");
  });

  it("breaks ties deterministically by id desc", () => {
    const t = new Date("2024-01-01T00:00:00Z");
    const out = rankFeed([
      row({ id: "a", sharedAt: t }),
      row({ id: "c", sharedAt: t }),
      row({ id: "b", sharedAt: t }),
    ]);
    expect(out.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      row({ id: "a", sharedAt: new Date("2024-01-01T00:00:00Z") }),
      row({ id: "b", sharedAt: new Date("2024-09-01T00:00:00Z") }),
    ];
    const snapshot = input.map((r) => r.id);
    rankFeed(input);
    expect(input.map((r) => r.id)).toEqual(snapshot);
  });

  it("ignores invalid share dates without crashing", () => {
    const out = rankFeed([
      row({ id: "bad", sharedAt: "not-a-date", startedAt: new Date("2024-01-01T00:00:00Z") }),
      row({ id: "good", sharedAt: new Date("2024-09-01T00:00:00Z") }),
    ]);
    expect(out.map((r) => r.id)).toEqual(["good"]);
  });
});
