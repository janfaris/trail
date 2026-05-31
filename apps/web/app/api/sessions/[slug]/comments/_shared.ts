import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { NextRequest } from "next/server";

export const COMMENT_LIMIT = 200;
export const COMMENT_MAX_LENGTH = 1600;

type CommentRow = {
  id: string;
  parentId: string | null;
  body: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt: Date | string | null;
  authorId: string;
  authorName: string;
  authorHandle: string | null;
  authorImage: string | null;
};

export type CommentDto = {
  id: string;
  parentId: string | null;
  body: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  author: {
    id: string;
    name: string;
    handle: string | null;
    image: string | null;
  };
};

function requestedAuthorHandle(req: NextRequest) {
  const authorHandle = req.nextUrl.searchParams.get("user")?.trim();
  return authorHandle && authorHandle.length > 0 ? authorHandle : null;
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function nullableIso(value: Date | string | null) {
  return value ? toIso(value) : null;
}

export function serializeComment(row: CommentRow): CommentDto {
  const deletedAt = nullableIso(row.deletedAt);

  return {
    id: row.id,
    parentId: row.parentId,
    body: deletedAt ? null : row.body,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    deletedAt,
    author: {
      id: row.authorId,
      name: row.authorName,
      handle: row.authorHandle,
      image: row.authorImage,
    },
  };
}

export function validateCommentBody(
  value: unknown,
): { body: string; error?: never } | { body?: never; error: string } {
  if (typeof value !== "string") {
    return { error: "Comment body is required." };
  }

  const body = value.trim();

  if (body.length === 0) {
    return { error: "Comment body is required." };
  }

  if (body.length > COMMENT_MAX_LENGTH) {
    return { error: `Comments must be ${COMMENT_MAX_LENGTH} characters or fewer.` };
  }

  if (body.includes("\0")) {
    return { error: "Comment body contains invalid characters." };
  }

  return { body };
}

export async function loadReceipt(req: NextRequest, slug: string) {
  const authorHandle = requestedAuthorHandle(req);
  const { db, schema } = await import("@/db/client");

  if (!authorHandle) {
    return { db, schema, receipt: null, error: "Receipt owner is required." };
  }

  const receiptRows = await db
    .select({
      id: schema.trailSession.id,
      slug: schema.trailSession.slug,
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
        isNotNull(schema.trailSession.sharedAt),
      ),
    )
    .limit(1);

  return { db, schema, receipt: receiptRows[0] ?? null, error: null };
}

export async function loadComments(sessionId: string) {
  const { db, schema } = await import("@/db/client");
  const rows = await db
    .select({
      id: schema.sessionComment.id,
      parentId: schema.sessionComment.parentId,
      body: schema.sessionComment.body,
      createdAt: schema.sessionComment.createdAt,
      updatedAt: schema.sessionComment.updatedAt,
      deletedAt: schema.sessionComment.deletedAt,
      authorId: schema.user.id,
      authorName: schema.user.name,
      authorHandle: schema.user.handle,
      authorImage: schema.user.image,
    })
    .from(schema.sessionComment)
    .innerJoin(schema.user, eq(schema.sessionComment.userId, schema.user.id))
    .where(eq(schema.sessionComment.sessionId, sessionId))
    .orderBy(asc(schema.sessionComment.createdAt), asc(schema.sessionComment.id))
    .limit(COMMENT_LIMIT);

  return rows.map(serializeComment);
}

export async function loadComment(commentId: string, sessionId: string) {
  const { db, schema } = await import("@/db/client");
  const rows = await db
    .select({
      id: schema.sessionComment.id,
      parentId: schema.sessionComment.parentId,
      body: schema.sessionComment.body,
      createdAt: schema.sessionComment.createdAt,
      updatedAt: schema.sessionComment.updatedAt,
      deletedAt: schema.sessionComment.deletedAt,
      authorId: schema.user.id,
      authorName: schema.user.name,
      authorHandle: schema.user.handle,
      authorImage: schema.user.image,
    })
    .from(schema.sessionComment)
    .innerJoin(schema.user, eq(schema.sessionComment.userId, schema.user.id))
    .where(
      and(eq(schema.sessionComment.id, commentId), eq(schema.sessionComment.sessionId, sessionId)),
    )
    .limit(1);

  const comment = rows[0];
  return comment ? serializeComment(comment) : null;
}
