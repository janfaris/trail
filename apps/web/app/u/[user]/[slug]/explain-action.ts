"use server";

import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";
import { generateSessionExplanation } from "@/lib/explain";
import { eq, asc } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

export type ExplainResult =
  | { ok: true; explanation: string; cached: boolean }
  | { ok: false; error: string };

export async function requestExplanation(
  sessionId: string,
  pathToRevalidate: string,
): Promise<ExplainResult> {
  // v0.2: any authenticated user can trigger generation on any public session.
  // No abuse vector yet — all sessions in DB are explicitly shared.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "unauthorized" };

  const row = await db.query.trailSession.findFirst({
    where: eq(schema.trailSession.id, sessionId),
  });
  if (!row) return { ok: false, error: "not found" };

  if (row.aiExplanation) {
    return { ok: true, explanation: row.aiExplanation, cached: true };
  }

  const events = await db
    .select({ kind: schema.event.kind, data: schema.event.data })
    .from(schema.event)
    .where(eq(schema.event.sessionId, sessionId))
    .orderBy(asc(schema.event.idx));

  const explanation = await generateSessionExplanation({
    title: row.title || row.slug,
    summary: row.summary,
    events: events.map((e) => ({ kind: e.kind, payload: e.data })),
  });
  if (!explanation) return { ok: false, error: "generation failed" };

  await db
    .update(schema.trailSession)
    .set({ aiExplanation: explanation, aiExplanationGeneratedAt: new Date() })
    .where(eq(schema.trailSession.id, sessionId));

  revalidatePath(pathToRevalidate);
  return { ok: true, explanation, cached: false };
}
