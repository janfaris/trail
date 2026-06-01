import { describe, expect, it } from "vitest";
import { classifyRadarSignal } from "./radar-classifier";

describe("classifyRadarSignal", () => {
  it("keeps leak claims in the rumor bucket", () => {
    const signal = classifyRadarSignal({
      text: "Leak: a new Claude coding model is apparently rolling out with better SWE-bench scores.",
      metrics: { like_count: 120, reply_count: 8, retweet_count: 12, bookmark_count: 20 },
    });

    expect(signal.category).toBe("rumor");
    expect(signal.tags).toContain("rumor");
    expect(signal.whyBuildersCare).toContain("claim");
    expect(signal.score).toBeGreaterThan(0);
  });

  it("prioritizes benchmark claims when no rumor language is present", () => {
    const signal = classifyRadarSignal({
      text: "New SWE-bench leaderboard shows a big jump for coding agents on real GitHub issues.",
      metrics: { like_count: 10 },
    });

    expect(signal.category).toBe("benchmark");
    expect(signal.testPrompt).toContain("realistic task");
  });

  it("strips URLs from summaries and keeps titles compact", () => {
    const signal = classifyRadarSignal({
      text: "Claude Code workflow guide: ask the agent to write failing tests first, then iterate. https://t.co/example",
      metrics: {},
    });

    expect(signal.category).toBe("tool_workflow");
    expect(signal.summary).not.toContain("https://");
    expect(signal.title.length).toBeLessThanOrEqual(92);
  });
});
