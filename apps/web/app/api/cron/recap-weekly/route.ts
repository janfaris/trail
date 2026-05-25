/**
 * Weekly Recap cron.
 *
 * Schedule: Mondays 09:00 UTC (Vercel cron). For each user with shipped
 * sessions in the previous 7-day window, upserts a Recap row of tier='weekly'.
 *
 * Idempotency: keyed on (userId, tier, windowStart). Re-runs in the same week
 * regenerate (refresh the payload + one-liner).
 *
 * Privacy: visibility defaults to 'private'. The user explicitly publishes from
 * the UI before anything is shared.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { and, eq, gte, lt, ne } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { aggregate, type SessionInput } from "@/lib/recap/aggregate";
import { generateOneLiner } from "@/lib/recap/one-liner";

function newSlug(): string {
  return randomBytes(6).toString("base64url").slice(0, 9).toLowerCase();
}

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
  sessionCount: number;
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

  // Pull all sessions in the window that have *any* signal — outcome set,
  // receipt status, or just non-trivial activity. We don't materialize empty
  // recaps; if the user did nothing this week, no recap row is created.
  const sessions = await db
    .select({
      id: schema.trailSession.id,
      slug: schema.trailSession.slug,
      title: schema.trailSession.title,
      summary: schema.trailSession.summary,
      userId: schema.trailSession.userId,
      startedAt: schema.trailSession.startedAt,
      endedAt: schema.trailSession.endedAt,
      durationSeconds: schema.trailSession.durationSeconds,
      models: schema.trailSession.models,
      toolsUsed: schema.trailSession.toolsUsed,
      frameworks: schema.trailSession.frameworks,
      taskType: schema.trailSession.taskType,
      outcome: schema.trailSession.outcome,
      linkedRepo: schema.trailSession.linkedRepo,
      linkedCommitSha: schema.trailSession.linkedCommitSha,
      receiptStatus: schema.trailSession.receiptStatus,
      promptCount: schema.trailSession.promptCount,
      distinctFiles: schema.trailSession.distinctFiles,
      failedToolCalls: schema.trailSession.failedToolCalls,
    })
    .from(schema.trailSession)
    .where(
      and(
        gte(schema.trailSession.startedAt, windowStart),
        lt(schema.trailSession.startedAt, windowEnd),
        // Skip non-public AND non-pending visibilities — but weekly recaps
        // are private by default anyway, so include everything the user owns.
        ne(schema.trailSession.visibility, "redacted"),
      ),
    );

  // Group by user
  const byUser = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const list = byUser.get(s.userId) ?? [];
    list.push(s);
    byUser.set(s.userId, list);
  }

  const results: RunResult[] = [];
  const errors: Array<{ userId: string; error: string }> = [];

  for (const [userId, userSessions] of byUser) {
    try {
      // Skip users with <2 sessions — a "weekly" of one shipped thing is
      // already covered by the Pulse recap.
      if (userSessions.length < 2) continue;

      const inputs: SessionInput[] = userSessions.map((s) => ({
        id: s.id,
        slug: s.slug,
        title: s.title,
        summary: s.summary,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationSeconds: s.durationSeconds,
        models: s.models,
        toolsUsed: s.toolsUsed,
        frameworks: s.frameworks,
        taskType: s.taskType,
        outcome: s.outcome,
        linkedRepo: s.linkedRepo,
        linkedCommitSha: s.linkedCommitSha,
        receiptStatus: s.receiptStatus,
        promptCount: s.promptCount,
        distinctFiles: s.distinctFiles,
        failedToolCalls: s.failedToolCalls,
      }));

      const payload = aggregate(inputs, {
        tier: "weekly",
        windowStart,
        windowEnd,
      });

      // Skip if nothing shipped — a "0 shipped" weekly is not worth the noise.
      if (payload.shippedCount === 0) continue;

      const oneLiner = await generateOneLiner({ payload });

      // Idempotency: look up by (userId, tier, windowStart)
      const existing = await db.query.recap.findFirst({
        where: and(
          eq(schema.recap.userId, userId),
          eq(schema.recap.tier, "weekly"),
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

        const owner = await db.query.user.findFirst({
          where: eq(schema.user.id, userId),
          columns: { handle: true },
        });
        results.push({
          userId,
          handle: owner?.handle ?? null,
          sessionCount: userSessions.length,
          recapId: existing.id,
          slug: existing.slug,
          created: false,
          oneLinerWarnings: oneLiner.warnings,
        });
        continue;
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
        tier: "weekly",
        slug,
        sessionId: null,
        windowStart,
        windowEnd,
        payload,
        oneLiner: oneLiner.text,
        oneLinerValidatorWarnings:
          oneLiner.warnings.length > 0 ? oneLiner.warnings : null,
        visibility: "private", // user opts in via UI
        sharedAt: null,
      });

      const owner = await db.query.user.findFirst({
        where: eq(schema.user.id, userId),
        columns: { handle: true },
      });
      results.push({
        userId,
        handle: owner?.handle ?? null,
        sessionCount: userSessions.length,
        recapId: id,
        slug,
        created: true,
        oneLinerWarnings: oneLiner.warnings,
      });
    } catch (err) {
      errors.push({
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    usersConsidered: byUser.size,
    recapsWritten: results.length,
    recaps: results,
    errors,
  });
}
