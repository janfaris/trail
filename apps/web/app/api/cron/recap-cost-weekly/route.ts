/**
 * Cost-Weekly Recap cron — Week 5 cost-per-PR pivot.
 *
 * Schedule: Mondays 09:00 UTC (Vercel cron, see vercel.json). For each user
 * who shipped at least one PR in the previous Mon→Sun week AND has at least
 * one session_cost_attribution row tied to those PRs, upserts a Recap of
 * tier='cost-weekly'.
 *
 * Window: half-open [previousMonday 00:00 UTC, previousMonday + 7d 00:00 UTC).
 * Mirrors /api/cron/recap-weekly's interval convention so adjacent windows
 * never double-count an edge-second.
 *
 * Identity check: receipt-time-anchored — we discover candidate users by
 * joining session_cost_attribution to trail_session and filtering by
 * trail_session.receiptVerifiedAt (when the linked commit was confirmed on
 * the default branch). attribution.attributedAt would drift as the engine
 * re-runs; receipt time is canonical.
 *
 * Idempotency: keyed on (userId, tier='cost-weekly', windowStart). Re-runs
 * regenerate the payload + one-liner.
 *
 * Privacy: visibility defaults to 'private'. The user explicitly publishes
 * from the UI. The public /r/[slug] renderer guards out cost-* tiers as
 * belt-and-suspenders, but the default visibility keeps belt + suspenders.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { and, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { aggregateCost } from "@/lib/recap/cost-aggregate";
import { generateOneLiner } from "@/lib/recap/one-liner";

function newSlug(): string {
  return randomBytes(6).toString("base64url").slice(0, 9).toLowerCase();
}

// Bounded concurrency for the per-user pipeline (aggregate + LLM + UPSERT).
// 8 gives ~8× throughput vs sequential while staying well under Neon's
// connection cap and the AI provider's per-key RPM ceiling.
const CONCURRENCY = 8;
// Per-run hard cap so a 10× growth in shipping users doesn't blow past
// maxDuration. The UPSERT is idempotent — the next cron tick picks up
// whatever didn't fit. Sized to leave headroom inside maxDuration=300s
// at the worst-case ~2s/user we observed in early profiling.
const MAX_USERS_PER_RUN = 500;

/** Last Monday 00:00 UTC, exclusive of today if today is Monday. */
function previousMondayUtc(now: Date): Date {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dayOfWeek = d.getUTCDay() || 7; // 1..7, Monday=1
  // Move back to most recent Monday, then one more week if today IS Monday
  // (so we always recap a complete window).
  const daysBack = dayOfWeek === 1 ? 7 : dayOfWeek - 1;
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d;
}

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

interface RunResult {
  userId: string;
  handle: string | null;
  shippedPrCount: number;
  totalCostUsd: number;
  recapId: string;
  slug: string;
  created: boolean;
  oneLinerWarnings?: string[];
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const authz = req.headers.get("authorization") ?? "";
  if (authz !== `Bearer ${secret}`) return unauthorized();

