import { randomUUID } from "node:crypto";
import type { RadarFetchRunFailure } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  buildRadarSignalWrite,
  radarSignalUpdateValues,
  trimRadarFailureMessage,
} from "./radar-ingestion";
import { RADAR_DEFAULT_MAX_RESULTS_PER_SOURCE, type RadarSource } from "./radar-sources";
import { RadarXApiError, defaultRadarSources, fetchRadarTweetsForSource } from "./radar-x-api";

type DbClient = typeof import("@/db/client").db;
type DbSchema = typeof import("@/db/client").schema;

type RadarFetchRunStatus = "success" | "partial" | "failure";

export type RunRadarCronIngestionOptions = {
  db: DbClient;
  schema: DbSchema;
  bearerToken: string;
  sources?: RadarSource[];
  limit?: number;
  pauseMs?: number;
  trigger?: string;
  apiBaseUrl?: string;
};

export type RadarCronIngestionResult = {
  runId: string;
  status: RadarFetchRunStatus;
  sourcesCount: number;
  sourcesAttempted: number;
  fetchedCount: number;
  storedCount: number;
  failureCount: number;
  failures: RadarFetchRunFailure[];
  durationMs: number;
};

const DEFAULT_PAUSE_MS = 1100;
const MAX_STORED_FAILURES = 12;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function boundedLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return RADAR_DEFAULT_MAX_RESULTS_PER_SOURCE;
  return Math.min(Math.max(Math.floor(value ?? RADAR_DEFAULT_MAX_RESULTS_PER_SOURCE), 10), 100);
}

function boundedPauseMs(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_PAUSE_MS;
  return Math.min(Math.max(Math.floor(value ?? DEFAULT_PAUSE_MS), 0), 10_000);
}

function failureFromError(source: RadarSource, error: unknown): RadarFetchRunFailure {
  const failure: RadarFetchRunFailure = {
    sourceHandle: source.handle,
    message: trimRadarFailureMessage(error),
  };
  if (error instanceof RadarXApiError) {
    failure.status = error.status;
    if (typeof error.retryAfterSeconds === "number") {
      failure.retryAfterSeconds = error.retryAfterSeconds;
    }
  }
  return failure;
}

function shouldStopAfterFailure(failure: RadarFetchRunFailure): boolean {
  return failure.status === 401 || failure.status === 403 || failure.status === 429;
}

function completedStatus(
  failures: RadarFetchRunFailure[],
  fetchedCount: number,
  storedCount: number,
): RadarFetchRunStatus {
  if (failures.length === 0) return "success";
  return fetchedCount > 0 || storedCount > 0 ? "partial" : "failure";
}

export async function runRadarCronIngestion({
  db,
  schema,
  bearerToken,
  sources = defaultRadarSources(),
  limit,
  pauseMs,
  trigger = "cron",
  apiBaseUrl,
}: RunRadarCronIngestionOptions): Promise<RadarCronIngestionResult> {
  const startedAt = new Date();
  const runId = `radar_${startedAt.toISOString().replace(/[-:.TZ]/g, "")}_${randomUUID()}`;
  const fetchLimit = boundedLimit(limit);
  const sourcePauseMs = boundedPauseMs(pauseMs);

  await db.insert(schema.radarFetchRun).values({
    id: runId,
    source: "x",
    trigger,
    status: "running",
    sourcesCount: sources.length,
    startedAt,
    updatedAt: startedAt,
  });

  let sourcesAttempted = 0;
  let fetchedCount = 0;
  let storedCount = 0;
  const failures: RadarFetchRunFailure[] = [];

  for (const [index, source] of sources.entries()) {
    sourcesAttempted += 1;
    try {
      const result = await fetchRadarTweetsForSource({
        bearerToken,
        source,
        limit: fetchLimit,
        apiBaseUrl,
      });
      fetchedCount += result.tweets.length;

      for (const tweet of result.tweets) {
        const values = buildRadarSignalWrite(source, tweet);
        await db
          .insert(schema.radarSignal)
          .values(values)
          .onConflictDoUpdate({
            target: schema.radarSignal.id,
            set: radarSignalUpdateValues(values),
          });
        storedCount += 1;
      }
    } catch (error) {
      const failure = failureFromError(source, error);
      failures.push(failure);
      console.error(`[cron/radar/fetch] @${source.handle} failed: ${failure.message}`);
      if (shouldStopAfterFailure(failure)) break;
    }

    if (index < sources.length - 1 && sourcePauseMs > 0) {
      await sleep(sourcePauseMs);
    }
  }

  const finishedAt = new Date();
  const storedFailures = failures.slice(0, MAX_STORED_FAILURES);
  const status = completedStatus(failures, fetchedCount, storedCount);
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  await db
    .update(schema.radarFetchRun)
    .set({
      status,
      fetchedCount,
      storedCount,
      failureCount: failures.length,
      failures: storedFailures,
      finishedAt,
      updatedAt: finishedAt,
    })
    .where(eq(schema.radarFetchRun.id, runId));

  return {
    runId,
    status,
    sourcesCount: sources.length,
    sourcesAttempted,
    fetchedCount,
    storedCount,
    failureCount: failures.length,
    failures: storedFailures,
    durationMs,
  };
}
