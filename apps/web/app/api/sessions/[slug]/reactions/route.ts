export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

// Phase 1.6 — session reactions ("worked" / "needs-tweak" / "broken").
// GET   → public counts per kind + (if logged in) which kinds the viewer set.
// POST  → toggle one kind. Body: {kind, note?}. Idempotent: posting an
//          already-set kind removes it.

const KIND_RE = /^(worked|needs-tweak|broken)$/;

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const row = await db.query.trailSession.findFirst({
    where: eq(schema.trailSession.slug, slug),
  });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const counts = (await db
    .select({
      kind: schema.sessionReaction.kind,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.sessionReaction)
    .where(eq(schema.sessionReaction.sessionId, row.id))
    .groupBy(schema.sessionReaction.kind)) as { kind: string; count: number }[];

  const sess = await auth.api.getSession({ headers: req.headers });
  let mine: string[] = [];
  if (sess?.user) {
    const rows = await db
      .select({ kind: schema.sessionReaction.kind })
      .from(schema.sessionReaction)
      .where(
        and(
          eq(schema.sessionReaction.sessionId, row.id),
          eq(schema.sessionReaction.userId, sess.user.id),
        ),
      );
    mine = rows.map((r) => r.kind);
  }
  return NextResponse.json({ counts, mine });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sess = await auth.api.getSession({ headers: await headers() });
  if (!sess?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const actorId = sess.user.id;
  let body: { kind?: string; note?: string };
  try {
    body = (await req.json()) as { kind?: string; note?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.kind || !KIND_RE.test(body.kind)) {
    return NextResponse.json(
      { error: "kind must be 'worked' | 'needs-tweak' | 'broken'" },
      { status: 400 },
    );
  }

  const row = await db.query.trailSession.findFirst({
    where: eq(schema.trailSession.slug, slug),
  });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Toggle: if (session, user, kind) row exists, delete it; else insert.
  const existing = await db
    .select()
    .from(schema.sessionReaction)
    .where(
      and(
        eq(schema.sessionReaction.sessionId, row.id),
        eq(schema.sessionReaction.userId, actorId),
        eq(schema.sessionReaction.kind, body.kind),
      ),
    )
    .limit(1);

  let action: "added" | "removed";
  const existingReaction = existing[0];
  if (existingReaction) {
    await db
      .delete(schema.sessionReaction)
      .where(eq(schema.sessionReaction.id, existingReaction.id));
    action = "removed";
  } else {
    await db.insert(schema.sessionReaction).values({
      id: crypto.randomUUID(),
      sessionId: row.id,
      userId: actorId,
      kind: body.kind,
      note: body.note?.slice(0, 200) ?? null,
    });
    if (row.userId !== actorId) {
      await db
        .insert(schema.notification)
        .values({
          id: crypto.randomUUID(),
          userId: row.userId,
          actorId,
          type: "session_reaction",
          sessionId: row.id,
        })
        .onConflictDoNothing();
    }
    action = "added";
  }

  const userRow = await db.query.user.findFirst({
    where: eq(schema.user.id, row.userId),
  });
  if (userRow?.handle) revalidatePath(`/u/${userRow.handle}/${slug}`);
  return NextResponse.json({ ok: true, action });
}
