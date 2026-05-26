// Task 2.4 — cost-per-PR pivot. Hourly background worker that fans out across
// the vendor_connection table, pulls usage from each vendor's org-level API,
// and lands raw bucket rows into vendor_usage_bucket. PR attribution happens
// later (Week 4); this worker's contract is "make the raw data eventually
// arrive, idempotently, without spinning on bad credentials."
//
// Scope:
//   - 'anthropic' fully implemented via @trail/parsers.fetchAnthropicOrgUsage.
//   - 'cursor' / 'openai' / 'copilot' return { status: 'not_implemented' }
//     so the cron stays honest about what it does and doesn't cover.
//
// Notes on watermark handling (last_synced_at):
//   - Successful syncs advance last_synced_at to the FETCH endingAt (the
//     start of today UTC — see below). This means the next run picks up from
//     yesterday's close, never re-querying already-closed buckets.
//   - Failed syncs DO NOT touch last_synced_at. Hourly cron + the predicate
//     in syncAllPending() naturally re-attempts on the next run; if we
//     advanced the watermark on error we'd permanently skip data in the
//     failed window. Anthropic's hourly buckets are stable once closed, so
//     "retry from last successful endingAt" is safe.
//   - bucketWidth is '1d' per spec. To avoid locking partial-day numbers
//     into the table via ON CONFLICT DO NOTHING, the worker only fetches
//     CLOSED days (endingAt = start of today UTC). Today's usage lands
//     tomorrow. This is acceptable for cost-per-PR attribution since PRs
//     ship over hours/days, not seconds.
//
// Notes on idempotency:
//   - vendor_usage_bucket.id is a deterministic SHA-256 of the natural key
//     (canonical JSON of [userId, vendor, bucketStart, bucketEnd, bucketWidth,
//     model, workspaceId, apiKeyId]). ON CONFLICT (id) DO NOTHING is the
//     dedup mechanism — this sidesteps Postgres NULLS DISTINCT semantics
//     that would otherwise break the natural-key unique index.

import { createHash } from "node:crypto";
import { and, eq, lt, ne, or, sql } from "drizzle-orm";
import { fetchAnthropicOrgUsage, AnthropicUsageError } from "@trail/parsers";
import type { AnthropicUsageRow } from "@trail/parsers";
import { db, schema } from "@/db/client";
import { decryptVendorKey } from "@/lib/crypto/vendor-keys";
import {
  computeCostUsd,
  lookupModelPrice,
  type PriceSnapshot,
} from "@/lib/cost/price-lookup";

const ANTHROPIC_BUCKET_WIDTH = "1d" as const;
const ANTHROPIC_DEFAULT_LOOKBACK_DAYS = 30;
const PER_RUN_CONNECTION_CAP = 50;

export type VendorConnectionRow = typeof schema.vendorConnection.$inferSelect;

export type SyncResult = {
  connectionId: string;
  vendor: string;
  status:
    | "ok"
    | "auth_error"
    | "rate_limited"
    | "not_implemented"
    | "error";
  rowsInserted: number;
  rowsSkipped: number;
  errorMessage?: string;
};

