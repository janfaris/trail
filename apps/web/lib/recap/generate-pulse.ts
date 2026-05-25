/**
 * Materialize a Pulse Recap from an existing trailSession row.
 *
 * Pulse is the smallest viable cadence: one shipped session → one share card.
 * Reuses the aggregation engine even though n=1, so the payload shape stays
 * consistent with weekly/monthly/wrapped tiers.
 */
import { randomBytes } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { aggregate, type SessionInput } from "./aggregate";

export type GeneratePulseResult =
  | { ok: true; recapId: string; slug: string; created: boolean }
  | { ok: false; reason: "session-not-found" | "not-owner" | "db-error"; message?: string };

function rowToInput(row: typeof schema.trailSession.$inferSelect): SessionInput {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationSeconds: row.durationSeconds,
    models: row.models,
    toolsUsed: row.toolsUsed,
    frameworks: row.frameworks,
    taskType: row.taskType,
    outcome: row.outcome,
    linkedRepo: row.linkedRepo,
    linkedCommitSha: row.linkedCommitSha,
    receiptStatus: row.receiptStatus,
    promptCount: row.promptCount,
    distinctFiles: row.distinctFiles,
    failedToolCalls: row.failedToolCalls,
  };
}

function newSlug(): string {
  // 9-char base36-ish slug. Good enough for unique-per-table with index check.
  return randomBytes(6).toString("base64url").slice(0, 9).toLowerCase();
}

export async function generatePulseRecap(
  sessionId: string,
  requestingUserId: string,
): Promise<GeneratePulseResult> {
  const row = await db.query.trailSession.findFirst({
    where: eq(schema.trailSession.id, sessionId),
  });
  if (!row) return { ok: false, reason: "session-not-found" };
  if (row.userId !== requestingUserId) return { ok: false, reason: "not-owner" };

  // Idempotent — if a pulse recap already exists for this session, return it.
  const existing = await db.query.recap.findFirst({
    where: and(
      eq(schema.recap.sessionId, sessionId),
      eq(schema.recap.tier, "pulse"),
    ),
  });
  if (existing) {
    return { ok: true, recapId: existing.id, slug: existing.slug, created: false };
  }

  const payload = aggregate([rowToInput(row)], { tier: "pulse" });

  // Slug collision check — retry up to 5x. With 9 chars of base64url-ish entropy
  // this is paranoia, but cheap insurance.
  let slug = newSlug();
  for (let i = 0; i < 5; i++) {
    const taken = await db.query.recap.findFirst({
      where: eq(schema.recap.slug, slug),
      columns: { id: true },
    });
    if (!taken) break;
    slug = newSlug();
  }

  const id = randomBytes(12).toString("base64url");
  // Default visibility = same as the source session. If session is public,
  // recap is public. Otherwise private.
  const visibility = row.visibility === "public" ? "public" : "private";

  try {
    await db.insert(schema.recap).values({
      id,
      userId: row.userId,
      tier: "pulse",
      slug,
      sessionId: row.id,
      windowStart: null,
      windowEnd: null,
      payload,
      visibility,
      sharedAt: visibility === "public" ? new Date() : null,
    });
  } catch (err) {
    return {
      ok: false,
      reason: "db-error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  return { ok: true, recapId: id, slug, created: true };
}
