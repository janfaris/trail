// Week 5 — cost-per-PR pivot. Reads session_cost_attribution + trail_session
// + vendor_usage_bucket and produces a render-ready cost payload used by:
//   - the /dashboard/cost page (cost-monthly tier)
//   - the /api/cron/recap-cost-weekly cron (cost-weekly tier)
//   - the /api/recap/cost-pulse/[sessionId] route (cost-pulse tier)
//
// Window semantics (per rubber-duck pass): the canonical "shipped at" timestamp
// is trail_session.receiptVerifiedAt — when the linked commit was confirmed on
// the default branch. The aggregator filters by receipt time, NOT by
// attribution.attributedAt (which is processing time and would drift the
// reporting window every time the attribution cron re-runs).
//
// All USD numbers are rounded to 6 decimals at the storage boundary; the UI
// rounds to 2 for display.

import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";

export type CostTier =
  | "cost-pulse"
  | "cost-weekly"
  | "cost-monthly"
  | "cost-project";

export type CostAggregateInput = {
  userId: string;
  windowStart: Date;
  windowEnd: Date;
  tier: CostTier;
  /** Required when tier === "cost-pulse" or "cost-project". */
  sessionId?: string;
};

export type CostPrEntry = {
  prUrl: string;
  sessionId: string;
  title: string | null;
  costUsd: number;
};

export type CostVendorEntry = {
  vendor: string;
  costUsd: number;
  share: number;
};

export type CostModelEntry = {
  model: string;
  vendor: string;
  costUsd: number;
  share: number;
};

export type CostAggregateOutput = {
  v: 1;
  tier: CostTier;
  windowStart: string;
  windowEnd: string;
  metrics: {
    totalCostUsd: number;
    shippedPrCount: number;
    avgCostPerPrUsd: number | null;
    medianCostPerPrUsd: number | null;
    mostExpensivePr: CostPrEntry | null;
    cheapestShippedPr: CostPrEntry | null;
    topModelByCost: { model: string; vendor: string; costUsd: number } | null;
    topVendorByCost: { vendor: string; costUsd: number } | null;
    unattributedCostUsd: number;
  };
  breakdown: {
    perVendor: CostVendorEntry[];
    perModel: CostModelEntry[];
    perPr: CostPrEntry[];
  };
};

