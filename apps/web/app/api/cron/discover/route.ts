import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Trending discovery feed refresher. Invoked by Vercel Cron daily at 06:00 UTC
// (see vercel.json). Computes a score per shared session and persists the top
// 50 into discover_feed for fast O(1) read on /discover + the homepage.
//
// Score formula:
//   score = log10(event_count + 1) * exp(-days_since_shared / 14)
//
// - log10(event_count+1) favors substantive sessions (a 100-event session
//   scores 2.0; a 1-event session scores ~0.3).
// - exp(-d/14) is recency decay with a ~2-week half-life-ish.
// - No view-tracking yet (no analytics installed), so views are dropped from
//   v0.1. Add a third term when analytics lands.
// - No clustering in v0.1 — just global ranking. When corpus > ~500 sessions,
//   layer k-means over pgvector embeddings to diversify topics.

const SCORE_SQL = `
  SELECT slug,
         log(event_count + 1)
           * exp(-extract(epoch from (now() - shared_at)) / 86400.0 / 14.0)
           AS score
  FROM trail_session
  WHERE shared_at IS NOT NULL
  ORDER BY score DESC
  LIMIT 50
`;

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
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
    const scores = rows.map((r) => Number(r.score).toFixed(4));
    await sql(
      `INSERT INTO discover_feed (slug, rank, score)
       SELECT * FROM unnest($1::text[], $2::int[], $3::numeric[])`,
      [slugs, ranks, scores],
    );
  }

  return NextResponse.json({
    refreshed: rows.length,
    top: rows.slice(0, 3).map((r) => r.slug),
  });
}
