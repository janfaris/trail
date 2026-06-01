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