function startOfTodayUtc(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function makeBucketId(parts: {
  userId: string;
  vendor: string;
  bucketStart: string;
  bucketEnd: string;
  bucketWidth: string;
  model: string | null;
  workspaceId: string | null;
  apiKeyId: string | null;
}): string {
  // Canonical JSON of the natural key — keeps NULL distinct from "" and
  // avoids delimiter-collision ambiguity. First 32 hex chars = 128 bits of
  // SHA-256, which is far beyond collision-resistant at the volumes we expect.
  const canonical = JSON.stringify([
    parts.userId,
    parts.vendor,
    parts.bucketStart,
    parts.bucketEnd,
    parts.bucketWidth,
    parts.model,
    parts.workspaceId,
    parts.apiKeyId,
  ]);
  return `vub_${createHash("sha256").update(canonical).digest("hex").slice(0, 32)}`;
}

function classifyAnthropicError(
  err: unknown,
): { status: SyncResult["status"]; code: string } {
  if (err instanceof AnthropicUsageError) {
    if (err.status === 401 || err.status === 403) {
      return { status: "auth_error", code: "invalid_api_key" };
    }
    if (err.status === 429) {
      return { status: "rate_limited", code: "rate_limited" };
    }
    return { status: "error", code: `http_${err.status}` };
  }
  return { status: "error", code: "internal_error" };
}

async function insertAnthropicRows(
  userId: string,
  rows: AnthropicUsageRow[],
): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  // Cache price lookups per modelId across this batch — usage rows for the
  // same day commonly repeat the same model.
  const priceCache = new Map<string, PriceSnapshot | null>();
  const getPrice = async (modelId: string | null) => {
    if (!modelId) return null;
    if (priceCache.has(modelId)) return priceCache.get(modelId) ?? null;
    const p = await lookupModelPrice("anthropic", modelId);
    priceCache.set(modelId, p);
    if (!p) {
      console.warn(
        `[vendor-sync] no model_price row for anthropic:${modelId} — inserting with estimatedCostUsd=NULL`,
      );
    }
    return p;
  };

  const values: Array<typeof schema.vendorUsageBucket.$inferInsert> = [];
  for (const r of rows) {
    if (!r.bucketStart || !r.bucketEnd) continue;
    const bucketStart = new Date(r.bucketStart);
    const bucketEnd = new Date(r.bucketEnd);
    if (Number.isNaN(bucketStart.getTime()) || Number.isNaN(bucketEnd.getTime())) {
      continue;
    }

    const price = await getPrice(r.model);
    const estimated =
      price != null
        ? computeCostUsd(
            {
              uncachedInputTokens: r.uncachedInputTokens,
              cacheCreationInputTokens: r.cacheCreationInputTokens,
              cacheReadInputTokens: r.cacheReadInputTokens,
              outputTokens: r.outputTokens,
            },
            price,
          )
        : null;

    const id = makeBucketId({
      userId,
      vendor: "anthropic",
      bucketStart: bucketStart.toISOString(),
      bucketEnd: bucketEnd.toISOString(),
      bucketWidth: ANTHROPIC_BUCKET_WIDTH,
      model: r.model,
      workspaceId: r.workspaceId,
      apiKeyId: r.apiKeyId,
    });

    values.push({
      id,
      userId,
      vendor: "anthropic",
      bucketStart,
      bucketEnd,
      bucketWidth: ANTHROPIC_BUCKET_WIDTH,
      model: r.model,
      workspaceId: r.workspaceId,
      apiKeyId: r.apiKeyId,
      serviceTier: r.serviceTier,
      contextWindow: r.contextWindow,
      uncachedInputTokens: r.uncachedInputTokens,
      cacheCreationInputTokens: r.cacheCreationInputTokens,
      cacheReadInputTokens: r.cacheReadInputTokens,
      outputTokens: r.outputTokens,
      estimatedCostUsd: estimated != null ? estimated.toFixed(6) : null,
      modelPriceSnapshot: price,
      rawPayload: r as unknown as Record<string, unknown>,
    });
  }

  if (values.length === 0) return { inserted: 0, skipped: 0 };

  // Single batched insert with PK-based conflict resolution. .returning() on
  // a DO NOTHING insert only returns the rows that actually landed, so the
  // delta gives us the skipped count.
  const inserted = await db
    .insert(schema.vendorUsageBucket)
    .values(values)
    .onConflictDoNothing({ target: schema.vendorUsageBucket.id })
    .returning({ id: schema.vendorUsageBucket.id });

  return {
    inserted: inserted.length,
    skipped: values.length - inserted.length,
  };
}

async function syncAnthropic(
  connection: VendorConnectionRow,
  plaintextKey: string,
): Promise<SyncResult> {
  const endingAt = startOfTodayUtc();
  const lookbackMs = ANTHROPIC_DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const startingAt =
    connection.lastSyncedAt ?? new Date(endingAt.getTime() - lookbackMs);

  // Nothing to do — we've already synced through end-of-yesterday. Mark the
  // connection healthy and move on. (Updating updatedAt only; lastSyncedAt
  // already equals endingAt.)
  if (startingAt.getTime() >= endingAt.getTime()) {
    await db
      .update(schema.vendorConnection)
      .set({
        syncStatus: "ok",
        syncErrorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.vendorConnection.id, connection.id));
    return {
      connectionId: connection.id,
      vendor: connection.vendor,
      status: "ok",
      rowsInserted: 0,
      rowsSkipped: 0,
    };
  }

  let rows: AnthropicUsageRow[];
  try {
    rows = await fetchAnthropicOrgUsage({
      apiKey: plaintextKey,
      startingAt,
      endingAt,
      bucketWidth: ANTHROPIC_BUCKET_WIDTH,
      groupBy: ["model", "workspace_id"],
    });
  } catch (err) {
    const { status, code } = classifyAnthropicError(err);
    // DO NOT include error.body in the persisted message — vendor error
    // bodies can echo request parameters. We only persist a stable code.
    await db
      .update(schema.vendorConnection)
      .set({
        syncStatus: status,
        syncErrorMessage: code,
        updatedAt: new Date(),
      })
      .where(eq(schema.vendorConnection.id, connection.id));
    return {
      connectionId: connection.id,
      vendor: connection.vendor,
      status,
      rowsInserted: 0,
      rowsSkipped: 0,
      errorMessage: code,
    };
  }

  let inserted = 0;
  let skipped = 0;
  try {
    const result = await insertAnthropicRows(connection.userId, rows);
    inserted = result.inserted;
    skipped = result.skipped;
  } catch (err) {
    // DB write failure (constraint violation, network blip). Leave
    // lastSyncedAt unchanged so the next run re-attempts the same window.
    console.error(
      `[vendor-sync] insert failed for connection ${connection.id}:`,
      err instanceof Error ? err.message : String(err),
    );
    await db
      .update(schema.vendorConnection)
      .set({
        syncStatus: "error",
        syncErrorMessage: "db_insert_failed",
        updatedAt: new Date(),
      })
      .where(eq(schema.vendorConnection.id, connection.id));
    return {
      connectionId: connection.id,
      vendor: connection.vendor,
      status: "error",
      rowsInserted: 0,
      rowsSkipped: 0,
      errorMessage: "db_insert_failed",
    };
  }

  await db
    .update(schema.vendorConnection)
    .set({
      syncStatus: "ok",
      syncErrorMessage: null,
      lastSyncedAt: endingAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.vendorConnection.id, connection.id));

  return {
    connectionId: connection.id,
    vendor: connection.vendor,
    status: "ok",
    rowsInserted: inserted,
    rowsSkipped: skipped,
  };
}

