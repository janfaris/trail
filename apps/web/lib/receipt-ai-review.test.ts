import { describe, expect, it } from "vitest";
import { parseReceiptAiReview } from "./receipt-ai-review";

const baseInput = {
  title: "Checkout work",
  summary: "Stripe checkout",
  tool: "codex",
  repo: "trail",
  linkedRepo: "owner/repo",
  linkedCommitSha: "deadbee",
  receiptStatus: "unverified",
  receiptOutcome: "Added checkout and webhook handling.",
  receiptTldr: "Checkout work completed.",
  receiptDecisionSummary: ["Picked Stripe", "Added webhook idempotency"],
  receiptChangedFiles: ["app/api/checkout/route.ts"],
  receiptVerification: { shipped: false, sha: "deadbee", repo: "owner/repo", checkedAt: "now" },
};

describe("parseReceiptAiReview", () => {
  it("clamps shipped verdicts when receipt status is not verified shipped", () => {
    const parsed = parseReceiptAiReview(
      JSON.stringify({
        verdict: "shipped",
        confidence: "high",
        headline: "Shipped checkout",
        summary: "The work shipped.",
        evidence: [{ label: "Commit", detail: "Claims shipped.", eventIdx: 1 }],
        nextSteps: ["Reuse the webhook setup."],
        questions: ["What broke before this shipped?"],
      }),
      new Set([1]),
      baseInput,
    );

    expect(parsed?.verdict).toBe("needs-proof");
  });

  it("drops invalid evidence anchors and falls back on safe enum values", () => {
    const parsed = parseReceiptAiReview(
      JSON.stringify({
        verdict: "???",
        confidence: "certain",
        headline: "Useful checkout work",
        summary: "There is enough receipt structure to understand the work.",
        evidence: [{ label: "Tool output", detail: "A tool ran.", eventIdx: 99 }],
        nextSteps: ["Inspect the changed files."],
        questions: ["Where would you fork this next?"],
      }),
      new Set([2]),
      { ...baseInput, receiptStatus: "draft" },
    );

    expect(parsed?.verdict).toBe("partial");
    expect(parsed?.confidence).toBe("medium");
    expect(parsed?.evidence[0]?.eventIdx).toBeNull();
  });
});
