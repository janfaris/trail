// Week 4 — cost-per-PR pivot. Hourly cron that drives the attribution engine.
// Mirrors apps/web/app/api/cron/vendor-sync/route.ts for auth + response shape:
// Bearer CRON_SECRET; 200 JSON on success; 401 on missing/wrong secret;
// 500 if CRON_SECRET isn't configured.
//
// Runs at :15 past every hour (see vercel.json) — 15 minutes after vendor-sync
// (which runs at :00) so freshly-synced buckets are visible. maxDuration is
// 300s because backfilling many users × 90 days × many sessions and buckets
// could exceed the 60s default; per-user cost is small (single-digit ms per
// session), but we want headroom.

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  attributeCostsForUser,
  type AttributionResult,
} from "@/lib/cost/attribute";

const LOOKBACK_DAYS = 90;

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function emptyResult(): AttributionResult {
  return {
    sessionsProcessedNative: 0,
    sessionsProcessedFanout: 0,
    bucketsProcessed: 0,
    bucketsSkippedNoShipped: 0,
    bucketsSkippedZeroCost: 0,
    rowsInserted: 0,
    rowsSkippedDuplicate: 0,
    totalAttributedUsd: 0,
  };
}

function addResults(a: AttributionResult, b: AttributionResult): AttributionResult {
  return {
    sessionsProcessedNative:
      a.sessionsProcessedNative + b.sessionsProcessedNative,
    sessionsProcessedFanout:
      a.sessionsProcessedFanout + b.sessionsProcessedFanout,
    bucketsProcessed: a.bucketsProcessed + b.bucketsProcessed,
    bucketsSkippedNoShipped:
      a.bucketsSkippedNoShipped + b.bucketsSkippedNoShipped,
    bucketsSkippedZeroCost:
      a.bucketsSkippedZeroCost + b.bucketsSkippedZeroCost,
    rowsInserted: a.rowsInserted + b.rowsInserted,
    rowsSkippedDuplicate: a.rowsSkippedDuplicate + b.rowsSkippedDuplicate,
    totalAttributedUsd:
      Math.round((a.totalAttributedUsd + b.totalAttributedUsd) * 1e6) / 1e6,
  };
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const authz = req.headers.get("authorization") ?? "";
  if (authz !== `Bearer ${secret}`) return unauthorized();

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - LOOKBACK_DAYS);

  // Union of users who either own a vendor_connection (Path B candidates) or
  // have shipped a trail_session in the last 90 days (Path A candidates).
  // Done in one SQL hop to avoid two round-trips just to dedupe a few hundred
  // ids. Stable order by user id so log lines are reproducible.
  const userRows = await db.execute<{ user_id: string }>(sql`
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM vendor_connection
      UNION
      SELECT user_id FROM trail_session
        WHERE receipt_verified_at IS NOT NULL
          AND receipt_verified_at >= ${since.toISOString()}::timestamptz
    ) AS u
    ORDER BY user_id
  `);

  const users = ((userRows.rows ?? userRows) as Array<{ user_id: string }>).map(
    (r) => r.user_id,
  );

  let aggregate = emptyResult();
  const perUser: Array<{ userId: string; result: AttributionResult; error?: string }> = [];

  for (const userId of users) {
    try {
      const result = await attributeCostsForUser({ userId, since });
      aggregate = addResults(aggregate, result);
      perUser.push({ userId, result });
    } catch (err) {
      // Don't let one user's failure poison the rest of the run; record and
      // continue. Sync worker uses the same pattern.
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron/attribute-costs] user=${userId} failed: ${msg}`);
      perUser.push({ userId, result: emptyResult(), error: msg });
    }
  }

  console.log(
    `[cron/attribute-costs] processed ${users.length} users — ` +
      `inserted=${aggregate.rowsInserted} duplicates=${aggregate.rowsSkippedDuplicate} ` +
      `attributedUsd=${aggregate.totalAttributedUsd.toFixed(6)}`,
  );

  return NextResponse.json({
    ok: true,
    usersProcessed: users.length,
    aggregate,
    perUser,
  });
}
