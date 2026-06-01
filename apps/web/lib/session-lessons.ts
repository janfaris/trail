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

type EventData = Record<string, unknown>;
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
    .replace(
      /\b(?=[A-Za-z0-9_\-]*[A-Z])(?=[A-Za-z0-9_\-]*[a-z])(?=[A-Za-z0-9_\-]*\d)[A-Za-z0-9_\-]{48,}\b/g,
      "[token]",
    );
}

function clipText(value: string, max: number): string {
  if (value.length <= max) return value;
  const clipped = value.slice(0, max);
  const boundary = Math.max(
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("! "),
    clipped.lastIndexOf("? "),
    clipped.lastIndexOf("; "),
  );
  if (boundary >= Math.floor(max * 0.62)) return clipped.slice(0, boundary + 1).trim();
  const wordBoundary = clipped.lastIndexOf(" ");
  if (wordBoundary >= Math.floor(max * 0.75)) return `${clipped.slice(0, wordBoundary).trim()}...`;
  return `${clipped.trim()}...`;
}

function normalizeText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const scrubbed = scrubSensitiveText(value).replace(/\s+/g, " ").trim();
  return clipText(scrubbed, max);
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

function isTooGenericLesson(title: string, whatToSteal: string, useWhen: string): boolean {
  const copy = `${title} ${whatToSteal} ${useWhen}`.toLowerCase();
  const genericPhrases = [
    "best practices",
    "leverage the power",
    "ensure that you",
    "consider using",
    "make sure to",
    "it is important",
  ];
  const hasGenericPhrase = genericPhrases.some((phrase) => copy.includes(phrase));
  const hasConcreteSignal =
    /`[^`]+`/.test(copy) ||
    /\b(pnpm|npm|gh|git|drizzle|next\.?js|postgres|biome|vercel|route|schema|index|test|build|lint|query|api)\b/.test(
      copy,
    ) ||
    /\b[A-Za-z0-9_-]+\.(ts|tsx|js|jsx|sql|json|md)\b/.test(copy);
  return hasGenericPhrase && !hasConcreteSignal;
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
    const proof = normalizeText(raw.proof, 340);
    if (!title || !whatToSteal || !useWhen || !proof) continue;
    if (isTooGenericLesson(title, whatToSteal, useWhen)) continue;

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

function eventData(event: EventRow): EventData {
  return event.data && typeof event.data === "object" && !Array.isArray(event.data)
    ? (event.data as EventData)
    : {};
}

function compactJson(value: unknown, max = 220): string {
  if (value == null) return "";
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return normalizeText(raw, max);
}

function looksLikeVerification(text: string): boolean {
  return /\b(pnpm|npm|yarn|bun)\s+(test|build|lint|typecheck)|\b(vitest|playwright|pytest|rspec|go test|cargo test|tsc|biome check|next build|curl)\b/i.test(
    text,
  );
}

function looksFailed(text: string): boolean {
  return /\b(error|failed|failure|exception|traceback|not ok|exit code [1-9])\b/i.test(text);
}

function buildEvidenceDigest(input: SessionLessonInput, events: EventRow[]): string {
  const counts = new Map<string, number>();
  const toolCalls: Array<{
    idx: number;
    name: string;
    args: string;
    result: string;
    failed: boolean;
  }> = [];
  const diffs: Array<{ idx: number; path: string }> = [];
  const decisions: Array<{ idx: number; note: string }> = [];
  const verification: string[] = [];

  for (const event of events) {
    counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
    const data = eventData(event);
    if (event.kind === "tool_call") {
      const name = typeof data.name === "string" ? data.name : "tool";
      const args = compactJson(data.args, 180);
      const result = compactJson(data.result, 220);
      const combined = `${name} ${args} ${result}`;
      const failed = looksFailed(combined);
      toolCalls.push({ idx: event.idx, name, args, result, failed });
      if (looksLikeVerification(combined)) {
        verification.push(
          `event ${event.idx}: ${name}${failed ? " (failed)" : " (ran)"} ${args || result}`,
        );
      }
    } else if (event.kind === "file_diff") {
      const path = typeof data.path === "string" ? normalizeText(data.path, 120) : "changed file";
      diffs.push({ idx: event.idx, path });
    } else if (event.kind === "decision") {
      const note = typeof data.note === "string" ? normalizeText(data.note, 180) : "";
      if (note) decisions.push({ idx: event.idx, note });
    }
  }

  const countText = Array.from(counts.entries())
    .map(([kind, count]) => `${kind}:${count}`)
    .join(", ");
  const resultfulTools = toolCalls.filter((tool) => tool.result).length;
  const failedTools = toolCalls.filter((tool) => tool.failed).length;
  const namedTools = Array.from(new Set(toolCalls.map((tool) => tool.name))).slice(0, 12);
  const changedFiles = Array.from(
    new Set(
      [...(input.receiptChangedFiles ?? []), ...diffs.map((diff) => diff.path)].filter(Boolean),
    ),
  ).slice(0, 10);

  return [
    `eventCounts: ${countText || "none"}`,
    `toolResultCoverage: ${resultfulTools}/${toolCalls.length} tool calls include result output`,
    `failedToolSignals: ${failedTools}`,
    `namedTools: ${JSON.stringify(namedTools)}`,
    `changedFiles: ${JSON.stringify(changedFiles)}`,
    `decisions: ${JSON.stringify(decisions.slice(0, 5))}`,
    `verificationSignals: ${JSON.stringify(verification.slice(0, 6))}`,
    `receiptVerification: ${JSON.stringify(input.receiptVerification ?? null)}`,
  ].join("\n");
}

function buildLessonsPrompt(input: SessionLessonInput, events: EventRow[]): string {
  const transcript = buildTranscript(events);
  const evidenceDigest = buildEvidenceDigest(input, events);
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
    "Voice: concrete, tactical, and proof-aware. Do not write generic productivity advice.",
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
    "- Each lesson must be transferable: a move, pattern, tradeoff, failure mode, or prompt that another builder can reuse in their own agent session.",
    "- Start from the Evidence digest. Prefer lessons backed by tool results, changed files, verification commands, decisions, or explicit failures.",
    "- whatToSteal must name a concrete action, command, check, schema choice, UI pattern, or agent instruction. Avoid vague phrases like 'follow best practices', 'ensure quality', or 'leverage tools'.",
    "- promptPattern should be copyable. Use placeholders like <your-file>, <your-command>, or <your-constraint> instead of private names or paths.",
    "- Do not make the reader inspect proof first. Put the learning in whatToSteal/useWhen/promptPattern.",
    "- sourceEventIdxs must cite one or more idx values from the transcript.",
    "- Prefer stack tags from the existing stack list when relevant; normalize tags to lowercase.",
    "- Never include secrets, API keys, local filesystem paths, private URLs, usernames from paths, hidden chain-of-thought, or verbatim long file contents.",
    "- If the session lacks shipping proof, say that as failureMode/proof; do not overclaim.",
    "- Good title: 'Gate public publishing behind receipt proof'. Bad title: 'Use best practices for publishing'.",
    "- Good whatToSteal: 'Before making a receipt public, make the agent verify generatedAt, safety state, quota, and sharedAt in one locked helper.'",
    "- Bad whatToSteal: 'Ensure public receipts are reliable and high quality.'",
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
    "Evidence digest:",
    evidenceDigest,
    "",
    "Transcript:",
    transcript,
  ].join("\n");
}

const DEMO_LESSONS: Record<string, SessionLessonDraft[]> = {
  "nextjs-rsc-streaming": [
    {
      schemaVersion: SESSION_LESSON_SCHEMA_VERSION,
      title: "Stream the slow dashboard first",
      whatToSteal:
        "Move slow dashboard regions behind streamed server component boundaries so the shell renders while expensive data keeps loading.",
      useWhen:
        "Use this when a Next.js app has a useful layout but one widget or query makes the entire page wait.",
      promptPattern:
        "Refactor <dashboard-page> so the stable shell renders first, wrap slow server data in Suspense, and keep loading states meaningful.",
      decision:
        "Optimize perceived speed by streaming independent regions instead of turning the whole page into a client component.",
      failureMode:
        "Do not claim a performance win until TTFB, loading states, and slow-path behavior are measured.",
      proof:
        "Demo receipt summary reports a Next.js 16 dashboard refactor that cut TTFB by streaming server components.",
      stack: ["nextjs", "react"],
      tags: ["rsc", "streaming", "performance"],
      sourceEventIdxs: [],
      transferabilityScore: 4,
      confidence: "medium",
    },
    {
      schemaVersion: SESSION_LESSON_SCHEMA_VERSION,
      title: "Keep loading UI as proof",
      whatToSteal:
        "Ask the agent to pair every streamed section with a named fallback so reviewers can see which data is intentionally deferred.",
      useWhen: "Use this when RSC streaming could otherwise look like random layout popping.",
      promptPattern:
        "For each Suspense boundary, name the deferred data, add a fallback that preserves layout, and explain why it is safe to stream.",
      decision: null,
      failureMode:
        "Streaming without stable fallbacks can make the app feel broken instead of fast.",
      proof:
        "The demo focuses on streaming RSC payloads rather than a visual redesign, so fallbacks are the transferable review point.",
      stack: ["nextjs", "react"],
      tags: ["rsc", "loading-states", "review"],
      sourceEventIdxs: [],
      transferabilityScore: 4,
      confidence: "medium",
    },
  ],
  "drizzle-neon-hnsw": [
    {
      schemaVersion: SESSION_LESSON_SCHEMA_VERSION,
      title: "Treat vector search as schema work",
      whatToSteal:
        "Have the agent add embeddings, distance query shape, and the HNSW index together so search quality and database performance stay coupled.",
      useWhen:
        "Use this when adding semantic search to Postgres or Neon with Drizzle instead of bolting on a separate vector store.",
      promptPattern:
        "Add pgvector search for <entity>: define the embedding column, create the HNSW index, write the ranked query, and include a fallback for empty embeddings.",
      decision:
        "Keep semantic search inside Postgres so receipts, sessions, and embeddings share one consistency boundary.",
      failureMode:
        "A vector column without an index or a ranked query is not a usable search feature.",
      proof:
        "Demo receipt summary describes wiring text-embedding-3-small with an HNSW index for semantic session search.",
      stack: ["drizzle", "postgres", "neon", "pgvector"],
      tags: ["semantic-search", "hnsw", "database"],
      sourceEventIdxs: [],
      transferabilityScore: 5,
      confidence: "medium",
    },
    {
      schemaVersion: SESSION_LESSON_SCHEMA_VERSION,
      title: "Backfill embeddings separately from reads",
      whatToSteal:
        "Ship the search read path so missing vectors degrade gracefully, then backfill embeddings in batches instead of blocking the feature.",
      useWhen: "Use this when old rows lack embeddings but new sessions need search immediately.",
      promptPattern:
        "Make <semantic-search> tolerate null embeddings, add a batch backfill path, and only rank rows with vectors until the backfill completes.",
      decision: null,
      failureMode:
        "Blocking page reads on embedding generation makes search fragile and expensive.",
      proof:
        "The demo combines Drizzle, Neon, and embedding generation, which requires separating online reads from backfill work.",
      stack: ["drizzle", "postgres", "neon"],
      tags: ["backfill", "semantic-search", "reliability"],
      sourceEventIdxs: [],
      transferabilityScore: 4,
      confidence: "medium",
    },
  ],
  "biome-monorepo-lint": [
    {
      schemaVersion: SESSION_LESSON_SCHEMA_VERSION,
      title: "Lint the changed package first",
      whatToSteal:
        "Ask the agent to wire Biome through Turbo filters so CI checks the touched workspace quickly before falling back to a full monorepo check.",
      useWhen:
        "Use this when a monorepo lint command is slow enough that developers stop running it locally.",
      promptPattern:
        "Create an incremental lint path for <monorepo>: detect changed packages, run Biome on those first, and keep the full check available for release.",
      decision: "Optimize the inner loop without deleting the slower full-repo guardrail.",
      failureMode:
        "Only linting changed files can miss shared config and generated file problems unless release CI still runs the full check.",
      proof: "Demo receipt summary describes incremental Biome checks for a Turbo monorepo.",
      stack: ["biome", "turborepo"],
      tags: ["lint", "ci", "monorepo"],
      sourceEventIdxs: [],
      transferabilityScore: 4,
      confidence: "medium",
    },
    {
      schemaVersion: SESSION_LESSON_SCHEMA_VERSION,
      title: "Make formatting failures actionable",
      whatToSteal:
        "Have the agent separate check and write modes so CI reports exactly what failed while local commands can auto-fix formatting.",
      useWhen:
        "Use this when Biome failures are correct but developers do not know whether to run check, format, or a package filter.",
      promptPattern:
        "Split <lint-command> into CI check and local fix commands, document both in package scripts, and keep output short enough for agents to inspect.",
      decision: null,
      failureMode:
        "A single noisy lint command makes agent-driven fixes slower because the model cannot identify the failing workspace.",
      proof:
        "The demo focuses on taming Biome across a Turbo monorepo, where command clarity is the reusable move.",
      stack: ["biome", "turborepo"],
      tags: ["developer-experience", "ci", "formatting"],
      sourceEventIdxs: [],
      transferabilityScore: 4,
      confidence: "medium",
    },
  ],
};

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

  await db.delete(schema.sessionLesson).where(
    sql`${schema.sessionLesson.sessionId} = ${sessionId}
        AND ${schema.sessionLesson.lessonIndex} >= ${lessons.length}
        AND NOT EXISTS (
          SELECT 1
          FROM saved_lesson saved
          WHERE saved.lesson_id = ${schema.sessionLesson.id}
        )`,
  );
}

function demoLessonsFor(row: Pick<SessionLessonInput, "id" | "slug">): SessionLessonDraft[] | null {
  if (!row.id.startsWith("demo_sess_")) return null;
  return DEMO_LESSONS[row.slug] ?? null;
}

export async function generateSessionLessons(
  sessionId: string,
): Promise<SessionLessonGenerationResult> {
  try {
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

    if (events.length === 0) {
      const demoLessons = demoLessonsFor(row);
      if (demoLessons) {
        await persistSessionLessons(sessionId, demoLessons, "demo-seed");
        return { ok: true, sessionId, lessons: demoLessons, model: "demo-seed" };
      }
      return { ok: false, sessionId, reason: "no-events" };
    }

    const client = aiClient();
    if (!client) return { ok: false, sessionId, reason: "no-ai-client" };
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
