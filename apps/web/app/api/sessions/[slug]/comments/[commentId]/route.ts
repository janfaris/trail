import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { loadComment, loadReceipt } from "../_shared";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ slug: string; commentId: string }>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const { auth } = await import("@/lib/auth");
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session?.user?.id) {
    return jsonError("Sign in to moderate comments.", 401);
  }
  const actorId = session.user.id;

  const { slug, commentId } = await context.params;
  const { db, schema, receipt } = await loadReceipt(req, slug);

  if (!receipt) {
    return jsonError("Receipt not found.", 404);
  }

  const commentRows = await db
    .select({
      id: schema.sessionComment.id,
      userId: schema.sessionComment.userId,
      deletedAt: schema.sessionComment.deletedAt,
    })
    .from(schema.sessionComment)
    .where(
      and(eq(schema.sessionComment.id, commentId), eq(schema.sessionComment.sessionId, receipt.id)),
    )
    .limit(1);
  const comment = commentRows[0];

  if (!comment) {
    return jsonError("Comment not found.", 404);
  }

  if (comment.userId !== actorId && receipt.userId !== actorId) {
    return jsonError("You can only delete your comments or comments on your receipts.", 403);
  }

  if (!comment.deletedAt) {
    const now = new Date();
    await db
      .update(schema.sessionComment)
      .set({
        deletedAt: now,
        deletedById: actorId,
        updatedAt: now,
      })
      .where(eq(schema.sessionComment.id, comment.id));
  }

  const updatedComment = await loadComment(comment.id, receipt.id);

  if (!updatedComment) {
    return jsonError("Comment was deleted but could not be loaded.", 500);
  }

  return NextResponse.json({ comment: updatedComment });
}
