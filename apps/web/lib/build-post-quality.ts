export type BuildPostQualityInput = {
  summary: string | null | undefined;
  proofUrlCount: number;
  proofNote?: string | null | undefined;
  question?: string | null | undefined;
};

export type BuildPostQualityIssueCode =
  | "summary_required"
  | "summary_too_short"
  | "summary_low_signal"
  | "proof_required"
  | "context_required";

export type BuildPostQualityIssue = {
  code: BuildPostQualityIssueCode;
  message: string;
};

export type BuildPostQualityResult = {
  ok: boolean;
  issues: BuildPostQualityIssue[];
  checks: {
    outcome: boolean;
    proof: boolean;
    context: boolean;
  };
};

const MIN_SUMMARY_CHARS = 40;
const MIN_SUMMARY_WORDS = 6;
const MIN_PROOF_NOTE_CHARS = 24;
const MIN_QUESTION_CHARS = 12;

const LOW_SIGNAL_SUMMARIES = new Set([
  "a",
  "asdf",
  "demo",
  "hello",
  "hi",
  "placeholder",
  "test",
  "test post",
  "testing",
  "built stuff",
  "stuff",
  "todo",
]);

export function normalizeBuildPostText(
  value: string | null | undefined,
  maxLength: number,
): string {
  const cleaned = (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return cleaned.slice(0, maxLength);
}

function compactForLowSignal(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulWordCount(value: string): number {
  return value.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu)?.length ?? 0;
}

function hasEnoughOutcomeDetail(summary: string): boolean {
  const compactLength = summary.replace(/\s/g, "").length;
  return (
    summary.length >= MIN_SUMMARY_CHARS &&
    (meaningfulWordCount(summary) >= MIN_SUMMARY_WORDS || compactLength >= 64)
  );
}

function hasContextSignal(summary: string, question: string): boolean {
  if (question.length >= MIN_QUESTION_CHARS) return true;
  if (summary.length >= 140) return true;
  const lineCount = summary.split("\n").filter(Boolean).length;
  const sentenceMarks = summary.match(/[.!?。！？]/g)?.length ?? 0;
  if (lineCount >= 2 || sentenceMarks >= 2) return true;
  return /\b(so|because|learned|matters|feedback|helps?|users?|builders?|now|before|after|fixed|improves?|enables?|allows?)\b/i.test(
    summary,
  );
}

export function validateBuildPostQuality(input: BuildPostQualityInput): BuildPostQualityResult {
  const summary = normalizeBuildPostText(input.summary, 1200);
  const proofNote = normalizeBuildPostText(input.proofNote, 500);
  const question = normalizeBuildPostText(input.question, 260);
  const issues: BuildPostQualityIssue[] = [];
  const compactSummary = compactForLowSignal(summary);
  const outcome = hasEnoughOutcomeDetail(summary) && !LOW_SIGNAL_SUMMARIES.has(compactSummary);
  const proof = input.proofUrlCount > 0 || proofNote.length >= MIN_PROOF_NOTE_CHARS;
  // A real, verifiable proof link makes a clear one-line outcome a legitimate
  // post — proof compensates for a terse summary. Without proof we still require
  // an explicit context signal (why it matters / lesson / question).
  const context = hasContextSignal(summary, question) || (input.proofUrlCount > 0 && outcome);

  if (!summary) {
    issues.push({
      code: "summary_required",
      message: "Write what shipped before publishing.",
    });
  } else if (!hasEnoughOutcomeDetail(summary)) {
    issues.push({
      code: "summary_too_short",
      message: "Add a little more detail: what changed, who it helps, or what shipped.",
    });
  } else if (LOW_SIGNAL_SUMMARIES.has(compactSummary)) {
    issues.push({
      code: "summary_low_signal",
      message: "That post is too generic. Name the actual build or change.",
    });
  }

  if (!proof) {
    issues.push({
      code: "proof_required",
      message:
        "Add a GitHub, X, or demo URL — or write a short public proof note if the work link is private.",
    });
  }

  if (!context) {
    issues.push({
      code: "context_required",
      message: "Add why it matters, what you learned, or a question for builders.",
    });
  }

  return {
    ok: issues.length === 0,
    issues,
    checks: { outcome, proof, context },
  };
}
