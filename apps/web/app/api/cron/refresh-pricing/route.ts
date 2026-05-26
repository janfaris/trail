/**
 * Daily price-refresh cron (Task 1.4 — cost-per-PR pivot).
 *
 * Schedule: 04:00 UTC daily (see vercel.json). Job is the "freshness heartbeat"
 * for the modelPrice reference table: it touches every currently-active row
 * (effectiveTo IS NULL) by bumping its createdAt to now() so we can tell at a
 * glance which snapshots have been verified recently vs left to rot.
 *
 * v1 deliberately does NOT scrape vendor pricing pages — scraping is fragile
 * and a broken parser silently writing wrong rates is strictly worse than
 * stale-but-correct prices. The touch-only pass costs us nothing and gives
 * ops a "last verified" signal.
 *
 * TODO(future): Replace the touch-only pass with a real refresh that fetches
 *   - https://www.anthropic.com/pricing
 *   - https://openai.com/api/pricing/
 *   - https://www.cursor.com/pricing
 *   - https://github.com/features/copilot
 * and reconciles each (vendor, modelId) against the active row. Critically,
 * any actual price change must INSERT a new modelPrice row with
 * effectiveFrom = now() and UPDATE the previously-active row to set
 * effectiveTo = now() — i.e. immutable snapshot semantics, so historical
 * receipts that point at the old (vendor, modelId, effectiveFrom) keep
 * resolving to the price that was live when the session ran. Never mutate
 * inUsdPerMtok / outUsdPerMtok on an existing row.
 */
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, isNull, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";

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

  const activeRows = await db
    .select({ id: schema.modelPrice.id })
    .from(schema.modelPrice)
    .where(isNull(schema.modelPrice.effectiveTo));

  const now = new Date();
  let refreshed = 0;
  for (const row of activeRows) {
    await db
      .update(schema.modelPrice)
      .set({ createdAt: now })
      .where(
        and(
          eq(schema.modelPrice.id, row.id),
          isNull(schema.modelPrice.effectiveTo),
        ),
      );
    refreshed += 1;
  }

  console.log(
    `[cron/refresh-pricing] touched ${refreshed} active modelPrice rows`,
  );

  return NextResponse.json({
    ok: true,
    refreshed,
    mode: "touch-only",
    note: "live scraping not yet implemented — see TODO",
  });
}
