/**
 * Recap aggregation engine.
 *
 * Pure functions over trailSession rows. No DB I/O. Used by:
 *   - cron jobs that materialize windowed recaps (weekly/monthly/wrapped)
 *   - the pulse/project route handlers that materialize per-session recaps
 *   - test snapshots
 *
 * Shape of the returned payload is the contract the render layer
 * (@vercel/og card + scene-story page) reads from. Versioned via `v`.
 */

export type Tier = "pulse" | "weekly" | "monthly" | "project" | "wrapped";

/**
 * Minimal projection of trailSession needed for aggregation.
 * Keep this narrow so the engine stays decoupled from the full schema.
 */
export interface SessionInput {
  id: string;
  slug: string;
  title: string | null;
  summary: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  models: string[] | null;
  toolsUsed: string[] | null;
  frameworks: string[] | null;
  taskType: string | null; // shipped|debugging|refactor|...
  outcome: string | null; // shipped|abandoned|rabbithole|unknown
  linkedRepo: string | null;
  linkedCommitSha: string | null;
  receiptStatus: string | null; // shipped|draft|unverified
  promptCount: number | null;
  distinctFiles: number | null;
  failedToolCalls: number | null;
}

export interface CountedItem {
  name: string;
  count: number;
  /** Share of total events this item represents, 0..1. */
  share: number;
}

export interface VelocityPoint {
  /** ISO date for the bucket start (week or month). */
  bucketStart: string;
  shipped: number;
  total: number;
}

export interface RecapPayload {
  v: 1;
  tier: Tier;
  windowStart: string | null;
  windowEnd: string | null;
  sessionCount: number;
  shippedCount: number;
  /** 0..1 — shipped / total. */
  shippedRatio: number;
  totalSeconds: number;
  topModels: CountedItem[];
  topTools: CountedItem[];
  topFrameworks: CountedItem[];
  topRepos: CountedItem[];
  topTaskTypes: CountedItem[];
  /** Empty for pulse/project. */
  velocity: VelocityPoint[];
  /** 0..100 vibe score. Personal context only — NEVER a public leaderboard. */
  vibeScore: number;
  /**
   * Optional single session reference. Set for pulse/project tiers.
   * The render layer pulls the full session record for these.
   */
  sessionId: string | null;
}

const NULL_RESULT = (
  tier: Tier,
  windowStart: Date | null,
  windowEnd: Date | null,
): RecapPayload => ({
  v: 1,
  tier,
  windowStart: windowStart?.toISOString() ?? null,
  windowEnd: windowEnd?.toISOString() ?? null,
  sessionCount: 0,
  shippedCount: 0,
  shippedRatio: 0,
  totalSeconds: 0,
  topModels: [],
  topTools: [],
  topFrameworks: [],
  topRepos: [],
  topTaskTypes: [],
  velocity: [],
  vibeScore: 0,
  sessionId: null,
});

const TOP_N = 5;

function topN(counts: Map<string, number>, total: number): CountedItem[] {
  const items: CountedItem[] = [];
  for (const [name, count] of counts) {
    items.push({ name, count, share: total > 0 ? count / total : 0 });
  }
  items.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return items.slice(0, TOP_N);
}

function tallyArray(
  sessions: SessionInput[],
  pick: (s: SessionInput) => string[] | null,
): { counts: Map<string, number>; total: number } {
  const counts = new Map<string, number>();
  let total = 0;
  for (const s of sessions) {
    const arr = pick(s) ?? [];
    for (const raw of arr) {
      const name = raw?.trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
      total += 1;
    }
  }
  return { counts, total };
}

function tallyScalar(
  sessions: SessionInput[],
  pick: (s: SessionInput) => string | null,
): { counts: Map<string, number>; total: number } {
  const counts = new Map<string, number>();
  let total = 0;
  for (const s of sessions) {
    const name = pick(s)?.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
    total += 1;
  }
  return { counts, total };
}

/** Shipped detector. A session counts as shipped if either signal fires. */
function isShipped(s: SessionInput): boolean {
  return s.outcome === "shipped" || s.receiptStatus === "shipped";
}

/**
 * Vibe score — personal, qualitative, 0..100.
 *
 *   shipped_ratio   * 0.50  → did you actually finish things?
 *   stack_diversity * 0.30  → did you explore the surface area?
 *   consistency     * 0.20  → did you ship across multiple windows?
 *
 * NOT a leaderboard metric. NOT compared between users in any public UI.
 * Documented formula so it stays inspectable.
 */
