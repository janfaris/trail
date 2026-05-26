// Task 2.4 — cost-per-PR pivot. Hourly cron that drives the vendor-sync
// worker. Mirrors apps/web/app/api/cron/refresh-pricing/route.ts for
// auth + response shape: Bearer CRON_SECRET; 200 JSON on success; 401 on
// missing/wrong secret; 500 if CRON_SECRET isn't configured.
//
// maxDuration is 300s because a worst-case run could touch up to
// PER_RUN_CONNECTION_CAP (50) connections, each making one paginated API
// call. Vercel Pro is required for maxDuration > 60.

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { syncAllPending } from "@/lib/vendor-sync/sync-worker";

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

  const { runs, totalDuration } = await syncAllPending();

  console.log(
    `[cron/vendor-sync] processed ${runs.length} connections in ${totalDuration}ms`,
  );

  return NextResponse.json({
    ok: true,
    runs,
    totalDuration,
  });
}
