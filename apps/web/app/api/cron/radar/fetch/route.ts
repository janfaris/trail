export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

import { authorizeRadarCronRequest } from "@/lib/radar-cron-auth";
import { RADAR_DEFAULT_MAX_RESULTS_PER_SOURCE } from "@/lib/radar-sources";
import { NextResponse } from "next/server";

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function numberParam(url: URL, name: string, fallback: number, min: number, max: number): number {
  const raw = url.searchParams.get(name);
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

export async function GET(req: Request) {
  const auth = authorizeRadarCronRequest(req.headers);
  if (!auth.ok) {
    if (auth.reason === "not-configured") {
      return NextResponse.json(
        { error: "RADAR_CRON_SECRET or CRON_SECRET not configured" },
        { status: 500 },
      );
    }
    console.warn("[cron/radar/fetch] unauthorized request rejected");
    return unauthorized();
  }

  const bearerToken = process.env.X_BEARER_TOKEN;
  if (!bearerToken) {
    return NextResponse.json({ error: "X_BEARER_TOKEN not configured" }, { status: 500 });
  }

  const url = new URL(req.url);
  const limit = numberParam(url, "limit", RADAR_DEFAULT_MAX_RESULTS_PER_SOURCE, 10, 100);
  const pauseMs = numberParam(url, "pauseMs", 1100, 0, 10_000);

  const [{ db, schema }, { runRadarCronIngestion }] = await Promise.all([
    import("@/db/client"),
    import("@/lib/radar-cron"),
  ]);
  const result = await runRadarCronIngestion({
    db,
    schema,
    bearerToken,
    limit,
    pauseMs,
    apiBaseUrl: process.env.RADAR_X_API_BASE_URL,
  });

  console.log(
    `[cron/radar/fetch] run=${result.runId} status=${result.status} ` +
      `sources=${result.sourcesAttempted}/${result.sourcesCount} ` +
      `fetched=${result.fetchedCount} stored=${result.storedCount} ` +
      `failures=${result.failureCount} durationMs=${result.durationMs}`,
  );

  return NextResponse.json(
    {
      ok: result.status !== "failure",
      ...result,
    },
    { status: result.status === "failure" ? 502 : 200 },
  );
}
