// User-facing "Run sync now" endpoint. Authed via BetterAuth session
// (NOT CRON_SECRET) — scoped strictly to the calling user's connections.
//
// Why this exists: the hourly /api/cron/vendor-sync only fires at :15. After
// a user pastes their first admin key, waiting up to 59 minutes for the first
// data point is dreadful UX. This endpoint fans out to syncOneConnection for
// the user's connections and returns a per-connection report.
//
// Rate limit: in-memory 1 request per user per 30 seconds. Vendor APIs
// rate-limit aggressively (Anthropic 429s at ~50 RPM org-wide) so we cap
// this defensively.

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq, and, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { syncOneConnection, type SyncResult } from "@/lib/vendor-sync/sync-worker";

const RECENT: Map<string, number> = new Map();
const COOLDOWN_MS = 30_000;

export async function POST() {
  let sess: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    sess = await auth.api.getSession({ headers: await headers() });
  } catch {
    sess = null;
  }
  if (!sess?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = sess.user.id;

  // Per-user cooldown — prevents accidental rapid-fire from a user mashing the
  // button or running the same fetch in multiple tabs.
  const last = RECENT.get(userId);
  if (last && Date.now() - last < COOLDOWN_MS) {
    const secs = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 1000);
    return NextResponse.json(
      { error: "cooldown", message: `Wait ${secs}s before syncing again.` },
      { status: 429 },
    );
  }
  RECENT.set(userId, Date.now());

  // Only the connections OWNED by this user. We do NOT touch auth_error rows
  // (re-syncing those would just 401 the vendor again until the user updates
  // the key); the user must hit POST /api/connections/[vendor] with a fresh
  // key first.
  const connections = await db
    .select()
    .from(schema.vendorConnection)
    .where(
      and(
        eq(schema.vendorConnection.userId, userId),
        inArray(schema.vendorConnection.syncStatus, ["ok", "pending", "rate_limited"]),
      ),
    );

  if (connections.length === 0) {
    return NextResponse.json({
      ok: true,
      runs: [],
      message: "No syncable connections. Add a vendor first.",
    });
  }

  const t0 = Date.now();
  const runs: SyncResult[] = [];
  for (const conn of connections) {
    try {
      const r = await syncOneConnection(conn);
      runs.push(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      runs.push({
        connectionId: conn.id,
        vendor: conn.vendor,
        status: "error",
        rowsInserted: 0,
        rowsSkipped: 0,
        errorMessage: msg,
      });
    }
  }
  const totalDuration = Date.now() - t0;

  return NextResponse.json({ ok: true, runs, totalDuration });
}
