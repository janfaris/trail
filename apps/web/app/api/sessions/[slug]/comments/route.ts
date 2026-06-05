import { and, eq, isNull } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { loadComment, loadComments, loadReceipt, validateCommentBody } from "./_shared";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function readParentId(value: unknown) {
  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const parentId = value.trim();
  return parentId.length > 0 ? parentId : null;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const { receipt, error } = await loadReceipt(req, slug);

  if (error) {
    return jsonError(error, 400);
  }

  if (!receipt) {
    return jsonError("Receipt not found.", 404);
  }

  const comments = await loadComments(receipt.id);
  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { auth } = await import("@/lib/auth");
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session?.user?.id) {
    return jsonError("Sign in to comment.", 401);
  }
  const actorId = session.user.id;

  const { limitAction, rateLimitHeaders } = await import("@/lib/rate-limit");
  const limit = await limitAction("comment", actorId);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many comments. Slow down for a moment." },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  const { slug } = await context.params;
  const { db, schema, receipt, error } = await loadReceipt(req, slug);

  if (error) {
    return jsonError(error, 400);
  }

  if (!receipt) {
    return jsonError("Receipt not found.", 404);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError("Invalid JSON payload.", 400);
  }

  if (!payload || typeof payload !== "object") {
    return jsonError("Invalid comment payload.", 400);
  }

  const record = payload as Record<string, unknown>;
  const parsedBody = validateCommentBody(record.body);

  if (parsedBody.error) {
    return jsonError(parsedBody.error, 400);
  }

  const commentBody = parsedBody.body;
  if (!commentBody) {
    return jsonError("Comment body is required.", 400);
  }

  const parentId = readParentId(record.parentId);

  if (parentId === undefined) {
    return jsonError("Invalid reply target.", 400);
  }

  let parentAuthorId: string | null = null;

  if (parentId) {
    const parentRows = await db
      .select({
        id: schema.sessionComment.id,
        parentId: schema.sessionComment.parentId,
        userId: schema.sessionComment.userId,
      })
      .from(schema.sessionComment)
      .where(
        and(
          eq(schema.sessionComment.id, parentId),
          eq(schema.sessionComment.sessionId, receipt.id),
          isNull(schema.sessionComment.deletedAt),
        ),
      )
      .limit(1);
    const parent = parentRows[0];

    if (!parent) {
      return jsonError("Reply target not found.", 400);
    }

    if (parent.parentId) {
      return jsonError("Replies can only be added to top-level comments.", 400);
    }

    parentAuthorId = parent.userId;
  }

  const commentId = crypto.randomUUID();
  await db.insert(schema.sessionComment).values({
    id: commentId,
    sessionId: receipt.id,
    userId: actorId,
    parentId,
    body: commentBody,
  });

  const recipients = new Set<string>();

  if (receipt.userId !== actorId) {
    recipients.add(receipt.userId);
  }

  if (parentAuthorId && parentAuthorId !== actorId) {
    recipients.add(parentAuthorId);
  }

  const notificationValues = Array.from(recipients).map((userId) => ({
    id: crypto.randomUUID(),
    userId,
    actorId,
    type: parentId ? "comment_reply" : "session_comment",
    sessionId: receipt.id,
    commentId,
  }));

  if (notificationValues.length > 0) {
    await db.insert(schema.notification).values(notificationValues);
  }

  const comment = await loadComment(commentId, receipt.id);

  if (!comment) {
    return jsonError("Comment was created but could not be loaded.", 500);
  }

  return NextResponse.json({ comment }, { status: 201 });
}
