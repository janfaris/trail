export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db/client";
import { eq, asc } from "drizzle-orm";
import { anonymize } from "@trail/anonymize";
import type { EventData } from "@/components/timeline-event";

// Phase 0.8 — replay the expanded detectors against existing trails.
//
// Modes:
//   GET                — dry-run: lists every session whose events change when
//                        re-anonymized; reports redaction counts + suspects.
//                        Owner-auth via CRON_SECRET.
//   POST {apply:true}  — actually rewrites event.data + bumps redactedAt.
//
// Idempotent: anonymize() is. So re-running this is safe.

type SessionLite = {
  id: string;
  slug: string;
  userId: string;
  visibility: string;
};

interface DiffEntry {
  sessionId: string;
  slug: string;
  visibility: string;
  newRedactions: Record<string, number>;
  newSuspects: number;
  eventsTouched: number;
}

async function diffSessions(limit: number): Promise<DiffEntry[]> {
  const sessions = (await db
    .select({
      id: schema.trailSession.id,
      slug: schema.trailSession.slug,
      userId: schema.trailSession.userId,
      visibility: schema.trailSession.visibility,
    })
    .from(schema.trailSession)
    .limit(limit)) as SessionLite[];

  const out: DiffEntry[] = [];
  for (const sess of sessions) {
    const events = await db
      .select()
      .from(schema.event)
      .where(eq(schema.event.sessionId, sess.id))
      .orderBy(asc(schema.event.idx));
    if (events.length === 0) continue;

    // Re-build the @trail/schema Session object from stored events.
    // The anonymize() entry point validates against the schema, so we
    // construct it with the data the DB has.
    const fakeSession = {
      id: sess.id,
      user: "u",
      tool: "claude-code" as const,
      startedAt: new Date(0).toISOString(),
      events: events.map((e) => e.data as EventData),
    };

    const before = JSON.stringify(fakeSession.events);
    let scrubbed, report;
    try {
      const r = anonymize(fakeSession as Parameters<typeof anonymize>[0]);
      scrubbed = r.session;
      report = r.report;
    } catch {
      // Event data shape we can't validate — skip.
      continue;
    }
    const after = JSON.stringify(scrubbed.events);
    if (before === after && report.suspects.length === 0) continue;

    const newCategories: Record<string, number> = {};
    for (const [k, v] of Object.entries(report.byCategory) as [string, number][]) {
      if (v > 0) newCategories[k] = v;
    }

    out.push({
      sessionId: sess.id,
      slug: sess.slug,
      visibility: sess.visibility,
      newRedactions: newCategories,
      newSuspects: report.suspects.length,
      eventsTouched: events.length,
    });
  }
  return out;
}

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized();
  const url = new URL(req.url);
  const limit = Math.min(500, Number(url.searchParams.get("limit") ?? "100"));
  const diffs = await diffSessions(limit);
  return NextResponse.json({
    mode: "dry-run",
    scanned: limit,
    affected: diffs.length,
    diffs,
  });
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized();
  let body: { apply?: boolean; limit?: number; flagSuspectsToPending?: boolean };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (!body.apply) {
    return NextResponse.json(
      { error: "POST requires {apply: true}; use GET for dry-run" },
      { status: 400 },
    );
  }

  const limit = Math.min(500, body.limit ?? 100);
  const flagSuspectsToPending = body.flagSuspectsToPending !== false; // default true

  const diffs = await diffSessions(limit);
  let appliedSessions = 0;
  let appliedEvents = 0;
  let movedToPending = 0;

  for (const d of diffs) {
    const events = await db
      .select()
      .from(schema.event)
      .where(eq(schema.event.sessionId, d.sessionId))
      .orderBy(asc(schema.event.idx));

    const fakeSession = {
      id: d.sessionId,
      user: "u",
      tool: "claude-code" as const,
      startedAt: new Date(0).toISOString(),
      events: events.map((e) => e.data as EventData),
    };
    let scrubbed;
    try {
      scrubbed = anonymize(fakeSession as Parameters<typeof anonymize>[0]).session;
    } catch {
      continue;
    }

    // Rewrite each event whose data changed.
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!;
      const orig = JSON.stringify(e.data);
      const fresh = JSON.stringify(scrubbed.events[i]);
      if (orig === fresh) continue;
      await db
        .update(schema.event)
        .set({ data: scrubbed.events[i] as Record<string, unknown> })
        .where(eq(schema.event.id, e.id));
      appliedEvents += 1;
    }
    appliedSessions += 1;

    const updates: Record<string, unknown> = { redactedAt: new Date() };
    if (
      flagSuspectsToPending &&
      d.newSuspects > 0 &&
      d.visibility === "public"
    ) {
      updates.visibility = "pending";
      updates.pendingReviewReasons = [
        `backfill: entropy guard found ${d.newSuspects} suspicious token(s)`,
      ];
      movedToPending += 1;
    }
    await db
      .update(schema.trailSession)
      .set(updates)
      .where(eq(schema.trailSession.id, d.sessionId));
  }

  return NextResponse.json({
    mode: "apply",
    scanned: limit,
    affectedSessions: diffs.length,
    appliedSessions,
    appliedEvents,
    movedToPending,
  });
}
