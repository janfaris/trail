import { asc, eq } from "drizzle-orm";
import { db, schema } from "../db/client";
import { aiClient, textModel } from "./ai-client";
import {
  RECEIPT_AI_REVIEW_CONFIDENCE,
  RECEIPT_AI_REVIEW_SCHEMA_VERSION,
  RECEIPT_AI_REVIEW_VERDICTS,
  type ReceiptAiReview,
  type ReceiptAiReviewConfidence,
  type ReceiptAiReviewEvidence,
  type ReceiptAiReviewVerdict,
} from "./receipt-ai-review-types";
import { buildTranscript } from "./receipt-parse";

type EventRow = { idx: number; kind: string; data: unknown };

type ReceiptAiReviewInput = {
  title: string;
  summary: string | null;
  tool: string;
  repo: string | null;
  linkedRepo: string | null;
  linkedCommitSha: string | null;
  receiptStatus: string | null;
  receiptOutcome: string | null;
  receiptTldr: string | null;
  receiptDecisionSummary: string[] | null;
  receiptChangedFiles: string[] | null;
  receiptVerification: typeof schema.trailSession.$inferSelect.receiptVerification;
  events: EventRow[];
};

export type ReceiptAiReviewGenerationResult =
  | {
      ok: true;
      review: ReceiptAiReview;
      model: string;
    }
  | {
      ok: false;
      reason: "no-ai-client" | "no-events" | "no-llm-content" | "llm-invalid-json" | "exception";
      message?: string;
      model?: string;
    };

function pickString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function pickStringArray(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];

  for (const item of value) {
    const text = pickString(item, maxLen);
    if (!text) continue;
    out.push(text);
    if (out.length >= maxItems) break;
  }

  return out;
}

function pickVerdict(value: unknown, receiptStatus: string | null): ReceiptAiReviewVerdict {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  const fallback =
    receiptStatus === "shipped" ? "shipped" : receiptStatus === "draft" ? "partial" : "needs-proof";
  const verdict = RECEIPT_AI_REVIEW_VERDICTS.includes(raw as ReceiptAiReviewVerdict)
    ? (raw as ReceiptAiReviewVerdict)
    : fallback;

  if (verdict === "shipped" && receiptStatus !== "shipped") {
    return receiptStatus === "draft" ? "partial" : "needs-proof";
  }

  return verdict;
}

function pickConfidence(value: unknown): ReceiptAiReviewConfidence {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return RECEIPT_AI_REVIEW_CONFIDENCE.includes(raw as ReceiptAiReviewConfidence)
    ? (raw as ReceiptAiReviewConfidence)
    : "medium";
}

function pickEventIdx(value: unknown, validIdxs: Set<number>): number | null {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  const idx = Math.trunc(numeric);
  return validIdxs.has(idx) ? idx : null;
}

function pickEvidence(
  value: unknown,
  validIdxs: Set<number>,
  fallback: string[],
): ReceiptAiReviewEvidence[] {
  const out: ReceiptAiReviewEvidence[] = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      const label = pickString(record.label, 72);
      const detail = pickString(record.detail, 220);
      if (!label || !detail) continue;
      out.push({
        label,
        detail,
        eventIdx: pickEventIdx(record.eventIdx, validIdxs),
      });
      if (out.length >= 5) break;
    }
  }

  if (out.length > 0) return out;

  return fallback.slice(0, 3).map((detail, index) => ({
    label: index === 0 ? "Receipt summary" : `Evidence ${index + 1}`,
    detail,
    eventIdx: null,
  }));
}

export function parseReceiptAiReview(
  content: string,
  validIdxs: Set<number>,
  input: Omit<ReceiptAiReviewInput, "events">,
): ReceiptAiReview | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const record = parsed as Record<string, unknown>;
  const fallbackEvidence = [
    input.receiptOutcome,
    ...(input.receiptDecisionSummary ?? []),
    ...(input.receiptChangedFiles ?? []).map((file) => `Changed ${file}`),
  ].filter((item): item is string => Boolean(item));

  const headline =
    pickString(record.headline, 96) ||
    (input.receiptStatus === "shipped" ? "Verified shipped work" : "Useful work that needs proof");
  const summary =
    pickString(record.summary, 420) ||
    input.receiptTldr ||
    input.receiptOutcome ||
    "Trail found enough structure to summarize this receipt, but the AI check needs more evidence.";

  return {
    schemaVersion: RECEIPT_AI_REVIEW_SCHEMA_VERSION,
    verdict: pickVerdict(record.verdict, input.receiptStatus),
    confidence: pickConfidence(record.confidence),
    headline,
    summary,
    evidence: pickEvidence(record.evidence, validIdxs, fallbackEvidence),
    nextSteps: pickStringArray(record.nextSteps, 3, 180),
    questions: pickStringArray(record.questions, 3, 140),
  };
}

