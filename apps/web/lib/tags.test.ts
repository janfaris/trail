import { describe, expect, it } from "vitest";
import { canonicalLabel, extractSessionTags, slugifyTag } from "./tags";

describe("slugifyTag", () => {
  it("lowercases and collapses punctuation/whitespace", () => {
    expect(slugifyTag("Tailwind CSS")).toBe("tailwindcss");
    expect(slugifyTag("Visual Studio Code")).toBe("vscode");
  });

  it("normalizes the .js suffix variants to a single slug", () => {
    expect(slugifyTag("Next.js")).toBe("nextjs");
    expect(slugifyTag("Next js")).toBe("nextjs");
    expect(slugifyTag("nextjs")).toBe("nextjs");
    expect(slugifyTag("React.js")).toBe("react");
    expect(slugifyTag("Node.js")).toBe("nodejs");
  });

  it("applies the conservative alias map", () => {
    expect(slugifyTag("Postgres")).toBe("postgresql");
    expect(slugifyTag("golang")).toBe("go");
    expect(slugifyTag("Vue.js")).toBe("vue");
  });

  it("does not over-map ambiguous bare terms", () => {
    // bare "next" is intentionally left alone (could be unrelated)
    expect(slugifyTag("next")).toBe("next");
  });

  it("returns empty string for unusable input", () => {
    expect(slugifyTag("")).toBe("");
    expect(slugifyTag("   ")).toBe("");
    expect(slugifyTag("!!!")).toBe("");
  });
});

describe("canonicalLabel", () => {
  it("uses explicit display labels for known slugs", () => {
    expect(canonicalLabel("nextjs")).toBe("Next.js");
    expect(canonicalLabel("tailwindcss")).toBe("Tailwind CSS");
    expect(canonicalLabel("postgresql")).toBe("PostgreSQL");
  });

  it("titleizes unknown slugs", () => {
    expect(canonicalLabel("svelte-kit")).toBe("Svelte Kit");
    expect(canonicalLabel("fastapi")).toBe("Fastapi");
  });

  it("returns empty string for empty slug", () => {
    expect(canonicalLabel("")).toBe("");
  });
});

describe("extractSessionTags", () => {
  it("projects the vendor tool at confidence 1.0 and arrays at 0.9", () => {
    const tags = extractSessionTags({
      tool: "cursor",
      toolsUsed: ["ESLint"],
      frameworks: ["Next.js"],
      models: ["gpt-5"],
    });
    expect(tags).toContainEqual({
      tag: "cursor",
      label: "Cursor",
      kind: "tool",
      confidence: 1.0,
      source: "llm",
    });
    expect(tags).toContainEqual({
      tag: "eslint",
      label: "ESLint",
      kind: "tool",
      confidence: 0.9,
      source: "llm",
    });
    expect(tags).toContainEqual({
      tag: "nextjs",
      label: "Next.js",
      kind: "framework",
      confidence: 0.9,
      source: "llm",
    });
    expect(tags).toContainEqual({
      tag: "gpt-5",
      label: "Gpt 5",
      kind: "model",
      confidence: 0.9,
      source: "llm",
    });
  });

  it("dedupes within a (kind, tag) pair, keeping the first (highest-confidence) occurrence", () => {
    // vendor tool "cursor" and toolsUsed "Cursor" collapse to one tool row
    const tags = extractSessionTags({
      tool: "cursor",
      toolsUsed: ["Cursor", "cursor"],
    });
    const cursorRows = tags.filter((t) => t.kind === "tool" && t.tag === "cursor");
    expect(cursorRows).toHaveLength(1);
    expect(cursorRows[0]?.confidence).toBe(1.0);
  });

  it("allows the same slug under different kinds", () => {
    const tags = extractSessionTags({
      toolsUsed: ["React"],
      frameworks: ["React"],
    });
    expect(tags.filter((t) => t.tag === "react")).toHaveLength(2);
    expect(tags.map((t) => t.kind).sort()).toEqual(["framework", "tool"]);
  });

  it("skips empty/unusable labels and handles null arrays", () => {
    const tags = extractSessionTags({
      tool: null,
      toolsUsed: ["", "  ", "ESLint"],
      frameworks: null,
      models: undefined,
    });
    expect(tags).toHaveLength(1);
    expect(tags[0]?.tag).toBe("eslint");
  });

  it("returns an empty array when there is nothing to extract", () => {
    expect(extractSessionTags({})).toEqual([]);
  });

  it("ignores non-string array elements without throwing", () => {
    const tags = extractSessionTags({
      // Simulate a corrupt jsonb payload with mixed element types.
      toolsUsed: [123, null, "Cursor", { x: 1 }] as unknown as string[],
    });
    expect(tags).toHaveLength(1);
    expect(tags[0]?.tag).toBe("cursor");
  });
});