function computeVibeScore(sessions: SessionInput[]): number {
  if (sessions.length === 0) return 0;

  const shipped = sessions.filter(isShipped).length;
  const shippedRatio = shipped / sessions.length; // 0..1

  // Stack diversity — distinct (model, tool, framework, repo) tuples, capped.
  // Capped at 12 so this can't dominate the score for omnivore devs.
  const distinct = new Set<string>();
  for (const s of sessions) {
    (s.models ?? []).forEach((m) => distinct.add(`m:${m}`));
    (s.toolsUsed ?? []).forEach((t) => distinct.add(`t:${t}`));
    (s.frameworks ?? []).forEach((f) => distinct.add(`f:${f}`));
    if (s.linkedRepo) distinct.add(`r:${s.linkedRepo}`);
  }
  const stackDiversity = Math.min(distinct.size / 12, 1); // 0..1

  // Consistency — fraction of weeks in the window that have ≥1 shipped session.
  // For pulse/project (window <= 1 week) this is just isShipped of the one session.
  const weeks = new Map<string, boolean>(); // weekKey → hasShipped
  for (const s of sessions) {
    const d = s.endedAt ?? s.startedAt;
    const weekKey = isoWeekKey(d);
    if (isShipped(s)) weeks.set(weekKey, true);
    else if (!weeks.has(weekKey)) weeks.set(weekKey, false);
  }
  const consistency =
    weeks.size > 0
      ? [...weeks.values()].filter(Boolean).length / weeks.size
      : 0;

  const raw = shippedRatio * 0.5 + stackDiversity * 0.3 + consistency * 0.2;
  return Math.round(raw * 100);
}

function isoWeekKey(d: Date): string {
  // ISO week — Mondays as bucket boundary. Returns YYYY-Www format.
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function bucketByWeek(sessions: SessionInput[]): VelocityPoint[] {
  const buckets = new Map<string, { shipped: number; total: number }>();
  for (const s of sessions) {
    const d = s.endedAt ?? s.startedAt;
    const key = isoWeekKey(d);
    const bucket = buckets.get(key) ?? { shipped: 0, total: 0 };
    bucket.total += 1;
    if (isShipped(s)) bucket.shipped += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, b]) => ({ bucketStart: key, shipped: b.shipped, total: b.total }));
}

export interface AggregateOptions {
  tier: Tier;
  windowStart?: Date | null;
  windowEnd?: Date | null;
}

/**
 * Build a RecapPayload from a list of trailSession rows.
 *
 * For pulse/project tiers the caller passes a single-element array.
 * For windowed tiers the caller has already filtered sessions to the window.
 *
 * Pure — no DB, no LLM, no I/O. The LLM one-liner is added separately by
 * the route handler so this function stays deterministic and testable.
 */
export function aggregate(
  sessions: SessionInput[],
  opts: AggregateOptions,
): RecapPayload {
  const tier = opts.tier;
  const windowStart = opts.windowStart ?? null;
  const windowEnd = opts.windowEnd ?? null;

  if (sessions.length === 0) return NULL_RESULT(tier, windowStart, windowEnd);

  const sessionCount = sessions.length;
  const shippedCount = sessions.filter(isShipped).length;
  const totalSeconds = sessions.reduce(
    (sum, s) => sum + (s.durationSeconds ?? 0),
    0,
  );

  const models = tallyArray(sessions, (s) => s.models);
  const tools = tallyArray(sessions, (s) => s.toolsUsed);
  const frameworks = tallyArray(sessions, (s) => s.frameworks);
  const repos = tallyScalar(sessions, (s) => s.linkedRepo);
  const taskTypes = tallyScalar(sessions, (s) => s.taskType);

  const isWindowed = tier === "weekly" || tier === "monthly" || tier === "wrapped";

  return {
    v: 1,
    tier,
    windowStart: windowStart?.toISOString() ?? null,
    windowEnd: windowEnd?.toISOString() ?? null,
    sessionCount,
    shippedCount,
    shippedRatio: sessionCount > 0 ? shippedCount / sessionCount : 0,
    totalSeconds,
    topModels: topN(models.counts, models.total),
    topTools: topN(tools.counts, tools.total),
    topFrameworks: topN(frameworks.counts, frameworks.total),
    topRepos: topN(repos.counts, repos.total),
    topTaskTypes: topN(taskTypes.counts, taskTypes.total),
    velocity: isWindowed ? bucketByWeek(sessions) : [],
    vibeScore: computeVibeScore(sessions),
    sessionId:
      tier === "pulse" || tier === "project" ? sessions[0]?.id ?? null : null,
  };
}