function buildReviewPrompt(input: ReceiptAiReviewInput): string {
  const transcript = buildTranscript(input.events);

  return [
    "You are Trail's receipt checker for AI builders. Produce strict JSON only.",
    "Goal: make this receipt self-reviewing so a reader understands whether to trust it, reuse it, or ask a follow-up without reading the raw log first.",
    "",
    "Return JSON with this exact shape:",
    "{",
    '  "verdict": "shipped" | "partial" | "failed" | "needs-proof",',
    '  "confidence": "high" | "medium" | "low",',
    '  "headline": "short reader-facing headline",',
    '  "summary": "2-3 sentences explaining what Trail checked and what matters",',
    '  "evidence": [{"label":"short label","detail":"specific evidence","eventIdx": 12 | null}],',
    '  "nextSteps": ["specific thing a reader can do next"],',
    '  "questions": ["useful comment starter for the builder"]',
    "}",
    "",
    "Rules:",
    "- Never call the verdict shipped unless receiptStatus is shipped.",
    "- Use partial or needs-proof when commit or public-branch proof is missing.",
    "- Evidence must cite concrete receipt fields or transcript moments; eventIdx must be one of the idx values shown.",
    "- Do not mention secrets, private data, hidden chain-of-thought, or generic marketing claims.",
    "- Keep the output concise and useful for a social receipt page.",
    "",
    `Title: ${input.title}`,
    `Summary: ${input.summary ?? "(none)"}`,
    `Tool: ${input.tool}`,
    `Repo: ${input.repo ?? "(none)"}`,
    `Linked GitHub repo: ${input.linkedRepo ?? "(none)"}`,
    `Linked commit: ${input.linkedCommitSha ?? "(none)"}`,
    `receiptStatus: ${input.receiptStatus ?? "(none)"}`,
    `receiptOutcome: ${input.receiptOutcome ?? "(none)"}`,
    `receiptTldr: ${input.receiptTldr ?? "(none)"}`,
    `receiptDecisionSummary: ${JSON.stringify(input.receiptDecisionSummary ?? [])}`,
    `receiptChangedFiles: ${JSON.stringify(input.receiptChangedFiles ?? [])}`,
    `receiptVerification: ${JSON.stringify(input.receiptVerification ?? null)}`,
    "",
    "Transcript:",
    transcript,
  ].join("\n");
}

export async function createReceiptAiReview(
  input: ReceiptAiReviewInput,
): Promise<ReceiptAiReviewGenerationResult> {
  try {
    const client = aiClient();
    if (!client) return { ok: false, reason: "no-ai-client" };
    if (input.events.length === 0) return { ok: false, reason: "no-events" };

    const model = textModel();
    const validIdxs = new Set(input.events.map((event) => event.idx));
    const completion = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You turn AI coding session receipts into trustworthy, concise reader guidance. Output valid JSON only.",
        },
        { role: "user", content: buildReviewPrompt(input) },
      ],
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) return { ok: false, reason: "no-llm-content", model };

    const review = parseReceiptAiReview(content, validIdxs, input);
    if (!review) return { ok: false, reason: "llm-invalid-json", model };

    return { ok: true, review, model };
  } catch (err) {
    const model = (() => {
      try {
        return textModel();
      } catch {
        return undefined;
      }
    })();
    return {
      ok: false,
      reason: "exception",
      message: err instanceof Error ? err.message : String(err),
      model,
    };
  }
}

export async function generateReceiptAiReview(
  sessionId: string,
): Promise<ReceiptAiReviewGenerationResult> {
  const row = await db.query.trailSession.findFirst({
    where: eq(schema.trailSession.id, sessionId),
  });
  if (!row) return { ok: false, reason: "exception", message: "session not found" };
  if (row.redactedAt || row.visibility === "redacted") {
    return { ok: false, reason: "exception", message: "redacted session" };
  }

  const events = await db
    .select({
      idx: schema.event.idx,
      kind: schema.event.kind,
      data: schema.event.data,
    })
    .from(schema.event)
    .where(eq(schema.event.sessionId, sessionId))
    .orderBy(asc(schema.event.idx));

  const result = await createReceiptAiReview({
    title: row.title || row.slug,
    summary: row.summary,
    tool: row.tool,
    repo: row.repo,
    linkedRepo: row.linkedRepo,
    linkedCommitSha: row.linkedCommitSha,
    receiptStatus: row.receiptStatus,
    receiptOutcome: row.receiptOutcome,
    receiptTldr: row.receiptTldr,
    receiptDecisionSummary: row.receiptDecisionSummary,
    receiptChangedFiles: row.receiptChangedFiles,
    receiptVerification: row.receiptVerification,
    events,
  });

  await db
    .update(schema.trailSession)
    .set(
      result.ok
        ? {
            receiptAiReview: result.review,
            receiptAiReviewGeneratedAt: new Date(),
            receiptAiReviewModel: result.model,
            receiptAiReviewError: null,
          }
        : {
            receiptAiReview: null,
            receiptAiReviewGeneratedAt: null,
            receiptAiReviewModel: result.model ?? null,
            receiptAiReviewError: result.message ?? result.reason,
          },
    )
    .where(eq(schema.trailSession.id, sessionId));

  return result;
}
