export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { isAdminSession } from "@/lib/admin-auth";
import { authorizeRadarCronRequest } from "@/lib/radar-cron-auth";
import {
  RADAR_FETCH_RUNS_PER_DAY,
  RADAR_FETCH_SCHEDULE,
  nextCronRunAfter,
} from "@/lib/radar-cron-schedule";
import {
  RADAR_DEFAULT_MAX_RESULTS_PER_SOURCE,
  RADAR_X_SOURCES,
  activeRadarSources,
  isActiveRadarSource,
} from "@/lib/radar-sources";
import { NextResponse } from "next/server";

// Admin status endpoint for the Radar ingestion cron. Authorized either by a
// logged-in admin session (cookie) or the cron secret bearer
// (RADAR_CRON_SECRET / CRON_SECRET). Returns the recent run log, signal totals,
// and the next scheduled run so the admin UI can render it.
export async function GET(req: Request) {
  const secretAuth = authorizeRadarCronRequest(req.headers);
  const authorized = secretAuth.ok || (await isAdminSession(req.headers));
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { db, schema } = await import("@/db/client");
  const { desc, sql } = await import("drizzle-orm");

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "20"), 1), 100);

  const [runs, totalsRows, sourceRows] = await Promise.all([
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
    db
      .select({
        sourceHandle: schema.radarSignal.sourceHandle,
        sourceName: sql<string | null>`max(${schema.radarSignal.sourceName})`,
        total: sql<number>`count(*)::int`,
        pulledToday: sql<number>`count(*) filter (where ${schema.radarSignal.fetchedAt} >= date_trunc('day', now()))::int`,
        newestPublishedAt: sql<Date | null>`max(${schema.radarSignal.publishedAt})`,
        lastFetchedAt: sql<Date | null>`max(${schema.radarSignal.fetchedAt})`,
      })
      .from(schema.radarSignal)
      .groupBy(schema.radarSignal.sourceHandle),
  ]);

  const totals = totalsRows[0] ?? {
    total: 0,
    today: 0,
    newestPublishedAt: null,
    lastFetchedAt: null,
  };

  const lastSuccess = runs.find((r) => r.status === "success" || r.status === "partial") ?? null;
  const sourceStats = new Map(sourceRows.map((row) => [row.sourceHandle.toLowerCase(), row]));
  const configuredHandles = new Set(RADAR_X_SOURCES.map((source) => source.handle.toLowerCase()));
  const sourceBreakdown = [
    ...RADAR_X_SOURCES.map((source) => {
      const stats = sourceStats.get(source.handle.toLowerCase());
      return {
        handle: source.handle,
        name: source.name,
        role: source.role,
        priority: source.priority,
        active: isActiveRadarSource(source.handle),
        total: stats?.total ?? 0,
        pulledToday: stats?.pulledToday ?? 0,
        newestPublishedAt: stats?.newestPublishedAt ?? null,
        lastFetchedAt: stats?.lastFetchedAt ?? null,
      };
    }),
    ...sourceRows
      .filter((row) => !configuredHandles.has(row.sourceHandle.toLowerCase()))
      .map((row) => ({
        handle: row.sourceHandle,
        name: row.sourceName ?? row.sourceHandle,
        role: "Previously ingested source",
        priority: 99,
        active: false,
        total: row.total,
        pulledToday: row.pulledToday,
        newestPublishedAt: row.newestPublishedAt,
        lastFetchedAt: row.lastFetchedAt,
      })),
  ].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      a.priority - b.priority ||
      b.total - a.total ||
      a.handle.localeCompare(b.handle),
  );

  const sourceCount = activeRadarSources().length;
  const scheduledRequestsPerRun = sourceCount;
  const scheduledRequestsPerDay = scheduledRequestsPerRun * RADAR_FETCH_RUNS_PER_DAY;

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    schedule: RADAR_FETCH_SCHEDULE,
    nextRun: nextCronRunAfter(RADAR_FETCH_SCHEDULE).toISOString(),
    lastRunAt: runs[0]?.startedAt ?? null,
    lastSuccessAt: lastSuccess?.startedAt ?? null,
    totals,
    sourceBreakdown,
    xApiUsage: {
      sourceCount,
      scheduledRunsPerDay: RADAR_FETCH_RUNS_PER_DAY,
      scheduledRequestsPerRun,
      scheduledRequestsPerDay,
      maxResultsPerSource: RADAR_DEFAULT_MAX_RESULTS_PER_SOURCE,
      maxPostReadsPerDay: scheduledRequestsPerDay * RADAR_DEFAULT_MAX_RESULTS_PER_SOURCE,
      manualRunRequests: sourceCount,
    },
    runs,
  });
}
