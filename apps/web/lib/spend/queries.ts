// Spend Audit — Layer 1 (free, instant).
//
// Six pure aggregations over event + trail_session that drive /u/[handle]/spend.
// Owner-only at the page boundary; these functions trust the userId passed in.
//
// Time window anchors on trail_session.startedAt (NOT receiptVerifiedAt) —
// spend is real even when nothing ships. Spec windows: 7 | 30 | 365.
//
// Numeric columns come back from pg as strings. Coerce at the mapping
// boundary; never leak a string into a Number-typed return.

import { sql } from "drizzle-orm";
import { db } from "@/db/client";

export type WindowDays = 7 | 30 | 365;
const ALLOWED_WINDOWS: readonly number[] = [7, 30, 365];

function assertWindow(windowDays: number): WindowDays {
  // TS unions don't survive HTTP/searchParam boundaries — guard at runtime.
  if (!ALLOWED_WINDOWS.includes(windowDays)) {
    throw new Error(`Invalid windowDays: ${windowDays}`);
  }
  return windowDays as WindowDays;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// neon-http returns { rows: T[] } from db.execute. Defensive accessor keeps
// us TS-strict without `any` if the driver shape changes.
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const r = (result as { rows: unknown }).rows;
    if (Array.isArray(r)) return r as T[];
  }
  return [];
}

// ─── kind ──────────────────────────────────────────────────────────────────
type KindRowRaw = {
  kind: string;
  input_tokens: string | null;
  output_tokens: string | null;
  cache_read_tokens: string | null;
  cache_creation_tokens: string | null;
  event_count: string | null;
};
export type TokensByKindRow = {
  kind: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  eventCount: number;
};

export async function getTokensByEventKind(
  userId: string,
  windowDays: number,
): Promise<TokensByKindRow[]> {
  const days = assertWindow(windowDays);
  const result = await db.execute<KindRowRaw>(sql`
    SELECT
      e.kind AS kind,
      COALESCE(SUM(e.input_tokens), 0)::bigint AS input_tokens,
      COALESCE(SUM(e.output_tokens), 0)::bigint AS output_tokens,
      COALESCE(SUM(e.cache_read_input_tokens), 0)::bigint AS cache_read_tokens,
      COALESCE(SUM(e.cache_creation_input_tokens), 0)::bigint AS cache_creation_tokens,
      COUNT(*)::bigint AS event_count
    FROM event e
    JOIN trail_session s ON s.id = e.session_id
    WHERE s.user_id = ${userId}
      AND s.started_at >= now() - ${days}::int * interval '1 day'
    GROUP BY e.kind
    ORDER BY (
      COALESCE(SUM(e.input_tokens), 0) + COALESCE(SUM(e.output_tokens), 0)
    ) DESC
  `);
  return rowsOf<KindRowRaw>(result).map((r) => ({
    kind: r.kind,
    inputTokens: toNumber(r.input_tokens),
    outputTokens: toNumber(r.output_tokens),
    cacheReadTokens: toNumber(r.cache_read_tokens),
    cacheCreationTokens: toNumber(r.cache_creation_tokens),
    eventCount: toNumber(r.event_count),
  }));
}

// ─── tool name ─────────────────────────────────────────────────────────────
type ToolRowRaw = {
  tool_name: string;
  input_tokens: string | null;
  output_tokens: string | null;
  call_count: string | null;
};
export type TokensByToolRow = {
  toolName: string;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
};

