// Profile aggregates computed at read time. Cheap at <100 sessions.
// Operates on already-fetched session rows to avoid extra queries.

export type SessionRow = {
  repo: string | null;
  eventCount: number;
  startedAt: Date;
  toolCallCounts: Record<string, number> | null;
  distinctFiles: number | null;
  promptCount: number | null;
  failedToolCalls: number | null;
};

export type TopTool = { name: string; count: number; pct: number };
export type TopRepo = { repo: string; sessions: number; events: number };

export type UserStats = {
  totalPrompts: number;
  totalToolCalls: number;
  failureRate: number;
  avgEventsPerSession: number;
  distinctFilesAllTime: number;
  topToolCalls: TopTool[];
  topRepos: TopRepo[];
  velocityWeekly: number[];
  peakWeekday: string | null;
};

const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
];

// ISO week start (Monday) at UTC midnight.
function weekStart(d: Date): number {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay(); // 0=Sun
  const diff = (dow + 6) % 7; // days since Monday
  x.setUTCDate(x.getUTCDate() - diff);
  return x.getTime();
}

export function computeUserStats(sessions: SessionRow[]): UserStats {
  let totalPrompts = 0;
  let totalToolCalls = 0;
  let failed = 0;
  let totalEvents = 0;
  let distinctFilesAllTime = 0;
  const toolTotals: Record<string, number> = {};
  const repoAgg: Record<string, { sessions: number; events: number }> = {};
  const weekdayCounts = new Array<number>(7).fill(0);

  for (const s of sessions) {
    totalPrompts += s.promptCount ?? 0;
    failed += s.failedToolCalls ?? 0;
    totalEvents += s.eventCount ?? 0;
    distinctFilesAllTime += s.distinctFiles ?? 0;
    if (s.toolCallCounts) {
      for (const [k, v] of Object.entries(s.toolCallCounts)) {
        const n = typeof v === "number" ? v : 0;
        toolTotals[k] = (toolTotals[k] ?? 0) + n;
        totalToolCalls += n;
      }
    }
    if (s.repo) {
      const r = repoAgg[s.repo] ?? { sessions: 0, events: 0 };
      r.sessions += 1;
      r.events += s.eventCount ?? 0;
      repoAgg[s.repo] = r;
    }
    if (s.startedAt instanceof Date) {
      weekdayCounts[s.startedAt.getUTCDay()] += 1;
    }
  }

  const topToolCalls: TopTool[] = Object.entries(toolTotals)
    .map(([name, count]) => ({
      name,
      count,
      pct: totalToolCalls > 0 ? count / totalToolCalls : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const topRepos: TopRepo[] = Object.entries(repoAgg)
    .map(([repo, v]) => ({ repo, sessions: v.sessions, events: v.events }))
    .sort((a, b) => b.events - a.events)
    .slice(0, 3);

  // Velocity: last 12 ISO weeks, oldest first.
  const now = new Date();
  const thisWeek = weekStart(now);
  const buckets = new Array<number>(12).fill(0);
  for (const s of sessions) {
    if (!(s.startedAt instanceof Date)) continue;
    const ws = weekStart(s.startedAt);
    const weeksAgo = Math.round((thisWeek - ws) / (7 * 24 * 3600 * 1000));
    if (weeksAgo >= 0 && weeksAgo < 12) {
      buckets[11 - weeksAgo] += 1;
    }
  }

  let peakWeekday: string | null = null;
  if (sessions.length >= 3) {
    let bestIdx = 0;
    let bestN = -1;
    for (let i = 0; i < 7; i++) {
      if (weekdayCounts[i] > bestN) {
        bestN = weekdayCounts[i];
        bestIdx = i;
      }
    }
    if (bestN > 0) peakWeekday = WEEKDAYS[bestIdx];
  }

  return {
    totalPrompts,
    totalToolCalls,
    failureRate: totalToolCalls > 0 ? failed / totalToolCalls : 0,
    avgEventsPerSession:
      sessions.length > 0 ? totalEvents / sessions.length : 0,
    distinctFilesAllTime,
    topToolCalls,
    topRepos,
    velocityWeekly: buckets,
    peakWeekday,
  };
}
