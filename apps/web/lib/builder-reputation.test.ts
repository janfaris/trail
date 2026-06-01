import { describe, expect, it } from "vitest";
import { computeBuilderReputation } from "./builder-reputation";

describe("computeBuilderReputation", () => {
  it("clamps invalid metrics and starts as a new signal", () => {
    expect(
      computeBuilderReputation({
        publicReceipts: -1,
        verifiedShips: Number.NaN,
        extractedLessons: 0,
        lessonSaves: 0,
        lessonReuses: 0,
        reactions: 0,
        comments: 0,
        followers: 0,
      }),
    ).toEqual({
      score: 0,
      label: "New signal",
      summary: "Publish receipts and reusable moves to build signal",
    });
  });

  it("promotes builders with public proof", () => {
    const result = computeBuilderReputation({
      publicReceipts: 4,
      verifiedShips: 1,
      extractedLessons: 3,
      lessonSaves: 0,
      lessonReuses: 0,
      reactions: 1,
      comments: 0,
      followers: 0,
    });

    expect(result.label).toBe("Proof builder");
    expect(result.summary).toBe("3 reusable lessons extracted");
  });

  it("treats lesson reuse as a stronger learning signal than saves", () => {
    const result = computeBuilderReputation({
      publicReceipts: 2,
      verifiedShips: 0,
      extractedLessons: 5,
      lessonSaves: 4,
      lessonReuses: 6,
      reactions: 3,
      comments: 2,
      followers: 1,
      streakDays: 20,
    });

    expect(result.label).toBe("Lesson source");
    expect(result.score).toBeGreaterThan(90);
    expect(result.summary).toBe("6 lesson reuses from other builders");
  });

  it("labels high-social builders as network magnets", () => {
    const result = computeBuilderReputation({
      publicReceipts: 10,
      verifiedShips: 3,
      extractedLessons: 20,
      lessonSaves: 12,
      lessonReuses: 11,
      reactions: 15,
      comments: 9,
      followers: 20,
      streakDays: 8,
    });

    expect(result.label).toBe("Network magnet");
    expect(result.score).toBeGreaterThanOrEqual(160);
  });
});
