// Week 4 — cost-per-PR pivot. THE MOAT.
//
// This module turns raw spend data (session-native costs + vendor org-usage
// buckets) into a per-PR ledger row in session_cost_attribution. Two paths:
//
//   PATH A — session-native (Claude Code, Cursor sessions captured by the CLI):
//     trail_session.estimatedCostUsd is already populated from per-event
//     tokens at upload time. We just need to "stamp" the cost to the linked
//     shipped PR by inserting an attribution row and flipping
//     cost_attributed_to_pr = true. No proportional math.
//
//   PATH B — vendor-synced (Anthropic-org, OpenAI org-usage):
//     vendor_usage_bucket holds bucket-level cost (hourly or daily); the
//     API gives no per-PR linkage. We FAN OUT each bucket's cost across
//     shipped trail_session rows whose receiptVerifiedAt falls inside the
//     bucket window, weighted by session duration. Copilot rows are skipped
//     (cost is reported as $0 per workflow doc — fanning out $0 would just
//     pollute the ledger with no signal).
//
// Idempotency: every insert keys on a deterministic sha256(sessionId, source,
// bucketId?) primary key with ON CONFLICT (id) DO NOTHING. Re-running the
// engine over the same window will produce 0 new rows.
//
// Best-effort by design: bucketsSkippedNoShipped counts windows where the
// user spent money but had no shipped PRs to point it at — that spend is
// "unattributed" and surfaced by the validator, not silently dropped.