  const now = new Date();
  const windowStart = previousMondayUtc(now);
  const windowEnd = new Date(windowStart);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 7);

  // Discover candidate users: distinct userIds from session_cost_attribution
  // joined to trail_session where the source session's receiptVerifiedAt is
  // in [windowStart, windowEnd) AND the session has a linkedPrUrl set.
  // Receipt-time anchored on purpose; the linkedPrUrl filter matches the
  // aggregator's slice (see BLOCKER 1 in the Week 5 review) so we don't run
  // aggregateCost for users whose only "shipped" rows lost their PR link.
  const candidateRows = await db
    .selectDistinct({ userId: schema.sessionCostAttribution.userId })
    .from(schema.sessionCostAttribution)
    .innerJoin(
      schema.trailSession,
      eq(schema.sessionCostAttribution.sessionId, schema.trailSession.id),
    )
    .where(
      and(
        gte(schema.trailSession.receiptVerifiedAt, windowStart),
        lt(schema.trailSession.receiptVerifiedAt, windowEnd),
        isNotNull(schema.trailSession.linkedPrUrl),
      ),
    );

  const allUserIds = candidateRows.map((r) => r.userId);
  const cappedAtLimit = allUserIds.length > MAX_USERS_PER_RUN;
  const userIds = cappedAtLimit
    ? allUserIds.slice(0, MAX_USERS_PER_RUN)
    : allUserIds;

  // Batch the user→handle lookup once instead of N times inside the loop.
  const handleMap = new Map<string, string | null>();
  if (userIds.length > 0) {
    const userRows = await db
      .select({ id: schema.user.id, handle: schema.user.handle })
      .from(schema.user)
      .where(inArray(schema.user.id, userIds));
    for (const u of userRows) handleMap.set(u.id, u.handle ?? null);
  }

  const results: RunResult[] = [];
  const errors: Array<{ userId: string; error: string }> = [];

  async function processUser(userId: string): Promise<void> {
    const payload = await aggregateCost({
      userId,
      windowStart,
      windowEnd,
      tier: "cost-weekly",
    });

    // Defensive: pre-filter already drops users with no shipped+attributed
    // sessions in the window. This catches the corner where every row had
    // cost <= 0 (so the aggregator dropped them) or where attribution rows
    // exist but no PR link survived BLOCKER 1's filter.
    if (payload.metrics.shippedPrCount < 1) return;

    const oneLiner = await generateOneLiner({ payload });

    // Idempotency: look up by (userId, tier, windowStart).
    const existing = await db.query.recap.findFirst({
      where: and(
        eq(schema.recap.userId, userId),
        eq(schema.recap.tier, "cost-weekly"),
        eq(schema.recap.windowStart, windowStart),
      ),
    });

    if (existing) {
      await db
        .update(schema.recap)
        .set({
          payload,
          oneLiner: oneLiner.text,
          oneLinerValidatorWarnings:
            oneLiner.warnings.length > 0 ? oneLiner.warnings : null,
          updatedAt: new Date(),
        })
        .where(eq(schema.recap.id, existing.id));

      results.push({
        userId,
        handle: handleMap.get(userId) ?? null,
        shippedPrCount: payload.metrics.shippedPrCount,
        totalCostUsd: payload.metrics.totalCostUsd,
        recapId: existing.id,
        slug: existing.slug,
        created: false,
        oneLinerWarnings: oneLiner.warnings,
      });
      return;
    }

    // Fresh insert. Slug collision retry.
    let slug = newSlug();
    for (let i = 0; i < 5; i++) {
      const taken = await db.query.recap.findFirst({
        where: eq(schema.recap.slug, slug),
        columns: { id: true },
      });
      if (!taken) break;
      slug = newSlug();
    }

    const id = randomBytes(12).toString("base64url");
    await db.insert(schema.recap).values({
      id,
      userId,
      tier: "cost-weekly",
      slug,
      sessionId: null,
      windowStart,
      windowEnd,
      payload,
      oneLiner: oneLiner.text,
      oneLinerValidatorWarnings:
        oneLiner.warnings.length > 0 ? oneLiner.warnings : null,
      visibility: "private",
      sharedAt: null,
    });

    results.push({
      userId,
      handle: handleMap.get(userId) ?? null,
      shippedPrCount: payload.metrics.shippedPrCount,
      totalCostUsd: payload.metrics.totalCostUsd,
      recapId: id,
      slug,
      created: true,
      oneLinerWarnings: oneLiner.warnings,
    });
  }

  // Bounded-concurrency worker pool. No external deps — each worker pulls
  // the next userId off a shared queue until exhausted. Errors are recorded
  // per-user; one bad user does not poison the run.
  const queue = [...userIds];
  const workers = Array(CONCURRENCY)
    .fill(0)
    .map(async () => {
      while (queue.length > 0) {
        const userId = queue.shift();
        if (!userId) return;
        try {
          await processUser(userId);
        } catch (err) {
          errors.push({
            userId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    });
  await Promise.all(workers);

  return NextResponse.json({
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    usersConsidered: userIds.length,
    usersDeferred: cappedAtLimit ? allUserIds.length - userIds.length : 0,
    cappedAtLimit,
    recapsWritten: results.length,
    recaps: results,
    errors,
  });
}
