export const RECEIPT_AI_REVIEW_SCHEMA_VERSION = 1;

export const RECEIPT_AI_REVIEW_VERDICTS = ["shipped", "partial", "failed", "needs-proof"] as const;

export const RECEIPT_AI_REVIEW_CONFIDENCE = ["high", "medium", "low"] as const;

export type ReceiptAiReviewVerdict = (typeof RECEIPT_AI_REVIEW_VERDICTS)[number];

export type ReceiptAiReviewConfidence = (typeof RECEIPT_AI_REVIEW_CONFIDENCE)[number];

export type ReceiptAiReviewEvidence = {
  label: string;
  detail: string;
  eventIdx: number | null;
};

export type ReceiptAiReview = {
  schemaVersion: typeof RECEIPT_AI_REVIEW_SCHEMA_VERSION;
  verdict: ReceiptAiReviewVerdict;
  confidence: ReceiptAiReviewConfidence;
  headline: string;
  summary: string;
  evidence: ReceiptAiReviewEvidence[];
  nextSteps: string[];
  questions: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEvidence(value: unknown): value is ReceiptAiReviewEvidence {
  if (!isRecord(value)) return false;
  return (
    typeof value.label === "string" &&
    typeof value.detail === "string" &&
    (typeof value.eventIdx === "number" || value.eventIdx === null)
  );
}

export function isReceiptAiReview(value: unknown): value is ReceiptAiReview {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== RECEIPT_AI_REVIEW_SCHEMA_VERSION) return false;
  if (!RECEIPT_AI_REVIEW_VERDICTS.includes(value.verdict as ReceiptAiReviewVerdict)) return false;
  if (!RECEIPT_AI_REVIEW_CONFIDENCE.includes(value.confidence as ReceiptAiReviewConfidence)) {
    return false;
  }
  if (
    typeof value.headline !== "string" ||
    typeof value.summary !== "string" ||
    !Array.isArray(value.evidence) ||
    !Array.isArray(value.nextSteps) ||
    !Array.isArray(value.questions)
  ) {
    return false;
  }

  return (
    value.evidence.every(isEvidence) &&
    value.nextSteps.every((item) => typeof item === "string") &&
    value.questions.every((item) => typeof item === "string")
  );
}