import { createHash } from "node:crypto";
import { and, between, eq, gt, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";

export type AttributionResult = {
  sessionsProcessedNative: number;
  sessionsProcessedFanout: number;
  bucketsProcessed: number;
  bucketsSkippedNoShipped: number;
  bucketsSkippedZeroCost: number;
  rowsInserted: number;
  rowsSkippedDuplicate: number;
  totalAttributedUsd: number;
};

export type AttributeOpts = {
  userId: string;
  since?: Date;
  until?: Date;
  dryRun?: boolean;
};

const FANOUT_VENDORS = ["anthropic", "openai"] as const;
type FanoutVendor = (typeof FANOUT_VENDORS)[number];

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function nativeId(sessionId: string): string {
  return sha256Hex(`${sessionId}|native|`);
}

function fanoutId(sessionId: string, vendor: FanoutVendor, bucketId: string): string {
  return sha256Hex(`${sessionId}|fanout_${vendor}|${bucketId}`);
}

function round6(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1e6) / 1e6;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

// JS Date subtraction on potentially-null endedAt. Negative durations are
// clamped to 0 (clock-skew defense — a session can't legitimately end before
// it started, but malformed uploads occasionally do this).
function durationMs(startedAt: Date | null, endedAt: Date | null): number {
  if (!startedAt || !endedAt) return 0;
  const ms = endedAt.getTime() - startedAt.getTime();
  return ms > 0 ? ms : 0;
}

export async function attributeCostsForUser(
  opts: AttributeOpts,
): Promise<AttributionResult> {
  const since = opts.since ?? daysAgo(90);
  const until = opts.until ?? new Date();
  const dryRun = opts.dryRun === true;

  const result: AttributionResult = {
    sessionsProcessedNative: 0,
    sessionsProcessedFanout: 0,
    bucketsProcessed: 0,
    bucketsSkippedNoShipped: 0,
    bucketsSkippedZeroCost: 0,
    rowsInserted: 0,
    rowsSkippedDuplicate: 0,
    totalAttributedUsd: 0,
  };

  // ─── PATH A: native session cost ────────────────────────────────────────
  // Pull shipped, linked sessions with non-zero native cost. Note:
  // trail_session.receiptVerifiedAt is `timestamp` (no tz) but bucketStart is
  // `timestamptz`; Drizzle hands us JS Date in both cases so direct comparison
  // works. between() is inclusive on both ends.
  const nativeRows = await db
    .select({
      id: schema.trailSession.id,
      estimatedCostUsd: schema.trailSession.estimatedCostUsd,
      costAttributedToPr: schema.trailSession.costAttributedToPr,
    })
    .from(schema.trailSession)
    .where(
      and(
        eq(schema.trailSession.userId, opts.userId),
        between(schema.trailSession.receiptVerifiedAt, since, until),
        isNotNull(schema.trailSession.linkedPrUrl),
        isNotNull(schema.trailSession.estimatedCostUsd),
        // estimated_cost_usd is numeric → string in drizzle. Filter via SQL
        // so we don't have to materialize zero-cost rows just to skip them.
        gt(schema.trailSession.estimatedCostUsd, "0"),
      ),
    );

  for (const row of nativeRows) {
    result.sessionsProcessedNative += 1;
    const costNum = Number(row.estimatedCostUsd);
    if (!Number.isFinite(costNum) || costNum <= 0) continue;

    const id = nativeId(row.id);

    if (!dryRun) {
      const inserted = await db
        .insert(schema.sessionCostAttribution)
        .values({
          id,
          sessionId: row.id,
          userId: opts.userId,
          source: "native",
          vendorBucketId: null,
          attributedCostUsd: costNum.toFixed(6),
          attributionMethod: "session_native",
          notes: "session-native cost from per-event tokens",
        })
        .onConflictDoNothing({ target: schema.sessionCostAttribution.id })
        .returning({ id: schema.sessionCostAttribution.id });

      if (inserted.length > 0) {
        result.rowsInserted += 1;
        result.totalAttributedUsd = round6(result.totalAttributedUsd + costNum);
      } else {
        result.rowsSkippedDuplicate += 1;
      }

      if (!row.costAttributedToPr) {
        await db
          .update(schema.trailSession)
          .set({ costAttributedToPr: true })
          .where(eq(schema.trailSession.id, row.id));
      }
    } else {
      // Dry run: count what *would* happen. We don't probe for existing rows
      // here because that would add a per-session SELECT for no real benefit
      // (caller is in --dry-run mode, exact dup-vs-new split is not critical).
      result.rowsInserted += 1;
      result.totalAttributedUsd = round6(result.totalAttributedUsd + costNum);
    }
  }

  // ─── PATH B: vendor bucket fan-out ──────────────────────────────────────
  // SELECT vendor_usage_bucket where vendor in fanout-vendors AND has cost.
  // bucketStart filter uses `between(since, until)` — note this means a bucket
  // that *ends* inside [since,until) but *starts* before `since` will be
  // excluded. For the 90-day default window this is fine; explicit `since`
  // callers (e.g. backfill) should pass a date earlier than the earliest
  // bucket they care about.
  const buckets = await db
    .select({
      id: schema.vendorUsageBucket.id,
      vendor: schema.vendorUsageBucket.vendor,
      bucketStart: schema.vendorUsageBucket.bucketStart,
      bucketEnd: schema.vendorUsageBucket.bucketEnd,
      estimatedCostUsd: schema.vendorUsageBucket.estimatedCostUsd,
    })
    .from(schema.vendorUsageBucket)
    .where(
      and(
        eq(schema.vendorUsageBucket.userId, opts.userId),
        sql`${schema.vendorUsageBucket.vendor} IN ('anthropic','openai')`,
        between(schema.vendorUsageBucket.bucketStart, since, until),
        isNotNull(schema.vendorUsageBucket.estimatedCostUsd),
        gt(schema.vendorUsageBucket.estimatedCostUsd, "0"),
      ),
    );

  for (const bucket of buckets) {
    const vendor = bucket.vendor as FanoutVendor;
    if (!FANOUT_VENDORS.includes(vendor)) continue;

    const bucketCost = Number(bucket.estimatedCostUsd);
    if (!Number.isFinite(bucketCost) || bucketCost <= 0) {
      result.bucketsSkippedZeroCost += 1;
      continue;
    }

    // Match shipped sessions for this user that landed inside the bucket's
    // window. We use receiptVerifiedAt (when the commit was confirmed on the
    // default branch) as the "this session shipped at T" anchor — not
    // startedAt or endedAt — because the engine is attributing to *shipped*
    // PRs and the receipt time is the canonical "this work was delivered" stamp.
    const shippedSessions = await db
      .select({
        id: schema.trailSession.id,
        startedAt: schema.trailSession.startedAt,
        endedAt: schema.trailSession.endedAt,
      })
      .from(schema.trailSession)
      .where(
        and(
          eq(schema.trailSession.userId, opts.userId),
          between(
            schema.trailSession.receiptVerifiedAt,
            bucket.bucketStart,
            bucket.bucketEnd,
          ),
          isNotNull(schema.trailSession.linkedPrUrl),
        ),
      );

    if (shippedSessions.length === 0) {
      result.bucketsSkippedNoShipped += 1;
      continue;
    }

    const durations = shippedSessions.map((s) =>
      durationMs(s.startedAt, s.endedAt),
    );
    const totalDuration = durations.reduce((a, b) => a + b, 0);
    const useDuration = totalDuration > 0;
    const attributionMethod = useDuration ? "fanout_by_duration" : "fanout_evenly";

    for (let i = 0; i < shippedSessions.length; i++) {
      const s = shippedSessions[i];
      const share = useDuration
        ? durations[i] / totalDuration
        : 1 / shippedSessions.length;
      const attributedCost = round6(bucketCost * share);
      if (attributedCost <= 0) continue;

      const id = fanoutId(s.id, vendor, bucket.id);
      const source = `fanout_${vendor}` as const;

      if (!dryRun) {
        const inserted = await db
          .insert(schema.sessionCostAttribution)
          .values({
            id,
            sessionId: s.id,
            userId: opts.userId,
            source,
            vendorBucketId: bucket.id,
            attributedCostUsd: attributedCost.toFixed(6),
            attributionMethod,
            notes: `share=${share.toFixed(4)} of bucket`,
          })
          .onConflictDoNothing({ target: schema.sessionCostAttribution.id })
          .returning({ id: schema.sessionCostAttribution.id });

        if (inserted.length > 0) {
          result.rowsInserted += 1;
          result.sessionsProcessedFanout += 1;
          result.totalAttributedUsd = round6(
            result.totalAttributedUsd + attributedCost,
          );
        } else {
          result.rowsSkippedDuplicate += 1;
        }
      } else {
        result.rowsInserted += 1;
        result.sessionsProcessedFanout += 1;
        result.totalAttributedUsd = round6(
          result.totalAttributedUsd + attributedCost,
        );
      }
    }

    result.bucketsProcessed += 1;
  }

  return result;
}
