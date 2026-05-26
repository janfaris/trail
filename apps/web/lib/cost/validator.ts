// Week 4 — cost-per-PR pivot. Read-only diagnostic pass over a user's
// attribution data. Surfaces data-quality smells that the engine can't (or
// shouldn't) auto-correct. Never mutates anything. UI surfaces these on
// /dashboard/cost so the user can decide whether to act on each warning.
//
// Codes (stable; keep in sync with the dashboard messaging):
//   high_native_cost            — session.estimated_cost_usd > $100
//   linked_no_tokens            — session has linkedPrUrl but 0 input/output tokens
//   tokens_without_model        — session has tokens but trail_session.models[] empty
//   over_attributed             — Σ session_cost_attribution > 2× session.estimated_cost_usd
//   bucket_no_shipped_session   — vendor bucket with cost > $0 but no shipped sessions in window

import { and, between, eq, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";

export type AttributionWarning = {
  sessionId: string;
  severity: "info" | "warn" | "error";
  code: string;
  message: string;
};

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

export async function validateAttributionsForUser(
  userId: string,
  since?: Date,
): Promise<AttributionWarning[]> {
  const sinceDate = since ?? daysAgo(90);
  const until = new Date();
  const warnings: AttributionWarning[] = [];

  // ─── 1 & 2 & 3 — per-session checks ────────────────────────────────────
  // Single SELECT pulls everything we need; cheaper than 3 round-trips.
  const sessions = await db
    .select({
      id: schema.trailSession.id,
      estimatedCostUsd: schema.trailSession.estimatedCostUsd,
      linkedPrUrl: schema.trailSession.linkedPrUrl,
      inputTokens: schema.trailSession.inputTokens,
      outputTokens: schema.trailSession.outputTokens,
      cachedTokens: schema.trailSession.cachedTokens,
      models: schema.trailSession.models,
      createdAt: schema.trailSession.createdAt,
    })
    .from(schema.trailSession)
    .where(
      and(
        eq(schema.trailSession.userId, userId),
        between(schema.trailSession.createdAt, sinceDate, until),
      ),
    );

  for (const s of sessions) {
    const cost = s.estimatedCostUsd != null ? Number(s.estimatedCostUsd) : null;
    if (cost != null && Number.isFinite(cost) && cost > 100) {
      warnings.push({
        sessionId: s.id,
        severity: "warn",
        code: "high_native_cost",
        message: `Session estimated_cost_usd is $${cost.toFixed(2)} — unusually large; verify tokens were captured correctly.`,
      });
    }

    const inT = s.inputTokens ?? 0;
    const outT = s.outputTokens ?? 0;
    const cachedT = s.cachedTokens ?? 0;
    const totalTokens = inT + outT + cachedT;

    if (s.linkedPrUrl && totalTokens === 0) {
      warnings.push({
        sessionId: s.id,
        severity: "info",
        code: "linked_no_tokens",
        message:
          "Session has linked PR but no captured tokens (likely a pre-Week-0 session before token capture shipped).",
      });
    }

    const modelsCount = Array.isArray(s.models) ? s.models.length : 0;
    if (totalTokens > 0 && modelsCount === 0) {
      warnings.push({
        sessionId: s.id,
        severity: "info",
        code: "tokens_without_model",
        message:
          "Session has token counts but no models[] array; per-model cost cannot be derived.",
      });
    }
  }

  // ─── 4 — over-attribution check ────────────────────────────────────────
  // Sum attribution rows per session and compare against trail_session
  // estimated_cost_usd. Only flags sessions whose native cost is known — for
  // a fanout-only session we have no baseline to compare to. Threshold is
  // 2× because some fanout overlap is expected (e.g. a bucket period spans
  // multiple PRs); but >2× is almost certainly double-counting.
  const overAttributed = await db.execute<{
    session_id: string;
    attributed_sum: string;
    estimated_cost_usd: string;
  }>(sql`
    SELECT
      a.session_id,
      SUM(a.attributed_cost_usd)::text AS attributed_sum,
      s.estimated_cost_usd::text AS estimated_cost_usd
    FROM session_cost_attribution a
    JOIN trail_session s ON s.id = a.session_id
    WHERE a.user_id = ${userId}
      AND s.estimated_cost_usd IS NOT NULL
      AND s.estimated_cost_usd > 0
      AND a.attributed_at >= ${sinceDate.toISOString()}::timestamptz
    GROUP BY a.session_id, s.estimated_cost_usd
    HAVING SUM(a.attributed_cost_usd) > 2 * s.estimated_cost_usd
  `);

  for (const r of (overAttributed.rows ?? overAttributed) as Array<{
    session_id: string;
    attributed_sum: string;
    estimated_cost_usd: string;
  }>) {
    const sum = Number(r.attributed_sum);
    const baseline = Number(r.estimated_cost_usd);
    warnings.push({
      sessionId: r.session_id,
      severity: "warn",
      code: "over_attributed",
      message: `Σ session_cost_attribution = $${sum.toFixed(4)} is >2× session.estimated_cost_usd ($${baseline.toFixed(4)}) — possible fanout double-count.`,
    });
  }

  // ─── 5 — bucket-without-shipped check ──────────────────────────────────
  // Find vendor buckets in the window with cost > $0 that have NO
  // corresponding shipped session in the same window. These represent
  // "unattributed spend" — the user paid for tokens but didn't ship a PR in
  // that window, so the engine has nowhere to fan the cost out. Surfaced as
  // info (not warn) because it's often legitimate (research, prototyping).
  const orphanBuckets = await db.execute<{
    id: string;
    vendor: string;
    bucket_start: Date;
    estimated_cost_usd: string;
  }>(sql`
    SELECT b.id, b.vendor, b.bucket_start, b.estimated_cost_usd::text AS estimated_cost_usd
    FROM vendor_usage_bucket b
    WHERE b.user_id = ${userId}
      AND b.vendor IN ('anthropic','openai')
      AND b.estimated_cost_usd IS NOT NULL
      AND b.estimated_cost_usd > 0
      AND b.bucket_start BETWEEN ${sinceDate.toISOString()}::timestamptz
                             AND ${until.toISOString()}::timestamptz
      AND NOT EXISTS (
        SELECT 1 FROM trail_session s
        WHERE s.user_id = b.user_id
          AND s.linked_pr_url IS NOT NULL
          AND s.receipt_verified_at BETWEEN b.bucket_start AND b.bucket_end
      )
  `);

  for (const r of (orphanBuckets.rows ?? orphanBuckets) as Array<{
    id: string;
    vendor: string;
    bucket_start: Date;
    estimated_cost_usd: string;
  }>) {
    const cost = Number(r.estimated_cost_usd);
    const startStr =
      r.bucket_start instanceof Date
        ? r.bucket_start.toISOString()
        : String(r.bucket_start);
    warnings.push({
      // Bucket-level warnings: there's no single sessionId. Encode the bucket
      // id as sessionId="bucket:<id>" so the UI can route the warning to the
      // bucket detail view rather than a session detail.
      sessionId: `bucket:${r.id}`,
      severity: "info",
      code: "bucket_no_shipped_session",
      message: `Vendor bucket (${r.vendor}, start=${startStr}) cost $${cost.toFixed(4)} but no shipped PR landed in its window — spend is unattributed.`,
    });
  }

  // Stable ordering: errors > warns > infos; then by sessionId for repeatable
  // test output.
  const sevRank: Record<AttributionWarning["severity"], number> = {
    error: 0,
    warn: 1,
    info: 2,
  };
  warnings.sort((a, b) => {
    if (sevRank[a.severity] !== sevRank[b.severity])
      return sevRank[a.severity] - sevRank[b.severity];
    return a.sessionId.localeCompare(b.sessionId);
  });

  return warnings;
}

// Verify the validator is read-only at type-system level. Anything that imports
// this module gets a tree-shaken read-only API; no DELETE/UPDATE/INSERT escape
// hatches are exported.
