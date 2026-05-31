// Pure helpers for the follow graph + feed. Kept free of DB/Next imports so
// they are trivially unit-testable and reusable by both the server action and
// the /feed loader. The ordering logic here MUST mirror the SQL query in
// app/feed/page.tsx exactly (coalesce(sharedAt, startedAt) desc, id desc tie-break).

export type ToggleDecision = "added" | "removed";
export type FeedView = "everyone" | "following";

export function normalizeFeedView(value: string | string[] | null | undefined): FeedView {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "following" ? "following" : "everyone";
}

/**
 * Whether `followerId` is allowed to follow `followingId`. Rejects empty ids
 * and self-follows. The DB also enforces the self-follow invariant via a CHECK
 * constraint, but guarding here gives a clean structured error before we hit
 * the database.
 */
export function canFollow(followerId: string, followingId: string): boolean {
  if (!followerId || !followingId) return false;
  if (followerId === followingId) return false;
  return true;
}

/**
 * Given whether a follow row already exists, decide the toggle outcome.
 * Exists → we remove it; otherwise → we add it.
 */
export function toggleDecision(exists: boolean): ToggleDecision {
  return exists ? "removed" : "added";
}

/** Minimal shape rankFeed needs; real rows carry many more columns. */
export interface RankableSession {
  id: string;
  visibility: string;
  sharedAt: Date | string | null;
  startedAt: Date | string;
}

function toTime(value: Date | string | null | undefined): number {
  if (value == null) return Number.NEGATIVE_INFINITY;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

/** Effective ranking timestamp: shared time if present, else session start. */
function rankTime(row: RankableSession): number {
  const shared = toTime(row.sharedAt);
  if (shared !== Number.NEGATIVE_INFINITY) return shared;
  return toTime(row.startedAt);
}

/**
 * Defensively filter + order feed rows. Mirrors the SQL ordering so the page
 * stays consistent even if the query and this helper drift:
 *   - keep only public sessions
 *   - dedupe by id (keeps the first occurrence)
 *   - sort by coalesce(sharedAt, startedAt) desc, then id desc as a stable,
 *     deterministic tie-break
 * Never mutates the input array.
 */
export function rankFeed<T extends RankableSession>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const row of rows) {
    if (row.visibility !== "public") continue;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    deduped.push(row);
  }
  return deduped.sort((a, b) => {
    const diff = rankTime(b) - rankTime(a);
    if (diff !== 0) return diff;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}
