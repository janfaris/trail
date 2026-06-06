export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import {
  loadRadarComments,
  loadRadarSignal,
  serializeRadarComment,
  validateRadarCommentBody,
} from "../_shared";

// Trail Pick comments — GET lists the flat thread; POST adds a top-level
// comment. Replies (parentId) are intentionally rejected until reply UI ships.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { signal } = await loadRadarSignal(id);
  if (!signal) return NextResponse.json({ error: "not found" }, { status: 404 });
  const comments = await loadRadarComments(signal.id);
  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { auth } = await import("@/lib/auth");
  const sess = await auth.api.getSession({ headers: req.headers });
  if (!sess?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actorId = sess.user.id;

  const { limitAction, rateLimitHeaders } = await import("@/lib/rate-limit");
  const limit = await limitAction("comment", actorId);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many comments. Slow down for a moment." },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  let payload: { body?: unknown; parentId?: unknown };
  try {
    payload = (await req.json()) as { body?: unknown; parentId?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (payload.parentId != null) {
    return NextResponse.json({ error: "Replies are not supported yet." }, { status: 400 });
  }
  const validation = validateRadarCommentBody(payload.body);
  if (validation.error || !validation.body) {
    return NextResponse.json(
      { error: validation.error ?? "Comment body is required." },
      { status: 400 },
    );
  }
  const commentBody = validation.body;

  const { db, schema, signal } = await loadRadarSignal(id);
  if (!signal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const commentId = crypto.randomUUID();
  await db.insert(schema.radarComment).values({
    id: commentId,
    signalId: signal.id,
    userId: actorId,
    body: commentBody,
  });

  const rows = await db
    .select({
      id: schema.radarComment.id,
      body: schema.radarComment.body,
      createdAt: schema.radarComment.createdAt,
      deletedAt: schema.radarComment.deletedAt,
      authorId: schema.user.id,
      authorName: schema.user.name,
      authorHandle: schema.user.handle,
      authorImage: schema.user.image,
    })
    .from(schema.radarComment)
    .innerJoin(schema.user, eq(schema.radarComment.userId, schema.user.id))
    .where(eq(schema.radarComment.id, commentId))
    .limit(1);

  const created = rows[0];
  if (!created) {
    return NextResponse.json(
      { error: "Comment was saved but could not be loaded." },
      {
        status: 500,
      },
    );
  }
  return NextResponse.json({ comment: serializeRadarComment(created) }, { status: 201 });
}
