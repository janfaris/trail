export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { authorizeRadarCronRequest } from "@/lib/radar-cron-auth";
import { RADAR_FETCH_SCHEDULE, nextCronRunAfter } from "@/lib/radar-cron-schedule";
import { NextResponse } from "next/server";

// Admin status endpoint for the Radar ingestion cron. Same secret-based auth as
// the cron route (RADAR_CRON_SECRET or CRON_SECRET). Returns the recent run log,
// signal totals, and the next scheduled run so an admin UI can render it.
export async function GET(req: Request) {
  const auth = authorizeRadarCronRequest(req.headers);
  if (!auth.ok) {
    if (auth.reason === "not-configured") {
      return NextResponse.json(
        { error: "RADAR_CRON_SECRET or CRON_SECRET not configured" },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { db, schema } = await import("@/db/client");
  const { desc, sql } = await import("drizzle-orm");

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "20"), 1), 100);

  const [runs, totalsRows] = await Promise.all([
    db
      .select({
        id: schema.radarFetchRun.id,
        trigger: schema.radarFetchRun.trigger,
        status: schema.radarFetchRun.status,
        sourcesCount: schema.radarFetchRun.sourcesCount,
        fetchedCount: schema.radarFetchRun.fetchedCount,
        storedCount: schema.radarFetchRun.storedCount,
        failureCount: schema.radarFetchRun.failureCount,
        failures: schema.radarFetchRun.failures,
        startedAt: schema.radarFetchRun.startedAt,
        finishedAt: schema.radarFetchRun.finishedAt,
      })
      .from(schema.radarFetchRun)
      .orderBy(desc(schema.radarFetchRun.startedAt))
      .limit(limit),
    db
      .select({
        total: sql<number>`count(*)::int`,
        today: sql<number>`count(*) filter (where ${schema.radarSignal.publishedAt} >= date_trunc('day', now()))::int`,
        newestPublishedAt: sql<Date | null>`max(${schema.radarSignal.publishedAt})`,
        lastFetchedAt: sql<Date | null>`max(${schema.radarSignal.fetchedAt})`,
      })
      .from(schema.radarSignal),
  ]);

  const totals = totalsRows[0] ?? {
    total: 0,
    today: 0,
    newestPublishedAt: null,
    lastFetchedAt: null,
  };

  const lastSuccess = runs.find((r) => r.status === "success" || r.status === "partial") ?? null;

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    schedule: RADAR_FETCH_SCHEDULE,
    nextRun: nextCronRunAfter(RADAR_FETCH_SCHEDULE).toISOString(),
    lastRunAt: runs[0]?.startedAt ?? null,
    lastSuccessAt: lastSuccess?.startedAt ?? null,
    totals,
    runs,
  });
}
