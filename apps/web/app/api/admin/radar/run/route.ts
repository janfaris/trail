export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

import { isAdminSession } from "@/lib/admin-auth";
import { authorizeRadarCronRequest } from "@/lib/radar-cron-auth";
import { NextResponse } from "next/server";

function numberParam(url: URL, name: string, fallback: number, min: number, max: number): number {
  const raw = url.searchParams.get(name);
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

// Admin-triggered manual Radar fetch. Authorized by a logged-in admin session
// (cookie) or the cron secret bearer. Reuses the same ingestion path as the
// scheduled cron, tagged trigger=manual-admin.
export async function POST(req: Request) {
  const secretAuth = authorizeRadarCronRequest(req.headers);
  const authorized = secretAuth.ok || (await isAdminSession(req.headers));
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const bearerToken = process.env.X_BEARER_TOKEN;
  if (!bearerToken) {
    return NextResponse.json({ error: "X_BEARER_TOKEN not configured" }, { status: 500 });
  }

  const url = new URL(req.url);
  const limit = numberParam(url, "limit", 20, 10, 100);
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
    trigger: "manual-admin",
    apiBaseUrl: process.env.RADAR_X_API_BASE_URL,
  });

  console.log(
    `[admin/radar/run] run=${result.runId} status=${result.status} ` +
      `sources=${result.sourcesAttempted}/${result.sourcesCount} ` +
      `fetched=${result.fetchedCount} stored=${result.storedCount} ` +
      `failures=${result.failureCount} durationMs=${result.durationMs}`,
  );

  return NextResponse.json(
    { ok: result.status !== "failure", ...result },
    { status: result.status === "failure" ? 502 : 200 },
  );
}
