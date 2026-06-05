import { sql } from "drizzle-orm";

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
};

/**
 * Postgres-backed fixed-window rate limiter for authenticated social mutations.
 *
 * A single atomic `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` statement
 * increments the per-key counter; concurrent requests serialize on the bucket
 * row, so the returned count is exact. The window resets lazily when the stored
 * `window_start` is older than `windowSeconds`.
 *
 * Notes:
 * - Fixed-window means a caller can burst up to ~2x `limit` across a window
 *   boundary. That is acceptable for abuse mitigation at launch scale.
 * - Blocked attempts still increment the counter (failed attempts count against
 *   the abuse budget until the window expires).
 * - Fail-open: if the DB call throws, we allow the request rather than blocking
 *   legitimate traffic on infrastructure hiccups.
 */
export async function checkRateLimit({
  key,
  limit,
  windowSeconds,
}: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const { db } = await import("@/db/client");

  try {
    const res = await db.execute<{ count: number; window_start: string | Date }>(sql`
      INSERT INTO rate_limit_bucket (key, window_start, count)
      VALUES (${key}, now(), 1)
      ON CONFLICT (key) DO UPDATE SET
        count = CASE
          WHEN rate_limit_bucket.window_start < now() - make_interval(secs => ${windowSeconds})
          THEN 1
          ELSE rate_limit_bucket.count + 1
        END,
        window_start = CASE
          WHEN rate_limit_bucket.window_start < now() - make_interval(secs => ${windowSeconds})
          THEN now()
          ELSE rate_limit_bucket.window_start
        END
      RETURNING count, window_start
    `);

    const rows =
      (res as unknown as { rows?: { count: number; window_start: string | Date }[] }).rows ??
      (res as unknown as { count: number; window_start: string | Date }[]);
    const row = rows[0];
    const count = Number(row?.count ?? 1);
    const windowStart = row?.window_start ? new Date(row.window_start) : new Date();
    const resetAt = new Date(windowStart.getTime() + windowSeconds * 1000);

    return {
      ok: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  } catch {
    // Fail open — never block legitimate users because the limiter errored.
    return {
      ok: true,
      limit,
      remaining: limit,
      resetAt: new Date(Date.now() + windowSeconds * 1000),
    };
  }
}

/** Per-action limits, tuned generously to avoid false positives at launch. */
export const RATE_LIMITS = {
  reaction: { limit: 60, windowSeconds: 60 },
  comment: { limit: 15, windowSeconds: 60 },
  follow: { limit: 60, windowSeconds: 60 },
  buildPost: { limit: 10, windowSeconds: 600 },
  githubImport: { limit: 5, windowSeconds: 60 },
} as const;

export type RateLimitAction = keyof typeof RATE_LIMITS;

/** Convenience wrapper: enforce a named action limit for a given user id. */
export function limitAction(action: RateLimitAction, userId: string): Promise<RateLimitResult> {
  const { limit, windowSeconds } = RATE_LIMITS[action];
  return checkRateLimit({ key: `${action}:${userId}`, limit, windowSeconds });
}

/** Standard headers to attach to a 429 JSON response from an API route. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const retryAfter = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000));
  return {
    "Retry-After": String(retryAfter),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt.getTime() / 1000)),
  };
}