export async function getTokensByToolName(
  userId: string,
  windowDays: number,
): Promise<TokensByToolRow[]> {
  const days = assertWindow(windowDays);
  // Tokens on tool_call events are often null (assistant-turn tokens land on
  // the completion event). callCount is usually the meaningful column.
  const result = await db.execute<ToolRowRaw>(sql`
    SELECT
      e.data->>'name' AS tool_name,
      COALESCE(SUM(e.input_tokens), 0)::bigint AS input_tokens,
      COALESCE(SUM(e.output_tokens), 0)::bigint AS output_tokens,
      COUNT(*)::bigint AS call_count
    FROM event e
    JOIN trail_session s ON s.id = e.session_id
    WHERE s.user_id = ${userId}
      AND s.started_at >= now() - ${days}::int * interval '1 day'
      AND e.kind = 'tool_call'
      AND e.data->>'name' IS NOT NULL
    GROUP BY e.data->>'name'
    ORDER BY (
      COALESCE(SUM(e.input_tokens), 0) + COALESCE(SUM(e.output_tokens), 0)
    ) DESC, COUNT(*) DESC
    LIMIT 20
  `);
  return rowsOf<ToolRowRaw>(result).map((r) => ({
    toolName: r.tool_name,
    inputTokens: toNumber(r.input_tokens),
    outputTokens: toNumber(r.output_tokens),
    callCount: toNumber(r.call_count),
  }));
}

// ─── model ─────────────────────────────────────────────────────────────────
type ModelRowRaw = {
  model: string;
  input_tokens: string | null;
  output_tokens: string | null;
  cache_read_tokens: string | null;
  event_count: string | null;
};
export type TokensByModelRow = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  eventCount: number;
};

export async function getTokensByModel(
  userId: string,
  windowDays: number,
): Promise<TokensByModelRow[]> {
  const days = assertWindow(windowDays);
  const result = await db.execute<ModelRowRaw>(sql`
    SELECT
      e.model AS model,
      COALESCE(SUM(e.input_tokens), 0)::bigint AS input_tokens,
      COALESCE(SUM(e.output_tokens), 0)::bigint AS output_tokens,
      COALESCE(SUM(e.cache_read_input_tokens), 0)::bigint AS cache_read_tokens,
      COUNT(*)::bigint AS event_count
    FROM event e
    JOIN trail_session s ON s.id = e.session_id
    WHERE s.user_id = ${userId}
      AND s.started_at >= now() - ${days}::int * interval '1 day'
      AND e.model IS NOT NULL
    GROUP BY e.model
    ORDER BY (
      COALESCE(SUM(e.input_tokens), 0) + COALESCE(SUM(e.output_tokens), 0)
    ) DESC
  `);
  return rowsOf<ModelRowRaw>(result).map((r) => ({
    model: r.model,
    inputTokens: toNumber(r.input_tokens),
    outputTokens: toNumber(r.output_tokens),
    cacheReadTokens: toNumber(r.cache_read_tokens),
    eventCount: toNumber(r.event_count),
  }));
}

// ─── cache hit ─────────────────────────────────────────────────────────────
type CacheRowRaw = {
  total_input_tokens: string | null;
  cache_read_tokens: string | null;
  cache_creation_tokens: string | null;
};
export type CacheHitStats = {
  totalInputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  hitRatio: number;
};

export async function getCacheHitStats(
  userId: string,
  windowDays: number,
): Promise<CacheHitStats> {
  const days = assertWindow(windowDays);
  const result = await db.execute<CacheRowRaw>(sql`
    SELECT
      COALESCE(SUM(e.input_tokens), 0)::bigint AS total_input_tokens,
      COALESCE(SUM(e.cache_read_input_tokens), 0)::bigint AS cache_read_tokens,
      COALESCE(SUM(e.cache_creation_input_tokens), 0)::bigint AS cache_creation_tokens
    FROM event e
    JOIN trail_session s ON s.id = e.session_id
    WHERE s.user_id = ${userId}
      AND s.started_at >= now() - ${days}::int * interval '1 day'
  `);
  const first = rowsOf<CacheRowRaw>(result)[0] ?? null;
  const totalInputTokens = toNumber(first?.total_input_tokens);
  const cacheReadTokens = toNumber(first?.cache_read_tokens);
  const cacheCreationTokens = toNumber(first?.cache_creation_tokens);
  // event.input_tokens is the FULL input (uncached + cache_read + cache_creation)
  // per apps/web/app/api/sessions/upload/route.ts:87-90. So the hit ratio is
  // cache_read / input_tokens directly; adding cache_read to the denominator
  // would double-count it and halve the reported rate.
  const divisor = totalInputTokens;
  let hitRatio = divisor > 0 ? cacheReadTokens / divisor : 0;
  if (!Number.isFinite(hitRatio) || hitRatio < 0) hitRatio = 0;
  if (hitRatio > 1) hitRatio = 1;
  return { totalInputTokens, cacheReadTokens, cacheCreationTokens, hitRatio };
}