function round6(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1e6) / 1e6;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return round6((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return round6(sorted[mid]);
}

// Native rows have no vendor_bucket; we infer vendor from the session tool
// (the upstream CLI/IDE) falling back to the dominant model name prefix.
// Keep returns stable — these strings end up in the recap payload and in the
// dashboard pie/bar labels.
function nativeVendor(tool: string | null, model: string | null): string {
  if (tool === "claude-code" || tool === "claude-cli") return "anthropic";
  if (tool === "cursor") return "cursor";
  if (tool === "copilot" || tool === "gh-copilot") return "copilot";
  if (model) {
    if (model.startsWith("claude-")) return "anthropic";
    if (model.startsWith("gpt-") || model.startsWith("o1") || model.startsWith("o3")) {
      return "openai";
    }
  }
  return tool ?? "unknown";
}

type JoinedRow = {
  attribId: string;
  sessionId: string;
  source: string;
  vendorBucketId: string | null;
  attributedCostUsd: string;
  receiptVerifiedAt: Date | null;
  sessionTitle: string | null;
  linkedPrUrl: string | null;
  sessionTool: string;
  sessionModels: string[] | null;
  bucketVendor: string | null;
  bucketModel: string | null;
};

async function loadRows(input: CostAggregateInput): Promise<JoinedRow[]> {
  const baseSelect = {
    attribId: schema.sessionCostAttribution.id,
    sessionId: schema.sessionCostAttribution.sessionId,
    source: schema.sessionCostAttribution.source,
    vendorBucketId: schema.sessionCostAttribution.vendorBucketId,
    attributedCostUsd: schema.sessionCostAttribution.attributedCostUsd,
    receiptVerifiedAt: schema.trailSession.receiptVerifiedAt,
    sessionTitle: schema.trailSession.title,
    linkedPrUrl: schema.trailSession.linkedPrUrl,
    sessionTool: schema.trailSession.tool,
    sessionModels: schema.trailSession.models,
    bucketVendor: schema.vendorUsageBucket.vendor,
    bucketModel: schema.vendorUsageBucket.model,
  };

  if (input.tier === "cost-pulse" || input.tier === "cost-project") {
    if (!input.sessionId) {
      throw new Error(`${input.tier} aggregation requires sessionId`);
    }
    // Pulse/project: pull every attribution row tied to the source session.
    // The window filter is moot here — attribution rows for a single session
    // are bounded by the session itself.
    //
    // linkedPrUrl IS NOT NULL: cost-per-PR is the headline metric, so we
    // only count rows where the joined session has a PR linked. Keeps
    // totalCostUsd and shippedPrCount aligned (see BLOCKER 1 in Week 5
    // review).
    return db
      .select(baseSelect)
      .from(schema.sessionCostAttribution)
      .innerJoin(
        schema.trailSession,
        eq(schema.sessionCostAttribution.sessionId, schema.trailSession.id),
      )
      .leftJoin(
        schema.vendorUsageBucket,
        eq(
          schema.sessionCostAttribution.vendorBucketId,
          schema.vendorUsageBucket.id,
        ),
      )
      .where(
        and(
          eq(schema.sessionCostAttribution.sessionId, input.sessionId),
          eq(schema.sessionCostAttribution.userId, input.userId),
          isNotNull(schema.trailSession.linkedPrUrl),
        ),
      );
  }

  // Windowed tiers (cost-weekly / cost-monthly): receipt-time-anchored. We
  // deliberately do NOT filter by attribution.attributedAt — that would drift
  // the report window every time the attribution cron re-runs.
  //
  // linkedPrUrl IS NOT NULL: the headline $/PR number divides totalCostUsd
  // by shippedPrCount; both numerator and denominator MUST come from the
  // same row set. Without this filter, an attribution row whose session
  // had its linkedPrUrl cleared (or attribution that ran before the link
  // was set) would silently inflate totalCost without contributing to
  // shippedPrCount. See BLOCKER 1 in the Week 5 review.
  return db
    .select(baseSelect)
    .from(schema.sessionCostAttribution)
    .innerJoin(
      schema.trailSession,
      eq(schema.sessionCostAttribution.sessionId, schema.trailSession.id),
    )
    .leftJoin(
      schema.vendorUsageBucket,
      eq(
        schema.sessionCostAttribution.vendorBucketId,
        schema.vendorUsageBucket.id,
      ),
    )
    .where(
      and(
        eq(schema.sessionCostAttribution.userId, input.userId),
        gte(schema.trailSession.receiptVerifiedAt, input.windowStart),
        lt(schema.trailSession.receiptVerifiedAt, input.windowEnd),
        isNotNull(schema.trailSession.linkedPrUrl),
      ),
    );
}

async function loadUnattributedBuckets(
  userId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<number> {
  // Buckets in the window with cost > 0 that no attribution row points to.
  // NOT EXISTS over NOT IN to keep null-handling explicit. Half-open window.
  const result = await db.execute<{ total: string | null }>(sql`
    SELECT COALESCE(SUM(b.estimated_cost_usd), 0)::numeric AS total
    FROM vendor_usage_bucket b
    WHERE b.user_id = ${userId}
      AND b.bucket_start >= ${windowStart}
      AND b.bucket_start < ${windowEnd}
      AND b.estimated_cost_usd IS NOT NULL
      AND b.estimated_cost_usd > 0
      AND NOT EXISTS (
        SELECT 1 FROM session_cost_attribution sca
        WHERE sca.vendor_bucket_id = b.id
      )
  `);
  // neon-http returns a result with `.rows` (array of objects).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (result as any).rows ?? (result as any) ?? [];
  const first = Array.isArray(rows) ? rows[0] : null;
  const raw = first?.total ?? "0";
  return round6(Number(raw));
}

export async function aggregateCost(
  input: CostAggregateInput,
): Promise<CostAggregateOutput> {
  // For cost-pulse / cost-project: derive a sensible window from the
  // session's lifecycle (startedAt → receiptVerifiedAt). The OLD code set
  // windowStart === windowEnd === receiptVerifiedAt, which (a) made the
  // half-open interval degenerate so loadUnattributedBuckets could never
  // find an overlapping bucket, and (b) emitted an invalid time interval
  // in the payload. See BLOCKER 2 in the Week 5 review.
  let windowStart = input.windowStart;
  let windowEnd = input.windowEnd;
  if (
    (input.tier === "cost-pulse" || input.tier === "cost-project") &&
    input.sessionId
  ) {
    const sess = await db.query.trailSession.findFirst({
      where: eq(schema.trailSession.id, input.sessionId),
      columns: {
        receiptVerifiedAt: true,
        startedAt: true,
        endedAt: true,
      },
    });
    if (sess) {
      // End-of-window: receiptVerifiedAt (canonical "shipped at"). Fall
      // back to endedAt, then to now() — the last fallback shouldn't fire
      // for a real shipped session but keeps the interval well-formed.
      const endCandidate =
        sess.receiptVerifiedAt ?? sess.endedAt ?? new Date();
      // Start-of-window: session.startedAt. If startedAt is null
      // (defensive — schema says NOT NULL), fall back to 24h before
      // endCandidate so we still get a finite, non-degenerate window.
      const startCandidate =
        sess.startedAt ??
        new Date(endCandidate.getTime() - 24 * 60 * 60 * 1000);
      windowStart = startCandidate;
      windowEnd = endCandidate;
      // Clock skew defence — swap if reversed.
      if (windowStart.getTime() > windowEnd.getTime()) {
        const tmp = windowStart;
        windowStart = windowEnd;
        windowEnd = tmp;
      }
    }
  }

  const rows = await loadRows(input);

  // Per-PR aggregation. A PR can span multiple sessions (one native + several
  // fanouts, or two native sessions both flagged to the same PR). We sum
  // cost per distinct linkedPrUrl and pick a representative session id (the
  // one with the highest single-row attributed cost, for stable choice).
  type PrAgg = {
    prUrl: string;
    sessionId: string;
    title: string | null;
    costUsd: number;
    repSourceCost: number; // representative session selector
  };
  const prMap = new Map<string, PrAgg>();
  const vendorMap = new Map<string, number>();
  const modelMap = new Map<string, { model: string; vendor: string; cost: number }>();
  let totalCost = 0;

  for (const r of rows) {
    const cost = Number(r.attributedCostUsd);
    if (!Number.isFinite(cost) || cost <= 0) continue;
    totalCost += cost;

    const isFanout = r.vendorBucketId != null;
    const vendor = isFanout
      ? r.bucketVendor ?? "unknown"
      : nativeVendor(r.sessionTool, r.sessionModels?.[0] ?? null);
    const model = isFanout
      ? r.bucketModel ?? "unknown"
      : r.sessionModels?.[0] ?? "unknown";

    vendorMap.set(vendor, (vendorMap.get(vendor) ?? 0) + cost);

    const modelKey = `${vendor}::${model}`;
    const ex = modelMap.get(modelKey);
    if (ex) ex.cost += cost;
    else modelMap.set(modelKey, { model, vendor, cost });

    // PR-level: only count rows whose session has a linkedPrUrl. Native
    // attribution requires it; fanouts inherit it from the shipped session
    // the engine fanned to, so it should always be set in practice — but
    // filter defensively.
    if (r.linkedPrUrl) {
      const ex = prMap.get(r.linkedPrUrl);
      if (ex) {
        ex.costUsd += cost;
        if (cost > ex.repSourceCost) {
          ex.repSourceCost = cost;
          ex.sessionId = r.sessionId;
          ex.title = r.sessionTitle;
        }
      } else {
        prMap.set(r.linkedPrUrl, {
          prUrl: r.linkedPrUrl,
          sessionId: r.sessionId,
          title: r.sessionTitle,
          costUsd: cost,
          repSourceCost: cost,
        });
      }
    }
  }

  // Round at the boundary.
  totalCost = round6(totalCost);
  const perPrAll: CostPrEntry[] = [...prMap.values()]
    .map((p) => ({
      prUrl: p.prUrl,
      sessionId: p.sessionId,
      title: p.title,
      costUsd: round6(p.costUsd),
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  const perVendor: CostVendorEntry[] = [...vendorMap.entries()]
    .map(([vendor, costUsd]) => ({
      vendor,
      costUsd: round6(costUsd),
      share: totalCost > 0 ? costUsd / totalCost : 0,
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  const perModel: CostModelEntry[] = [...modelMap.values()]
    .map(({ model, vendor, cost }) => ({
      model,
      vendor,
      costUsd: round6(cost),
      share: totalCost > 0 ? cost / totalCost : 0,
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  const shippedPrCount = perPrAll.length;
  const avgCostPerPrUsd =
    shippedPrCount > 0 ? round6(totalCost / shippedPrCount) : null;
  const medianCostPerPrUsd = median(perPrAll.map((p) => p.costUsd));
  const mostExpensivePr = perPrAll[0] ?? null;
  const cheapestShippedPr =
    perPrAll.length > 0 ? perPrAll[perPrAll.length - 1] : null;

  const topModelByCost =
    perModel[0]
      ? {
          model: perModel[0].model,
          vendor: perModel[0].vendor,
          costUsd: perModel[0].costUsd,
        }
      : null;
  const topVendorByCost =
    perVendor[0]
      ? { vendor: perVendor[0].vendor, costUsd: perVendor[0].costUsd }
      : null;

  // Unattributed spend is a window-aggregate concept — vendor buckets in
  // the window with no attribution row pointing at them. It doesn't apply
  // at single-session granularity, so we skip the round-trip for cost-pulse
  // and cost-project. See BLOCKER 2 in the Week 5 review.
  const unattributedCostUsd =
    input.tier === "cost-pulse" || input.tier === "cost-project"
      ? 0
      : await loadUnattributedBuckets(input.userId, windowStart, windowEnd);

  return {
    v: 1,
    tier: input.tier,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    metrics: {
      totalCostUsd: totalCost,
      shippedPrCount,
      avgCostPerPrUsd,
      medianCostPerPrUsd,
      mostExpensivePr,
      cheapestShippedPr,
      topModelByCost,
      topVendorByCost,
      unattributedCostUsd,
    },
    breakdown: {
      perVendor,
      perModel,
      perPr: perPrAll,
    },
  };
}
