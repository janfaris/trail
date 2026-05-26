// Task 2.4 — cost-per-PR pivot. Resolves the currently-active modelPrice row
// for a (vendor, modelId) pair and computes USD cost from a token tuple. The
// vendor-sync worker calls these from inside the per-row insert loop; receipts
// and Week-4 PR attribution will likely call them too.
//
// Lookup semantics: prefer an exact match on (vendor, modelId) where
// effectiveTo IS NULL; if absent, fall back to a longest-prefix match (e.g.
// vendor APIs sometimes report "claude-sonnet-4-5-20250101" while pricing was
// seeded under "claude-sonnet-4-5"). Returns null if nothing matches — callers
// decide whether to insert a usage row with estimatedCostUsd=NULL or to skip.

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";

export type PriceSnapshot = {
  model: string;
  inUsdPerMtok: number;
  outUsdPerMtok: number;
  cachedReadUsdPerMtok: number | null;
  cachedCreationUsdPerMtok: number | null;
  capturedAt: string;
};

type ActiveRow = {
  modelId: string;
  inUsdPerMtok: string;
  outUsdPerMtok: string;
  cachedInUsdPerMtok: string | null;
  effectiveFrom: Date;
};

function rowToSnapshot(row: ActiveRow): PriceSnapshot {
  // model_price stores rates as numeric(10,4); drizzle's pg numeric returns
  // strings, so parse here and surface JS numbers to consumers.
  const inUsd = Number(row.inUsdPerMtok);
  const cachedInUsd =
    row.cachedInUsdPerMtok != null ? Number(row.cachedInUsdPerMtok) : null;
  return {
    model: row.modelId,
    inUsdPerMtok: inUsd,
    outUsdPerMtok: Number(row.outUsdPerMtok),
    // Anthropic-style split: model_price.cachedInUsdPerMtok carries the read
    // rate when present. Cache-creation rate isn't stored — callers (or the
    // computeCostUsd helper) fall back to the 1.25x heuristic.
    cachedReadUsdPerMtok: cachedInUsd,
    cachedCreationUsdPerMtok: null,
    capturedAt: row.effectiveFrom.toISOString(),
  };
}

export async function lookupModelPrice(
  vendor: string,
  modelId: string,
): Promise<PriceSnapshot | null> {
  if (!modelId) return null;

  const exact = await db
    .select({
      modelId: schema.modelPrice.modelId,
      inUsdPerMtok: schema.modelPrice.inUsdPerMtok,
      outUsdPerMtok: schema.modelPrice.outUsdPerMtok,
      cachedInUsdPerMtok: schema.modelPrice.cachedInUsdPerMtok,
      effectiveFrom: schema.modelPrice.effectiveFrom,
    })
    .from(schema.modelPrice)
    .where(
      and(
        eq(schema.modelPrice.vendor, vendor),
        eq(schema.modelPrice.modelId, modelId),
        isNull(schema.modelPrice.effectiveTo),
      ),
    )
    .orderBy(desc(schema.modelPrice.effectiveFrom))
    .limit(1);

  if (exact[0]) return rowToSnapshot(exact[0]);

  // Prefix fallback. Anthropic sometimes appends a date suffix to model ids
  // (e.g. "claude-sonnet-4-5-20250101"); the seed table stores the family
  // root ("claude-sonnet-4-5"). We pick the LONGEST stored prefix so a more
  // specific seed always wins over a generic one. char_length is safe because
  // model_id is short ASCII.
  const escaped = modelId.replace(/[\\%_]/g, (m) => `\\${m}`);
  const prefix = await db
    .select({
      modelId: schema.modelPrice.modelId,
      inUsdPerMtok: schema.modelPrice.inUsdPerMtok,
      outUsdPerMtok: schema.modelPrice.outUsdPerMtok,
      cachedInUsdPerMtok: schema.modelPrice.cachedInUsdPerMtok,
      effectiveFrom: schema.modelPrice.effectiveFrom,
    })
    .from(schema.modelPrice)
    .where(
      and(
        eq(schema.modelPrice.vendor, vendor),
        isNull(schema.modelPrice.effectiveTo),
        // Match seeds that are a prefix of the requested modelId (NOT the
        // other way around — we want "claude-sonnet-4-5" to match a request
        // for "claude-sonnet-4-5-20250101", not vice versa).
        sql`${escaped} LIKE ${schema.modelPrice.modelId} || '%' ESCAPE '\\'`,
      ),
    )
    .orderBy(sql`char_length(${schema.modelPrice.modelId}) DESC`)
    .limit(1);

  if (prefix[0]) return rowToSnapshot(prefix[0]);
  return null;
}

function round6(n: number): number {
  if (!Number.isFinite(n)) return 0;
  // numeric(12,6) — round to 6 decimal places.
  return Math.round(n * 1e6) / 1e6;
}

export function computeCostUsd(
  row: {
    uncachedInputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
    outputTokens: number;
  },
  price: PriceSnapshot,
): number {
  // Cache-read defaults to 10% of input rate (Anthropic's published ratio);
  // cache-creation defaults to 125% of input rate. These fall-throughs cover
  // the case where model_price only stores the base rate and not the cached
  // split. If the upstream catalog ever exposes both, the snapshot fields
  // populate and the heuristic doesn't run.
  const cachedReadRate =
    price.cachedReadUsdPerMtok ?? price.inUsdPerMtok * 0.1;
  const cachedCreationRate =
    price.cachedCreationUsdPerMtok ?? price.inUsdPerMtok * 1.25;

  const uncachedInputCost = (row.uncachedInputTokens / 1e6) * price.inUsdPerMtok;
  const cacheCreationCost =
    (row.cacheCreationInputTokens / 1e6) * cachedCreationRate;
  const cacheReadCost = (row.cacheReadInputTokens / 1e6) * cachedReadRate;
  const outputCost = (row.outputTokens / 1e6) * price.outUsdPerMtok;

  return round6(
    uncachedInputCost + cacheCreationCost + cacheReadCost + outputCost,
  );
}
