"use server";

import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) throw new Error("unauthorized");
  return session.user;
}

export async function setSavedLesson(lessonId: string, saved: boolean) {
  const user = await requireUser();

  if (!saved) {
    await db
      .delete(schema.savedLesson)
      .where(
        and(eq(schema.savedLesson.userId, user.id), eq(schema.savedLesson.lessonId, lessonId)),
      );
    revalidatePath("/learn");
    revalidatePath("/saved");
    return { ok: true, saved: false };
  }

  const rows = await db
    .select({
      lessonId: schema.sessionLesson.id,
      sessionId: schema.trailSession.id,
      slug: schema.trailSession.slug,
      authorHandle: schema.user.handle,
    })
    .from(schema.sessionLesson)
    .innerJoin(schema.trailSession, eq(schema.sessionLesson.sessionId, schema.trailSession.id))
    .innerJoin(schema.user, eq(schema.trailSession.userId, schema.user.id))
    .where(
      and(
        eq(schema.sessionLesson.id, lessonId),
        eq(schema.trailSession.visibility, "public"),
        isNotNull(schema.trailSession.sharedAt),
        isNull(schema.trailSession.redactedAt),
        isNotNull(schema.user.handle),
      ),
    )
    .limit(1);

  const lesson = rows[0];
  if (!lesson) return { ok: false, saved: false, error: "lesson is not public" };

  await db
    .insert(schema.savedLesson)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      lessonId: lesson.lessonId,
      sessionId: lesson.sessionId,
    })
    .onConflictDoNothing({
      target: [schema.savedLesson.userId, schema.savedLesson.lessonId],
    });

  revalidatePath("/learn");
  revalidatePath("/saved");
  revalidatePath(`/u/${lesson.authorHandle}/${lesson.slug}`);
  return { ok: true, saved: true };
}
async function loadPublicLesson(lessonId: string) {
  const rows = await db
    .select({
      lessonId: schema.sessionLesson.id,
      sessionId: schema.trailSession.id,
      slug: schema.trailSession.slug,
      authorId: schema.trailSession.userId,
      authorHandle: schema.user.handle,
    })
    .from(schema.sessionLesson)
    .innerJoin(schema.trailSession, eq(schema.sessionLesson.sessionId, schema.trailSession.id))
    .innerJoin(schema.user, eq(schema.trailSession.userId, schema.user.id))
    .where(
      and(
        eq(schema.sessionLesson.id, lessonId),
        eq(schema.trailSession.visibility, "public"),
        isNotNull(schema.trailSession.sharedAt),
        isNull(schema.trailSession.redactedAt),
        isNotNull(schema.user.handle),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function setLessonReused(lessonId: string, reused: boolean) {
  const user = await requireUser();

  if (!reused) {
    await db
      .delete(schema.lessonReuse)
      .where(
        and(eq(schema.lessonReuse.userId, user.id), eq(schema.lessonReuse.lessonId, lessonId)),
      );
    revalidatePath("/learn");
    return { ok: true, reused: false };
  }

  const lesson = await loadPublicLesson(lessonId);
  if (!lesson) return { ok: false, reused: false, error: "lesson is not public" };

  await db
    .insert(schema.lessonReuse)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      lessonId: lesson.lessonId,
      sessionId: lesson.sessionId,
    })
    .onConflictDoNothing({
      target: [schema.lessonReuse.userId, schema.lessonReuse.lessonId],
    });

  if (lesson.authorId !== user.id) {
    await db
      .insert(schema.notification)
      .values({
        id: crypto.randomUUID(),
        userId: lesson.authorId,
        actorId: user.id,
        type: "lesson_reuse",
        sessionId: lesson.sessionId,
        lessonId: lesson.lessonId,
      })
      .onConflictDoNothing();
  }

  revalidatePath("/learn");
  revalidatePath("/feed");
  revalidatePath("/notifications");
  revalidatePath(`/u/${lesson.authorHandle}`);
  revalidatePath(`/u/${lesson.authorHandle}/${lesson.slug}`);
  return { ok: true, reused: true };
}
