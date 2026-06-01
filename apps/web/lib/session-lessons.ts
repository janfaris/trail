import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db/client";
import { aiClient, textModel } from "./ai-client";
import { buildTranscript } from "./receipt-parse";
import {
  SESSION_LESSON_CONFIDENCE,
  SESSION_LESSON_SCHEMA_VERSION,
  type SessionLessonConfidence,
  type SessionLessonDraft,
} from "./session-lessons-types";

type EventRow = { idx: number; kind: string; data: unknown };

type SessionLessonInput = {
  id: string;
  slug: string;
  title: string | null;
  summary: string | null;
  tool: string;
  repo: string | null;
  linkedRepo: string | null;
  linkedCommitSha: string | null;
  taskType: string | null;
  outcome: string | null;
  toolsUsed: string[] | null;
  frameworks: string[] | null;
  models: string[] | null;
  receiptStatus: string | null;
  receiptOutcome: string | null;
  receiptTldr: string | null;
  receiptDecisionSummary: string[] | null;
  receiptChangedFiles: string[] | null;
  receiptVerification: typeof schema.trailSession.$inferSelect.receiptVerification;
};

export type SessionLessonGenerationResult =
  | {
      ok: true;
      sessionId: string;
      lessons: SessionLessonDraft[];
      model: string;
    }
  | {
      ok: false;
      sessionId: string;
      reason:
        | "no-ai-client"
        | "not-found"
        | "not-public"
        | "redacted"
        | "no-events"
        | "no-llm-content"
        | "llm-invalid-json"
        | "no-valid-lessons"
        | "exception";
      message?: string;
      model?: string;
    };

function scrubSensitiveText(value: string): string {
  return value
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/https?:\/\/[^\s)\]"']+/g, "[url]")
    .replace(/\/Users\/[^\s)\]"']+/g, "[path]")
    .replace(/\b(?:ghp|gho|github_pat|sk|xoxb|xoxp|AKIA)[A-Za-z0-9_\-]{12,}\b/g, "[token]")
    .replace(/\b[A-Za-z0-9_\-]{32,}\b/g, "[token]");
}

function normalizeText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const scrubbed = scrubSensitiveText(value).replace(/\s+/g, " ").trim();
  return scrubbed.length > max ? scrubbed.slice(0, max) : scrubbed;
}

function nullableText(value: unknown, max: number): string | null {
  const text = normalizeText(value, max);
  return text || null;
}

function normalizeSlugish(value: string): string {
  return scrubSensitiveText(value)
    .toLowerCase()
    .replace(/[^a-z0-9.+#-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeStringArray(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = normalizeText(item, maxLen);
    if (!text) continue;
    const normalized = normalizeSlugish(text);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeEventIdxs(value: unknown, validIdxs: Set<number>, maxItems: number): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const item of value) {
    const numeric = typeof item === "number" ? item : Number(item);
    if (!Number.isFinite(numeric)) continue;
    const idx = Math.trunc(numeric);
    if (!validIdxs.has(idx) || seen.has(idx)) continue;
    seen.add(idx);
    out.push(idx);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeScore(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 3;
  return Math.min(5, Math.max(1, Math.round(numeric)));
}

function normalizeConfidence(value: unknown): SessionLessonConfidence {
  const raw = typeof value === "string" ? value.toLowerCase().trim() : "";
  return SESSION_LESSON_CONFIDENCE.includes(raw as SessionLessonConfidence)
    ? (raw as SessionLessonConfidence)
    : "medium";
}

function parseLessonRecords(content: string): unknown[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) return parsed;
  if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { lessons?: unknown }).lessons)
  ) {
    return (parsed as { lessons: unknown[] }).lessons;
  }
  return null;
}

export function parseSessionLessons(
  content: string,
  validIdxs: Set<number>,
): SessionLessonDraft[] | null {
  const records = parseLessonRecords(content);
  if (!records) return null;

  const lessons: SessionLessonDraft[] = [];
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) continue;
    const raw = record as Record<string, unknown>;
    const sourceEventIdxs = normalizeEventIdxs(raw.sourceEventIdxs, validIdxs, 5);
    if (sourceEventIdxs.length === 0) continue;

    const title = normalizeText(raw.title, 96);
    const whatToSteal = normalizeText(raw.whatToSteal, 240);
    const useWhen = normalizeText(raw.useWhen, 180);
    const proof = normalizeText(raw.proof, 220);
    if (!title || !whatToSteal || !useWhen || !proof) continue;

    lessons.push({
      schemaVersion: SESSION_LESSON_SCHEMA_VERSION,
      title,
      whatToSteal,
      useWhen,
      promptPattern: nullableText(raw.promptPattern, 260),
      decision: nullableText(raw.decision, 220),
      failureMode: nullableText(raw.failureMode, 220),
      proof,
      stack: normalizeStringArray(raw.stack, 8, 48),
      tags: normalizeStringArray(raw.tags, 8, 48),
      sourceEventIdxs,
      transferabilityScore: normalizeScore(raw.transferabilityScore),
      confidence: normalizeConfidence(raw.confidence),
    });

    if (lessons.length >= 5) break;
  }

  return lessons;
}

