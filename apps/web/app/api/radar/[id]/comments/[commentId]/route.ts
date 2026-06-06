export const dynamic = "force-dynamic";

import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { loadRadarSignal } from "../../_shared";

// Soft-delete a Trail Pick comment. Picks have no owner, so only the comment's
// own author may delete it.

type RouteContext = { params: Promise<{ id: string; commentId: string }> };

export async function DELETE(req: NextRequest, context: RouteContext) {
  const { auth } = await import("@/lib/auth");
  const sess = await auth.api.getSession({ headers: req.headers });
  if (!sess?.user?.id) {
    return NextResponse.json({ error: "Sign in to manage comments." }, { status: 401 });
  }
  const actorId = sess.user.id;

  const { id, commentId } = await context.params;
  const { db, schema, signal } = await loadRadarSignal(id);
  if (!signal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const rows = await db
    .select({
      id: schema.radarComment.id,
      userId: schema.radarComment.userId,
      deletedAt: schema.radarComment.deletedAt,
    })
    .from(schema.radarComment)
    .where(and(eq(schema.radarComment.id, commentId), eq(schema.radarComment.signalId, signal.id)))
    .limit(1);
  const comment = rows[0];
  if (!comment) return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  if (comment.userId !== actorId) {
    return NextResponse.json({ error: "You can only delete your own comments." }, { status: 403 });
  }

  if (!comment.deletedAt) {
    const now = new Date();
    await db
      .update(schema.radarComment)
      .set({ deletedAt: now, deletedById: actorId, updatedAt: now })
      .where(eq(schema.radarComment.id, comment.id));
  }

  return NextResponse.json({ ok: true });
}
