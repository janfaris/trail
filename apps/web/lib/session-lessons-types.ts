export const SESSION_LESSON_SCHEMA_VERSION = 1;

export const SESSION_LESSON_CONFIDENCE = ["high", "medium", "low"] as const;

export type SessionLessonConfidence = (typeof SESSION_LESSON_CONFIDENCE)[number];

export type SessionLessonDraft = {
  schemaVersion: typeof SESSION_LESSON_SCHEMA_VERSION;
  title: string;
  whatToSteal: string;
  useWhen: string;
  promptPattern: string | null;
  decision: string | null;
  failureMode: string | null;
  proof: string;
  stack: string[];
  tags: string[];
  sourceEventIdxs: number[];
  transferabilityScore: number;
  confidence: SessionLessonConfidence;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number");
}

export function isSessionLessonDraft(value: unknown): value is SessionLessonDraft {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== SESSION_LESSON_SCHEMA_VERSION) return false;
  if (!SESSION_LESSON_CONFIDENCE.includes(value.confidence as SessionLessonConfidence)) {
    return false;
  }

  return (
    typeof value.title === "string" &&
    typeof value.whatToSteal === "string" &&
    typeof value.useWhen === "string" &&
    (typeof value.promptPattern === "string" || value.promptPattern === null) &&
    (typeof value.decision === "string" || value.decision === null) &&
    (typeof value.failureMode === "string" || value.failureMode === null) &&
    typeof value.proof === "string" &&
    isStringArray(value.stack) &&
    isStringArray(value.tags) &&
    isNumberArray(value.sourceEventIdxs) &&
    typeof value.transferabilityScore === "number" &&
    value.transferabilityScore >= 1 &&
    value.transferabilityScore <= 5
  );
}