export async function syncOneConnection(
  connection: VendorConnectionRow,
): Promise<SyncResult> {
  // Vendors with no cloud-side sync API. Touch the row so observers can see
  // the worker noticed it, but don't burn cycles past that.
  if (connection.vendor !== "anthropic") {
    await db
      .update(schema.vendorConnection)
      .set({
        syncStatus: "not_implemented",
        syncErrorMessage: null,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.vendorConnection.id, connection.id));
    return {
      connectionId: connection.id,
      vendor: connection.vendor,
      status: "not_implemented",
      rowsInserted: 0,
      rowsSkipped: 0,
    };
  }

  let plaintextKey: string;
  try {
    plaintextKey = await decryptVendorKey(connection.apiKeyEnc);
  } catch {
    // Decryption failure means the stored ciphertext is corrupt or the
    // server key has rotated. Don't touch lastSyncedAt — humans need to fix
    // this manually. Never log the ciphertext or the exception body.
    await db
      .update(schema.vendorConnection)
      .set({
        syncStatus: "error",
        syncErrorMessage: "decrypt_failed",
        updatedAt: new Date(),
      })
      .where(eq(schema.vendorConnection.id, connection.id));
    return {
      connectionId: connection.id,
      vendor: connection.vendor,
      status: "error",
      rowsInserted: 0,
      rowsSkipped: 0,
      errorMessage: "decrypt_failed",
    };
  }

  return syncAnthropic(connection, plaintextKey);
}

export async function syncAllPending(): Promise<{
  runs: SyncResult[];
  totalDuration: number;
}> {
  const startedAt = Date.now();

  // Retry rule: any non-auth-error row is eligible every run; auth-error
  // rows wait at least an hour between attempts.
  // auth_error connections retry at most hourly; never-synced auth_error
  // connections are filtered out until cooldown elapses to avoid hammering
  // vendor APIs. (lt(null, ts) is NULL → falsy in WHERE, so never-synced
  // auth_error rows are excluded by the second clause as desired.)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const pending = await db
    .select()
    .from(schema.vendorConnection)
    .where(
      or(
        ne(schema.vendorConnection.syncStatus, "auth_error"),
        lt(schema.vendorConnection.lastSyncedAt, oneHourAgo),
      ),
    )
    .orderBy(sql`${schema.vendorConnection.lastSyncedAt} NULLS FIRST`)
    .limit(PER_RUN_CONNECTION_CAP);

  const runs: SyncResult[] = [];
  for (const conn of pending) {
    try {
      runs.push(await syncOneConnection(conn));
    } catch (err) {
      // Catch-all so one bad connection can't take down the whole run. The
      // per-connection paths already persist their own status; this is the
      // last-resort guard.
      console.error(
        `[vendor-sync] uncaught failure for connection ${conn.id}:`,
        err instanceof Error ? err.message : String(err),
      );
      runs.push({
        connectionId: conn.id,
        vendor: conn.vendor,
        status: "error",
        rowsInserted: 0,
        rowsSkipped: 0,
        errorMessage: "uncaught_exception",
      });
    }
  }

  return { runs, totalDuration: Date.now() - startedAt };
}

// Re-exported helper for testing — not consumed by routes.
export const __test__ = { makeBucketId, startOfTodayUtc };
