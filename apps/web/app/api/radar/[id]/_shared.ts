import { and, asc, eq, isNull } from "drizzle-orm";

// Engagement primitives for Trail Picks (curated radar_signal rows). Picks have
// no owner user, so — unlike session reactions/comments — there are no owner
// notifications and delete authorization is author-only.

export { isRadarReactionKind } from "@/lib/radar-engagement";
export type { RadarReactionKind } from "@/lib/radar-engagement";

export const RADAR_COMMENT_LIMIT = 200;
export const RADAR_COMMENT_MAX_LENGTH = 1600;

export type RadarCommentDto = {
  id: string;
  body: string | null;
  createdAt: string;
  deletedAt: string | null;
  author: {
    id: string;
    name: string;
    handle: string | null;
    image: string | null;
  };
};

type RadarCommentRow = {
  id: string;
  body: string;
  createdAt: Date | string;
  deletedAt: Date | string | null;
  authorId: string;
  authorName: string;
  authorHandle: string | null;
  authorImage: string | null;
};

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function serializeRadarComment(row: RadarCommentRow): RadarCommentDto {
  const deletedAt = row.deletedAt ? toIso(row.deletedAt) : null;
  return {
    id: row.id,
    body: deletedAt ? null : row.body,
    createdAt: toIso(row.createdAt),
    deletedAt,
    author: {
      id: row.authorId,
      name: row.authorName,
      handle: row.authorHandle,
      image: row.authorImage,
    },
  };
}

export function validateRadarCommentBody(
  value: unknown,
): { body: string; error?: never } | { body?: never; error: string } {
  if (typeof value !== "string") return { error: "Comment body is required." };
  const body = value.trim();
  if (body.length === 0) return { error: "Comment body is required." };
  if (body.length > RADAR_COMMENT_MAX_LENGTH) {
    return { error: `Comments must be ${RADAR_COMMENT_MAX_LENGTH} characters or fewer.` };
  }
  if (body.includes("\0")) return { error: "Comment body contains invalid characters." };
  return { body };
}

// Resolve a Pick the viewer is allowed to engage with. Dismissed signals are
// treated as not found so they can't be reacted to / commented on via the API.
export async function loadRadarSignal(id: string) {
  const { db, schema } = await import("@/db/client");
  if (!id || id.length === 0) {
    return { db, schema, signal: null as { id: string } | null };
  }
  const rows = await db
    .select({ id: schema.radarSignal.id, status: schema.radarSignal.status })
    .from(schema.radarSignal)
    .where(eq(schema.radarSignal.id, id))
    .limit(1);
  const row = rows[0];
  if (!row || row.status === "dismissed") {
    return { db, schema, signal: null as { id: string } | null };
  }
  return { db, schema, signal: { id: row.id } };
}

export async function loadRadarComments(signalId: string) {
  const { db, schema } = await import("@/db/client");
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
    .where(and(eq(schema.radarComment.signalId, signalId), isNull(schema.radarComment.deletedAt)))
    .orderBy(asc(schema.radarComment.createdAt), asc(schema.radarComment.id))
    .limit(RADAR_COMMENT_LIMIT);
  return rows.map(serializeRadarComment);
}
