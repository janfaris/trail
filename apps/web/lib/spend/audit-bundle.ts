// Spend Audit — bundle assembly + anonymize roundtrip.
//
// Pulls the top-N most expensive sessions in window, fetches their first
// 60 (prompt | tool_call | completion) events, truncates each event's
// data payload, then wraps the whole thing as a single `Session.event[].note`
// so we can ride the `@trail/anonymize` Session-shaped scrubber instead of
// rewriting detector coverage per shape.
//
// The anonymized JSON we hand back to the LLM is whatever survives the
// detector pass on that note string. Entropy suspects that survive are
// surfaced as a fatal SpendAuditError — we don't ship unknown high-entropy
// tokens to OpenAI even if the user has opted in.

import { sql, eq, and, gte, isNotNull, gt } from "drizzle-orm";
import { anonymize, type RedactionCategory } from "@trail/anonymize";
import type { Session as SessionT, ToolKind } from "@trail/schema";
import { db, schema } from "@/db/client";

export type BundleEvent = {
  id: string;
  idx: number;
  kind: "prompt" | "tool_call" | "completion";
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheReadInputTokens?: number | null;
  data: unknown; // truncated, kind-specific shape; see truncateEventData
};

export type BundleSession = {
  id: string;
  slug: string;
  tool: string;
  models: string[];
  estimatedCostUsd: number;
  events: BundleEvent[];
};

export type Bundle = {
  windowDays: 7 | 30 | 365;
  sessions: BundleSession[];
};

export type BundleResult = {
  bundle: Bundle;
  scrubbedJson: string;
  redactionReport: {
    total: number;
    byCategory: Record<string, number>;
    suspectCount: number;
  };
};

const MAX_EVENTS_PER_SESSION = 60;
const HEAD_CHARS = 800;
const TAIL_CHARS = 200;

// Truncate any long string to "first 800 ... [N truncated] ... last 200" so
// the LLM still sees both ends of huge tool outputs without us paying for the
// middle.
function truncateString(s: string): string {
  if (s.length <= HEAD_CHARS + TAIL_CHARS) return s;
  const truncated = s.length - HEAD_CHARS - TAIL_CHARS;
  return `${s.slice(0, HEAD_CHARS)} ... [${truncated} chars truncated] ... ${s.slice(-TAIL_CHARS)}`;
}

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function truncateEventData(kind: string, data: unknown): unknown {
  const d = (data ?? {}) as Record<string, unknown>;
  if (kind === "prompt" || kind === "completion") {
    return { text: truncateString(asString(d.text ?? "")) };
  }
  if (kind === "tool_call") {
    return {
      name: typeof d.name === "string" ? d.name : "unknown",
      args: truncateString(asString(d.args ?? null)),
      result: d.result === undefined ? undefined : truncateString(asString(d.result)),
    };
  }
  return {};
}

type ExpensiveSessionRow = {
  id: string;
  slug: string;
  tool: string;
  models: string[] | null;
  estimatedCostUsd: string | null;
};

async function fetchExpensiveSessions(
  userId: string,
  windowDays: 7 | 30 | 365,
  limit: number,
): Promise<ExpensiveSessionRow[]> {
  // Mirrors lib/spend/queries.ts getTopExpensiveSessions but also returns
  // session.id (which we need to fetch child events) + models.
  const rows = await db
    .select({
      id: schema.trailSession.id,
      slug: schema.trailSession.slug,
      tool: schema.trailSession.tool,
      models: schema.trailSession.models,
      estimatedCostUsd: schema.trailSession.estimatedCostUsd,
    })
    .from(schema.trailSession)
    .where(
      and(
        eq(schema.trailSession.userId, userId),
        gte(
          schema.trailSession.startedAt,
          sql`now() - ${windowDays}::int * interval '1 day'`,
        ),
        isNotNull(schema.trailSession.estimatedCostUsd),
        gt(schema.trailSession.estimatedCostUsd, sql`0`),
      ),
    )
    .orderBy(sql`${schema.trailSession.estimatedCostUsd} DESC NULLS LAST`)
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    tool: r.tool,
    models: r.models,
    estimatedCostUsd: r.estimatedCostUsd,
  }));
}

async function fetchEvents(
  sessionId: string,
  limit: number,
): Promise<BundleEvent[]> {
  const rows = await db
    .select({
      id: schema.event.id,
      idx: schema.event.idx,
      kind: schema.event.kind,
      data: schema.event.data,
      model: schema.event.model,
      inputTokens: schema.event.inputTokens,
      outputTokens: schema.event.outputTokens,
      cacheReadInputTokens: schema.event.cacheReadInputTokens,
    })
    .from(schema.event)
    .where(
      and(
        eq(schema.event.sessionId, sessionId),
        sql`${schema.event.kind} IN ('prompt','tool_call','completion')`,
      ),
    )
    .orderBy(schema.event.idx)
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    idx: r.idx,
    kind: r.kind as BundleEvent["kind"],
    model: r.model ?? null,
    inputTokens: r.inputTokens ?? null,
    outputTokens: r.outputTokens ?? null,
    cacheReadInputTokens: r.cacheReadInputTokens ?? null,
    data: truncateEventData(r.kind, r.data),
  }));
}

export async function assembleBundle(
  userId: string,
  windowDays: 7 | 30 | 365,
  maxSessions = 10,
): Promise<BundleSession[]> {
  const sessions = await fetchExpensiveSessions(userId, windowDays, maxSessions);
  const out: BundleSession[] = [];
  for (const s of sessions) {
    const events = await fetchEvents(s.id, MAX_EVENTS_PER_SESSION);
    out.push({
      id: s.id,
      slug: s.slug,
      tool: s.tool,
      models: Array.isArray(s.models) ? s.models : [],
      estimatedCostUsd: s.estimatedCostUsd == null ? 0 : Number(s.estimatedCostUsd),
      events,
    });
  }
  return out;
}

// Stuff the bundle JSON into a single Session.events[0].note and run it
// through the existing Session-shaped anonymize(). This is the lazy route —
// we get every detector's coverage for free without per-shape reimplementation.
// Pulls the scrubbed JSON back out of the same event note on the way out.
export function scrubBundle(bundle: Bundle): BundleResult {
  const wrapped: SessionT = {
    id: "spend-audit-bundle",
    user: "spend-audit",
    tool: "hermes" as ToolKind, // valid ToolKind; not user-facing
    startedAt: new Date().toISOString(),
    events: [
      {
        kind: "decision",
        at: new Date().toISOString(),
        note: JSON.stringify(bundle),
      },
    ],
  };

  const { session, report } = anonymize(wrapped);
  const first = session.events[0];
  if (!first || first.kind !== "decision") {
    throw new Error("scrubBundle: anonymize stripped the wrapper event");
  }
  const scrubbedJson = first.note;
  const byCategory: Record<string, number> = {};
  for (const [k, v] of Object.entries(report.byCategory)) {
    byCategory[k as RedactionCategory] = v;
  }
  return {
    bundle, // pre-scrub local-only copy; never persisted, never sent to LLM
    scrubbedJson,
    redactionReport: {
      total: report.total,
      byCategory,
      suspectCount: report.suspects.length,
    },
  };
}
