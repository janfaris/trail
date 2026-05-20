export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { eq, asc } from "drizzle-orm";
import { isLikelyToolResultEcho } from "../../../u/[user]/[slug]/fork/route";
import type { EventData } from "@/components/timeline-event";

// Phase 0 follow-up — drop tool_result-shaped events that the pre-fix
// claude-code parser mis-classified as user prompts. These poison /fork,
// recipes, and search.
//
// GET   → dry-run: lists every session with poisoned prompt events, counts.
// POST {apply:true} → deletes the poisoned event rows + invalidates the
//                     stored recipe key-prompt indexes (they'll be regenerated
//                     on next view).
//
// Idempotent. Owner auth via CRON_SECRET.

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type Diff = {
  sessionId: string;
  slug: string;
  tool: string;
  totalEvents: number;
  poisonedEventIds: string[];
  poisonedIdxs: number[];
};

async function scan(limit: number): Promise<Diff[]> {
  const sessions = await db
    .select({
      id: schema.trailSession.id,
      slug: schema.trailSession.slug,
      tool: schema.trailSession.tool,
    })
    .from(schema.trailSession)
    .limit(limit);

  const out: Diff[] = [];
  for (const s of sessions) {
    const events = await db
      .select({
        id: schema.event.id,
        idx: schema.event.idx,
        data: schema.event.data,
      })
      .from(schema.event)
      .where(eq(schema.event.sessionId, s.id))
      .orderBy(asc(schema.event.idx));

    const poisoned = events.filter((e) => {
      const d = e.data as EventData;
      if (d.kind !== "prompt") return false;
      return isLikelyToolResultEcho(d.text);
    });
    if (poisoned.length === 0) continue;

    out.push({
      sessionId: s.id,
      slug: s.slug,
      tool: s.tool,
      totalEvents: events.length,
      poisonedEventIds: poisoned.map((p) => p.id),
      poisonedIdxs: poisoned.map((p) => p.idx),
    });
  }
  return out;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const limit = Math.min(
    500,
    Number(req.nextUrl.searchParams.get("limit") ?? "200"),
  );
  const diffs = await scan(limit);
  const totalPoisoned = diffs.reduce(
    (a, d) => a + d.poisonedEventIds.length,
    0,
  );
  return NextResponse.json({
    mode: "dry-run",
    scanned: limit,
    affectedSessions: diffs.length,
    totalPoisonedEvents: totalPoisoned,
    diffs,
  });
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { apply?: boolean; limit?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  if (!body.apply) {
    return NextResponse.json(
      { error: "POST requires {apply: true}; use GET for dry-run" },
      { status: 400 },
    );
  }
  const limit = Math.min(500, body.limit ?? 200);
  const diffs = await scan(limit);
  let deletedEvents = 0;
  let touchedSessions = 0;

  for (const d of diffs) {
    // Delete poisoned events one by one. Could do this in a single IN
    // clause, but the loop keeps memory tiny and the row count small.
    for (const eventId of d.poisonedEventIds) {
      await db.delete(schema.event).where(eq(schema.event.id, eventId));
      deletedEvents += 1;
    }
    // Invalidate stored recipe — the key-prompt indexes still point at
    // (now stale) idx positions, and prompt_count is one component of
    // recipe quality. Setting these to null forces a regen on next view.
    await db
      .update(schema.trailSession)
      .set({
        recipeKeyPromptIdxs: null,
        recipeGeneratedAt: null,
        recipeTldr: null,
        recipeOutcome: null,
      })
      .where(eq(schema.trailSession.id, d.sessionId));
    touchedSessions += 1;
  }

  return NextResponse.json({
    mode: "apply",
    scanned: limit,
    affectedSessions: diffs.length,
    touchedSessions,
    deletedEvents,
  });
}
