import { describe, expect, it } from "vitest";
import { parseSessionLessons } from "./session-lessons";

describe("parseSessionLessons", () => {
  it("sanitizes sensitive strings and normalizes lesson metadata", () => {
    const lessons = parseSessionLessons(
      JSON.stringify({
        lessons: [
          {
            title: "Use guarded publish flow from /Users/janfaris/trail",
            whatToSteal:
              "Copy the publish guard but never expose ghp_123456789012345678901234567890123456.",
            useWhen: "When a public receipt depends on proof from https://internal.example.test",
            promptPattern: "Ask the agent to verify build, then publish.",
            decision: "Keep visibility out of derived tables.",
            failureMode: "Draft receipts need proof.",
            proof: "See event 2 and jan@example.com",
            stack: ["Next.js", "NEXTJS", "Postgres"],
            tags: ["Public receipts", "public_receipts"],
            sourceEventIdxs: [2, 99],
            transferabilityScore: 9,
            confidence: "certain",
          },
        ],
      }),
      new Set([2]),
    );

    expect(lessons).toHaveLength(1);
    expect(lessons?.[0]).toMatchObject({
      schemaVersion: 1,
      transferabilityScore: 5,
      confidence: "medium",
      stack: ["next.js", "nextjs", "postgres"],
      sourceEventIdxs: [2],
    });
    expect(lessons?.[0]?.title).toContain("[path]");
    expect(lessons?.[0]?.whatToSteal).toContain("[token]");
    expect(lessons?.[0]?.useWhen).toContain("[url]");
    expect(lessons?.[0]?.proof).toContain("[email]");
  });

  it("rejects lessons that do not cite valid source events", () => {
    const lessons = parseSessionLessons(
      JSON.stringify({
        lessons: [
          {
            title: "Good sounding lesson",
            whatToSteal: "Copy this move.",
            useWhen: "When debugging.",
            proof: "The transcript says it happened.",
            sourceEventIdxs: [42],
            transferabilityScore: 3,
            confidence: "high",
          },
        ],
      }),
      new Set([1]),
    );

    expect(lessons).toEqual([]);
  });

  it("rejects generic lesson copy without a concrete reusable move", () => {
    const lessons = parseSessionLessons(
      JSON.stringify({
        lessons: [
          {
            title: "Follow best practices",
            whatToSteal: "Ensure that you leverage best practices for better outcomes.",
            useWhen: "When building software.",
            proof: "Event 1 says this happened.",
            sourceEventIdxs: [1],
            transferabilityScore: 3,
            confidence: "medium",
          },
        ],
      }),
      new Set([1]),
    );

    expect(lessons).toEqual([]);
  });

  it("truncates long proof at a readable boundary", () => {
    const lessons = parseSessionLessons(
      JSON.stringify({
        lessons: [
          {
            title: "Use Biome package filters",
            whatToSteal: "Run `pnpm --filter <pkg> lint` before the full monorepo check.",
            useWhen: "When a Turbo monorepo has one package failing lint.",
            proof: `${"This sentence has enough concrete proof. ".repeat(12)}TrailingWordWithoutBoundary`,
            sourceEventIdxs: [1],
            transferabilityScore: 4,
            confidence: "high",
          },
        ],
      }),
      new Set([1]),
    );

    expect(lessons).toHaveLength(1);
    expect(lessons?.[0]?.proof).toMatch(/[.]$/);
    expect(lessons?.[0]?.proof).not.toContain("TrailingWordWithoutBoundary");
  });
});
