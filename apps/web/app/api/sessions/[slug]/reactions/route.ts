export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

// Phase 1.6 — session reactions ("worked" / "needs-tweak" / "broken").
// GET   → public counts per kind + (if logged in) which kinds the viewer set.
// POST  → toggle one kind. Body: {kind, note?}. Idempotent: posting an
//          already-set kind removes it.

const KIND_RE = /^(worked|needs-tweak|broken)$/;

function requestedAuthorHandle(req: NextRequest) {
  const authorHandle = req.nextUrl.searchParams.get("user")?.trim();
  return authorHandle && authorHandle.length > 0 ? authorHandle : null;
}

async function loadReceipt(req: NextRequest, slug: string) {
  const authorHandle = requestedAuthorHandle(req);
  const { db, schema } = await import("@/db/client");

  if (!authorHandle) {
    return { db, schema, receipt: null, error: "Receipt owner is required." };
  }

  const rows = await db
    .select({
      id: schema.trailSession.id,
      userId: schema.trailSession.userId,
      authorHandle: schema.user.handle,
    })
    .from(schema.trailSession)
    .innerJoin(schema.user, eq(schema.trailSession.userId, schema.user.id))
    .where(
      and(
        eq(schema.trailSession.slug, slug),
        eq(schema.user.handle, authorHandle),
        eq(schema.trailSession.visibility, "public"),
      ),
    )
    .limit(1);

  return { db, schema, receipt: rows[0] ?? null, error: null };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { db, schema, receipt, error } = await loadReceipt(req, slug);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (!receipt) return NextResponse.json({ error: "not found" }, { status: 404 });

  const counts = (await db
    .select({
      kind: schema.sessionReaction.kind,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.sessionReaction)
    .where(eq(schema.sessionReaction.sessionId, receipt.id))
    .groupBy(schema.sessionReaction.kind)) as { kind: string; count: number }[];

  const { auth } = await import("@/lib/auth");
  const sess = await auth.api.getSession({ headers: req.headers });
  let mine: string[] = [];
  if (sess?.user) {
    const rows = await db
      .select({ kind: schema.sessionReaction.kind })
      .from(schema.sessionReaction)
      .where(
        and(
          eq(schema.sessionReaction.sessionId, receipt.id),
          eq(schema.sessionReaction.userId, sess.user.id),
        ),
      );
    mine = rows.map((r) => r.kind);
  }
  return NextResponse.json({ counts, mine });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { auth } = await import("@/lib/auth");
  const sess = await auth.api.getSession({ headers: req.headers });
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

  const { db, schema, receipt, error } = await loadReceipt(req, slug);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (!receipt) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Toggle: if (session, user, kind) row exists, delete it; else insert.
  const existing = await db
    .select()
    .from(schema.sessionReaction)
    .where(
      and(
        eq(schema.sessionReaction.sessionId, receipt.id),
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
    await db
      .insert(schema.sessionReaction)
      .values({
        id: crypto.randomUUID(),
        sessionId: receipt.id,
        userId: actorId,
        kind: body.kind,
        note: body.note?.slice(0, 200) ?? null,
      })
      .onConflictDoNothing({
        target: [
          schema.sessionReaction.sessionId,
          schema.sessionReaction.userId,
          schema.sessionReaction.kind,
        ],
      });
    if (receipt.userId !== actorId) {
      await db
        .insert(schema.notification)
        .values({
          id: crypto.randomUUID(),
          userId: receipt.userId,
          actorId,
          type: "session_reaction",
          sessionId: receipt.id,
        })
        .onConflictDoNothing();
    }
    action = "added";
  }

  if (receipt.authorHandle) revalidatePath(`/u/${receipt.authorHandle}/${slug}`);
  return NextResponse.json({ ok: true, action });
}