// ─── outcome ───────────────────────────────────────────────────────────────
type OutcomeRowRaw = {
  outcome: string;
  session_count: string | null;
  total_cost_usd: string | null;
};
export type CostByOutcomeRow = {
  outcome: string;
  sessionCount: number;
  totalCostUsd: number;
};

export async function getCostByOutcome(
  userId: string,
  windowDays: number,
): Promise<CostByOutcomeRow[]> {
  const days = assertWindow(windowDays);
  const result = await db.execute<OutcomeRowRaw>(sql`
    SELECT
      COALESCE(s.outcome, 'unknown') AS outcome,
      COUNT(*)::bigint AS session_count,
      COALESCE(SUM(s.estimated_cost_usd), 0)::numeric AS total_cost_usd
    FROM trail_session s
    WHERE s.user_id = ${userId}
      AND s.started_at >= now() - ${days}::int * interval '1 day'
    GROUP BY COALESCE(s.outcome, 'unknown')
    ORDER BY COALESCE(SUM(s.estimated_cost_usd), 0) DESC
  `);
  return rowsOf<OutcomeRowRaw>(result).map((r) => ({
    outcome: r.outcome,
    sessionCount: toNumber(r.session_count),
    totalCostUsd: toNumber(r.total_cost_usd),
  }));
}

// ─── top expensive ─────────────────────────────────────────────────────────
type TopRowRaw = {
  slug: string;
  title: string | null;
  tool: string;
  estimated_cost_usd: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  started_at: Date | string;
  outcome: string | null;
};
export type TopSessionRow = {
  slug: string;
  title: string | null;
  tool: string;
  estimatedCostUsd: number;
  inputTokens: number | null;
  outputTokens: number | null;
  startedAt: Date;
  outcome: string | null;
};

export async function getTopExpensiveSessions(
  userId: string,
  windowDays: number,
  limit = 10,
): Promise<TopSessionRow[]> {
  const days = assertWindow(windowDays);
  const safeLimit = Number.isInteger(limit) && limit > 0 && limit <= 100 ? limit : 10;
  // estimated_cost_usd IS NOT NULL — don't pad the list with un-costed
  // sessions when the user has fewer priced rows than `limit`.
  const result = await db.execute<TopRowRaw>(sql`
    SELECT
      s.slug,
      s.title,
      s.tool,
      s.estimated_cost_usd::text AS estimated_cost_usd,
      s.input_tokens,
      s.output_tokens,
      s.started_at,
      s.outcome
    FROM trail_session s
    WHERE s.user_id = ${userId}
      AND s.started_at >= now() - ${days}::int * interval '1 day'
      AND s.estimated_cost_usd IS NOT NULL
      AND s.estimated_cost_usd > 0
    ORDER BY s.estimated_cost_usd DESC NULLS LAST, s.started_at DESC
    LIMIT ${safeLimit}
  `);
  return rowsOf<TopRowRaw>(result).map((r) => ({
    slug: r.slug,
    title: r.title,
    tool: r.tool,
    estimatedCostUsd: toNumber(r.estimated_cost_usd),
    inputTokens: r.input_tokens == null ? null : toNumber(r.input_tokens),
    outputTokens: r.output_tokens == null ? null : toNumber(r.output_tokens),
    startedAt: r.started_at instanceof Date ? r.started_at : new Date(r.started_at),
    outcome: r.outcome,
  }));
}
