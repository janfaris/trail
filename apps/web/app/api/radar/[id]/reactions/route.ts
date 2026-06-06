export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import {
  type RadarReactionKind,
  emptyRadarReactionCounts,
  isRadarReactionKind,
} from "@/lib/radar-engagement";
import { and, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { loadRadarSignal } from "../_shared";

// Trail Pick reactions — GET returns per-kind counts + (if signed in) the
// viewer's own kinds; POST toggles one kind. Picks have no owner, so no
// notification is emitted.

type DbClient = Awaited<ReturnType<typeof loadRadarSignal>>["db"];
type DbSchema = Awaited<ReturnType<typeof loadRadarSignal>>["schema"];

// Authoritative post-toggle state so the client never drifts under concurrent
// toggles: counts come straight from the row totals, not an inferred delta.
async function loadReactionState(
  db: DbClient,
  schema: DbSchema,
  signalId: string,
  userId: string | null,
) {
  const counts = emptyRadarReactionCounts();
  const rows = (await db
    .select({ kind: schema.radarReaction.kind, count: sql<number>`count(*)::int` })
    .from(schema.radarReaction)
    .where(eq(schema.radarReaction.signalId, signalId))
    .groupBy(schema.radarReaction.kind)) as { kind: string; count: number }[];
  for (const row of rows) {
    if (isRadarReactionKind(row.kind)) counts[row.kind] = row.count;
  }
  let mine: RadarReactionKind[] = [];
  if (userId) {
    const mineRows = await db
      .select({ kind: schema.radarReaction.kind })
      .from(schema.radarReaction)
      .where(
        and(eq(schema.radarReaction.signalId, signalId), eq(schema.radarReaction.userId, userId)),
      );
    mine = mineRows.map((r) => r.kind).filter(isRadarReactionKind);
  }
  return { counts, mine };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, schema, signal } = await loadRadarSignal(id);
  if (!signal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { auth } = await import("@/lib/auth");
  const sess = await auth.api.getSession({ headers: _req.headers });
  const { counts, mine } = await loadReactionState(db, schema, signal.id, sess?.user?.id ?? null);
  return NextResponse.json({ counts, mine });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { auth } = await import("@/lib/auth");
  const sess = await auth.api.getSession({ headers: req.headers });
  if (!sess?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actorId = sess.user.id;

  const { limitAction, rateLimitHeaders } = await import("@/lib/rate-limit");
  const limit = await limitAction("reaction", actorId);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many reactions. Slow down for a moment." },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  let body: { kind?: unknown };
  try {
    body = (await req.json()) as { kind?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!isRadarReactionKind(body.kind)) {
    return NextResponse.json(
      { error: "kind must be 'fire' | 'eyes' | 'building'" },
      { status: 400 },
    );
  }
  const kind = body.kind;

  const { db, schema, signal } = await loadRadarSignal(id);
  if (!signal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const existing = await db
    .select({ id: schema.radarReaction.id })
    .from(schema.radarReaction)
    .where(
      and(
        eq(schema.radarReaction.signalId, signal.id),
        eq(schema.radarReaction.userId, actorId),
        eq(schema.radarReaction.kind, kind),
      ),
    )
    .limit(1);

  let action: "added" | "removed";
  const existingReaction = existing[0];
  if (existingReaction) {
    await db.delete(schema.radarReaction).where(eq(schema.radarReaction.id, existingReaction.id));
    action = "removed";
  } else {
    await db
      .insert(schema.radarReaction)
      .values({ id: crypto.randomUUID(), signalId: signal.id, userId: actorId, kind })
      .onConflictDoNothing({
        target: [
          schema.radarReaction.signalId,
          schema.radarReaction.userId,
          schema.radarReaction.kind,
        ],
      });
    action = "added";
  }

  const { counts, mine } = await loadReactionState(db, schema, signal.id, actorId);
  return NextResponse.json({ ok: true, action, counts, mine });
}
