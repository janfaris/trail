import { describe, expect, it } from "vitest";
import { validateBuildPostQuality } from "./build-post-quality";

describe("validateBuildPostQuality", () => {
  it("blocks empty and generic build posts", () => {
    const empty = validateBuildPostQuality({
      summary: "testing",
      proofUrlCount: 0,
      proofNote: "",
      question: "",
    });

    expect(empty.ok).toBe(false);
    expect(empty.issues.map((issue) => issue.code)).toContain("summary_too_short");
    expect(empty.issues.map((issue) => issue.code)).toContain("proof_required");
  });

  it("accepts a clear build with a proof URL and context", () => {
    const result = validateBuildPostQuality({
      summary:
        "Shipped a cleaner create composer so builders can post proof-backed work without filling a long form.",
      proofUrlCount: 1,
      question: "",
    });

    expect(result.ok).toBe(true);
    expect(result.checks).toEqual({ outcome: true, proof: true, context: true });
  });

  it("accepts a clear one-line outcome when a proof URL is attached", () => {
    const result = validateBuildPostQuality({
      summary: "Personal portfolio website - Software Engineer @ Microsoft",
      proofUrlCount: 1,
      proofNote: "",
      question: "",
    });

    expect(result.ok).toBe(true);
    expect(result.checks).toEqual({ outcome: true, proof: true, context: true });
  });

  it("still requires real context when there is no proof", () => {
    const result = validateBuildPostQuality({
      summary: "Personal portfolio website - Software Engineer @ Microsoft",
      proofUrlCount: 0,
      proofNote: "",
      question: "",
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("proof_required");
  });

  it("allows a proof note when no public URL exists", () => {
    const result = validateBuildPostQuality({
      summary:
        "Built an internal onboarding flow for our support team, so new agents can resolve account issues faster.",
      proofUrlCount: 0,
      proofNote: "Private repo, demoed to the support lead after deploy.",
      question: "",
    });

    expect(result.ok).toBe(true);
    expect(result.checks.proof).toBe(true);
  });

  it("keeps legitimate testing work from being blocked as generic", () => {
    const result = validateBuildPostQuality({
      summary:
        "Added integration testing around checkout webhooks so failed Stripe retries are easier to catch before deploy.",
      proofUrlCount: 1,
      question: "",
    });

    expect(result.ok).toBe(true);
  });
});