function buildLessonsPrompt(input: SessionLessonInput, events: EventRow[]): string {
  const transcript = buildTranscript(events);
  const existingStack = Array.from(
    new Set(
      [
        input.tool,
        ...(input.toolsUsed ?? []),
        ...(input.frameworks ?? []),
        ...(input.models ?? []),
      ].filter(Boolean),
    ),
  );

  return [
    "You are Trail's learning extractor for AI-native builders. Output strict JSON only.",
    "Goal: turn an AI coding session into reusable lessons another developer can steal without reading raw logs.",
    "",
    "Return JSON with this exact shape:",
    "{",
    '  "lessons": [',
    "    {",
    '      "title": "short lesson headline",',
    '      "whatToSteal": "the reusable move, written as advice",',
    '      "useWhen": "specific situation where this applies",',
    '      "promptPattern": "copyable prompt or agent instruction pattern, or null",',
    '      "decision": "important implementation/tradeoff decision, or null",',
    '      "failureMode": "what can go wrong or what proof is missing, or null",',
    '      "proof": "concrete evidence from receipt fields or transcript",',
    '      "stack": ["existing stack/tool/model tags where possible"],',
    '      "tags": ["lowercase topic tags"],',
    '      "sourceEventIdxs": [0],',
    '      "transferabilityScore": 1-5,',
    '      "confidence": "high" | "medium" | "low"',
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    "- Return 1 to 5 lessons. Prefer fewer, sharper lessons over repetitive ones.",
    "- Each lesson must be transferable: a move, pattern, tradeoff, failure mode, or prompt that another builder can reuse.",
    "- Do not make the reader inspect proof first. Put the learning in whatToSteal/useWhen/promptPattern.",
    "- sourceEventIdxs must cite one or more idx values from the transcript.",
    "- Prefer stack tags from the existing stack list when relevant; normalize tags to lowercase.",
    "- Never include secrets, API keys, local filesystem paths, private URLs, usernames from paths, hidden chain-of-thought, or verbatim long file contents.",
    "- If the session lacks shipping proof, say that as failureMode/proof; do not overclaim.",
    "",
    `Title: ${input.title ?? input.slug}`,
    `Summary: ${input.summary ?? "(none)"}`,
    `Tool: ${input.tool}`,
    `Existing stack tags: ${JSON.stringify(existingStack)}`,
    `Repo label: ${input.repo ?? "(none)"}`,
    `Linked GitHub repo: ${input.linkedRepo ?? "(none)"}`,
    `Linked commit: ${input.linkedCommitSha ?? "(none)"}`,
    `Task type: ${input.taskType ?? "(none)"}`,
    `Outcome: ${input.outcome ?? "(none)"}`,
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

async function persistSessionLessons(
  sessionId: string,
  lessons: SessionLessonDraft[],
  model: string,
): Promise<void> {
  const generatedAt = new Date();
  for (const [lessonIndex, lesson] of lessons.entries()) {
    await db
      .insert(schema.sessionLesson)
      .values({
        id: randomUUID(),
        sessionId,
        lessonIndex,
        title: lesson.title,
        whatToSteal: lesson.whatToSteal,
        useWhen: lesson.useWhen,
        promptPattern: lesson.promptPattern,
        decision: lesson.decision,
        failureMode: lesson.failureMode,
        proof: lesson.proof,
        stack: lesson.stack,
        tags: lesson.tags,
        sourceEventIdxs: lesson.sourceEventIdxs,
        transferabilityScore: lesson.transferabilityScore,
        confidence: lesson.confidence,
        model,
        generatedAt,
        updatedAt: generatedAt,
      })
      .onConflictDoUpdate({
        target: [schema.sessionLesson.sessionId, schema.sessionLesson.lessonIndex],
        set: {
          title: sql`excluded.title`,
          whatToSteal: sql`excluded.what_to_steal`,
          useWhen: sql`excluded.use_when`,
          promptPattern: sql`excluded.prompt_pattern`,
          decision: sql`excluded.decision`,
          failureMode: sql`excluded.failure_mode`,
          proof: sql`excluded.proof`,
          stack: sql`excluded.stack`,
          tags: sql`excluded.tags`,
          sourceEventIdxs: sql`excluded.source_event_idxs`,
          transferabilityScore: sql`excluded.transferability_score`,
          confidence: sql`excluded.confidence`,
          model: sql`excluded.model`,
          generatedAt: sql`excluded.generated_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  await db
    .delete(schema.sessionLesson)
    .where(
      sql`${schema.sessionLesson.sessionId} = ${sessionId} AND ${schema.sessionLesson.lessonIndex} >= ${lessons.length}`,
    );
}

export async function generateSessionLessons(
  sessionId: string,
): Promise<SessionLessonGenerationResult> {
  try {
    const client = aiClient();
    if (!client) return { ok: false, sessionId, reason: "no-ai-client" };

    const row = await db.query.trailSession.findFirst({
      where: eq(schema.trailSession.id, sessionId),
    });
    if (!row) return { ok: false, sessionId, reason: "not-found" };
    if (row.redactedAt || row.visibility === "redacted") {
      return { ok: false, sessionId, reason: "redacted" };
    }
    if (row.visibility !== "public" || !row.sharedAt) {
      return { ok: false, sessionId, reason: "not-public" };
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

    if (events.length === 0) return { ok: false, sessionId, reason: "no-events" };

    const model = textModel();
    const validIdxs = new Set(events.map((event) => event.idx));
    const completion = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract reusable, privacy-safe learning objects from AI coding sessions. Output valid JSON only.",
        },
        { role: "user", content: buildLessonsPrompt(row, events) },
      ],
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) return { ok: false, sessionId, reason: "no-llm-content", model };

    const lessons = parseSessionLessons(content, validIdxs);
    if (!lessons) return { ok: false, sessionId, reason: "llm-invalid-json", model };
    if (lessons.length === 0) return { ok: false, sessionId, reason: "no-valid-lessons", model };

    await persistSessionLessons(sessionId, lessons, model);
    return { ok: true, sessionId, lessons, model };
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
      sessionId,
      reason: "exception",
      message: err instanceof Error ? err.message : String(err),
      model,
    };
  }
}
