// Week 5 — cost-per-PR pivot. Materialize a Cost-Pulse Recap from a shipped
// session that already has session_cost_attribution rows. Mirrors the shape
// of generate-pulse.ts (owner-gated, idempotent) but consumes the cost
// aggregator and stores tier='cost-pulse'.
//
// Visibility defaults to 'private' for cost recaps. The public /r/[slug]
// renderer guards out cost-* tiers, so a stray public cost recap would 404
// rather than misrender — but private-default is the belt to that suspenders.

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { aggregateCost } from "./cost-aggregate";
import { generateOneLiner } from "./one-liner";

export type GenerateCostPulseResult =
  | {
      ok: true;
      recapId: string;
      slug: string;
      created: boolean;
      shippedPrCount: number;
      totalCostUsd: number;
    }
  | {
      ok: false;
      reason:
        | "session-not-found"
        | "not-owner"
        | "no-cost-data"
        | "db-error";
      message?: string;
    };

function newSlug(): string {
  return randomBytes(6).toString("base64url").slice(0, 9).toLowerCase();
}

export async function generateCostPulseRecap(
  sessionId: string,
  requestingUserId: string,
): Promise<GenerateCostPulseResult> {
  const row = await db.query.trailSession.findFirst({
    where: eq(schema.trailSession.id, sessionId),
  });
  if (!row) return { ok: false, reason: "session-not-found" };
  if (row.userId !== requestingUserId) return { ok: false, reason: "not-owner" };

  // Idempotent — return the existing cost-pulse recap if present.
  const existing = await db.query.recap.findFirst({
    where: and(
      eq(schema.recap.sessionId, sessionId),
      eq(schema.recap.tier, "cost-pulse"),
    ),
  });
  if (existing) {
    const ex = existing.payload as { metrics?: { shippedPrCount?: number; totalCostUsd?: number } };
    return {
      ok: true,
      recapId: existing.id,
      slug: existing.slug,
      created: false,
      shippedPrCount: ex.metrics?.shippedPrCount ?? 0,
      totalCostUsd: ex.metrics?.totalCostUsd ?? 0,
    };
  }

  const payload = await aggregateCost({
    userId: row.userId,
    // Window args are overridden by the aggregator for cost-pulse (it pulls
    // the session anchor and uses session-scoped rows), but the type still
    // requires them — pass safe placeholders.
    windowStart: row.startedAt,
    windowEnd: row.endedAt ?? row.startedAt,
    tier: "cost-pulse",
    sessionId,
  });

  // No attribution rows → no cost data to recap. Caller surfaces this as a
  // 400 to the client.
  if (payload.metrics.totalCostUsd <= 0) {
    return { ok: false, reason: "no-cost-data" };
  }

  const oneLiner = await generateOneLiner({
    payload,
    sessionTitle: row.title,
    sessionSummary: row.summary,
    linkedRepo: row.linkedRepo,
  });

  // Slug collision retry. 9 chars of base64url-ish entropy = paranoia tier.
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

  try {
    await db.insert(schema.recap).values({
      id,
      userId: row.userId,
      tier: "cost-pulse",
      slug,
      sessionId: row.id,
      windowStart: null,
      windowEnd: null,
      payload,
      oneLiner: oneLiner.text,
      oneLinerValidatorWarnings:
        oneLiner.warnings.length > 0 ? oneLiner.warnings : null,
      // Private-default. Cost data is sensitive; user explicitly opts in to
      // publish from the dashboard (UI not yet built — out of Week 5 scope).
      visibility: "private",
      sharedAt: null,
    });
  } catch (err) {
    return {
      ok: false,
      reason: "db-error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  return {
    ok: true,
    recapId: id,
    slug,
    created: true,
    shippedPrCount: payload.metrics.shippedPrCount,
    totalCostUsd: payload.metrics.totalCostUsd,
  };
}
