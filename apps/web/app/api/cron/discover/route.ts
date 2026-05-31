import { neon } from "@neondatabase/serverless";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Trending discovery feed refresher. Invoked by Vercel Cron daily at 06:00 UTC
// (see vercel.json). Computes a score per explicitly shared public receipt and
// persists the top 50 into discover_feed for fast O(1) reads.
//
// Score formula:
//   score = ln(event_count + 1) * exp(-days_since_shared / 14)
//           + recent social activity + shipped outcome bonus
//
// - ln(event_count+1) favors substantive sessions.
// - exp(-d/14) is recency decay with a ~2-week half-life-ish.
// - Recent reactions/comments add social proof velocity without view tracking.
// - Slugs are currently user-scoped, so the query dedupes by slug before insert
//   until discover_feed is keyed by session_id or (user_id, slug).

const SCORE_SQL = `
  WITH eligible AS (
    SELECT
      ts.slug,
      (
        ln(ts.event_count + 1)
          * exp(-extract(epoch from (now() - ts.shared_at)) / 86400.0 / 14.0)
        + count(distinct sr.id) * 0.45
        + count(distinct sc.id) * 0.75
        + case when ts.receipt_status = 'shipped' or ts.outcome = 'shipped' then 1.25 else 0 end
      ) AS score
    FROM trail_session ts
    LEFT JOIN session_reaction sr
      ON sr.session_id = ts.id
     AND sr.created_at >= now() - interval '30 days'
    LEFT JOIN session_comment sc
      ON sc.session_id = ts.id
     AND sc.deleted_at IS NULL
     AND sc.created_at >= now() - interval '30 days'
    WHERE ts.visibility = 'public'
      AND ts.shared_at IS NOT NULL
      AND ts.shared_at >= now() - interval '120 days'
      AND ts.event_count > 0
    GROUP BY ts.id, ts.slug, ts.event_count, ts.shared_at, ts.receipt_status, ts.outcome
  ),
  deduped AS (
    SELECT DISTINCT ON (slug) slug, score
    FROM eligible
    WHERE score > 0
    ORDER BY slug, score DESC
  )
  SELECT slug, score
  FROM deduped
  ORDER BY score DESC
  LIMIT 50
`;

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) return unauthorized();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }
  const sql = neon(databaseUrl);

  // neon-http doesn't expose multi-statement transactions cleanly; run as
  // discrete statements. TRUNCATE + INSERT is fine because reads use the
  // index by rank and the gap is sub-second.
  const rows = (await sql(SCORE_SQL)) as Array<{ slug: string; score: number }>;

  await sql("TRUNCATE TABLE discover_feed");

  if (rows.length > 0) {
    const slugs = rows.map((r) => r.slug);
    const ranks = rows.map((_, i) => i + 1);
    const scores = rows.map((r) => Number(r.score ?? 0).toFixed(4));
    await sql(
      `INSERT INTO discover_feed (slug, rank, score)
       SELECT * FROM unnest($1::text[], $2::int[], $3::numeric[])
       ON CONFLICT (slug) DO UPDATE SET
         rank = excluded.rank,
         score = excluded.score,
         refreshed_at = now()`,
      [slugs, ranks, scores],
    );
  }

  return NextResponse.json({
    refreshed: rows.length,
    top: rows.slice(0, 3).map((r) => r.slug),
  });
}
