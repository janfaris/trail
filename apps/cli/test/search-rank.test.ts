import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Session } from "@trail/schema";

// db.ts opens a singleton connection on first import, keyed off $HOME at that
// moment. We must swap HOME to a throwaway dir and import the db-coupled
// modules dynamically *inside* beforeAll so we never touch the real ~/.trail.
type SearchMod = typeof import("../src/commands/search.js");
type DbMod = typeof import("../src/db.js");

let search: SearchMod;
let dbMod: DbMod;
let home: string;
let prevHome: string | undefined;

const NOW = Date.parse("2026-02-01T00:00:00.000Z");

interface RawHit {
  sessionId: string;
  bm25: number;
  snippet: string;
  tool: string;
  startedAt: string;
  repo: string | null;
}

function raw(partial: Partial<RawHit> & { sessionId: string; bm25: number }): RawHit {
  return {
    snippet: `snip-${partial.sessionId}`,
    tool: "claude-code",
    startedAt: "2026-01-15T00:00:00.000Z",
    repo: null,
    ...partial,
  };
}

beforeAll(async () => {
  home = mkdtempSync(path.join(tmpdir(), "trail-search-"));
  prevHome = process.env.HOME;
  process.env.HOME = home;
  search = await import("../src/commands/search.js");
  dbMod = await import("../src/db.js");
});

afterAll(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
});

describe("sanitizeFtsQuery", () => {
  it("quotes and ANDs each alphanumeric token", () => {
    expect(search.sanitizeFtsQuery("hello world")).toBe('"hello" "world"');
  });

  it("strips punctuation and operator characters that break FTS5", () => {
    expect(search.sanitizeFtsQuery("foo-bar: baz!")).toBe('"foo" "bar" "baz"');
  });

  it("returns empty string when there are no searchable tokens", () => {
    expect(search.sanitizeFtsQuery("!!! ??? ...")).toBe("");
    expect(search.sanitizeFtsQuery("")).toBe("");
  });

  it("keeps unicode letters and underscores intact", () => {
    expect(search.sanitizeFtsQuery("café_naïve")).toBe('"café_naïve"');
  });
});

describe("recencyBonus", () => {
  it("is larger for more recent sessions", () => {
    const fresh = search.recencyBonus("2026-01-31T00:00:00.000Z", NOW);
    const stale = search.recencyBonus("2025-06-01T00:00:00.000Z", NOW);
    expect(fresh).toBeGreaterThan(stale);
  });

  it("decays toward zero for very old sessions", () => {
    const ancient = search.recencyBonus("2020-01-01T00:00:00.000Z", NOW);
    expect(ancient).toBeGreaterThanOrEqual(0);
    expect(ancient).toBeLessThan(0.01);
  });

  it("returns 0 for an unparseable date", () => {
    expect(search.recencyBonus("not-a-date", NOW)).toBe(0);
  });
});

describe("rankSessionHits", () => {
  it("collapses multiple event hits down to the best hit per session", () => {
    const hits = search.rankSessionHits(
      [
        raw({ sessionId: "A", bm25: -2, snippet: "weak-A" }),
        raw({ sessionId: "A", bm25: -5, snippet: "strong-A" }),
        raw({ sessionId: "B", bm25: -3, snippet: "B" }),
      ],
      NOW,
    );
    expect(hits).toHaveLength(2);
    const a = hits.find((h) => h.sessionId === "A");
    expect(a?.snippet).toBe("strong-A");
    expect(a?.relevance).toBe(5);
  });

  it("orders by blended score (stronger relevance first)", () => {
    const hits = search.rankSessionHits(
      [raw({ sessionId: "A", bm25: -5 }), raw({ sessionId: "B", bm25: -3 })],
      NOW,
    );
    expect(hits.map((h) => h.sessionId)).toEqual(["A", "B"]);
  });

  it("breaks ties on recency (newer session first)", () => {
    const hits = search.rankSessionHits(
      [
        raw({ sessionId: "OLD", bm25: -4, startedAt: "2026-01-01T00:00:00.000Z" }),
        raw({ sessionId: "NEW", bm25: -4, startedAt: "2026-01-31T00:00:00.000Z" }),
      ],
      NOW,
    );
    expect(hits[0]?.sessionId).toBe("NEW");
  });
});

describe("runLocalSearch (integration)", () => {
  beforeEach(() => {
    dbMod.db.exec("DELETE FROM events_fts; DELETE FROM events; DELETE FROM sessions;");
  });

  function mkSession(id: string, day: number, prompt: string, body: string): Session {
    const d = String(day).padStart(2, "0");
    return {
      id,
      user: "alice",
      tool: "claude-code",
      startedAt: `2026-01-${d}T00:00:00.000Z`,
      repo: "alice/widgets",
      events: [
        { kind: "prompt", at: `2026-01-${d}T00:00:01.000Z`, text: prompt },
        { kind: "completion", at: `2026-01-${d}T00:00:02.000Z`, text: body },
      ],
    };
  }

  it("matches, ranks, titles and snippets local sessions", () => {
    dbMod.saveSession(
      mkSession("sess-kafka01", 5, "set up kafka consumer", "added a kafka consumer group"),
      "/tmp/a",
    );
    dbMod.saveSession(
      mkSession("sess-redis02", 6, "wire up redis cache", "redis cache online"),
      "/tmp/b",
    );
    dbMod.saveSession(mkSession("sess-other03", 7, "fix the css layout", "layout fixed"), "/tmp/c");

    const hits = search.runLocalSearch("kafka", 20, NOW);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.sessionId).toBe("sess-kafka01");
    expect(hits[0]?.title).toBe("set up kafka consumer");
    expect(hits[0]?.snippet.toLowerCase()).toContain("kafka");
  });

  it("does not throw on punctuation-heavy queries (raw → sanitized fallback)", () => {
    dbMod.saveSession(
      mkSession("sess-deploy01", 5, "deploy to prod", "deployed to prod"),
      "/tmp/a",
    );
    expect(() => search.runLocalSearch("deploy:", 20, NOW)).not.toThrow();
    expect(search.runLocalSearch("deploy:", 20, NOW)[0]?.sessionId).toBe("sess-deploy01");
  });

  it("returns nothing for an empty/punctuation-only query", () => {
    dbMod.saveSession(mkSession("sess-any01", 5, "hello there", "general kenobi"), "/tmp/a");
    expect(search.runLocalSearch("!!!", 20, NOW)).toEqual([]);
  });
});
