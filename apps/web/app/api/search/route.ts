import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { generateSessionEmbedding, toVectorLiteral } from "@/lib/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SearchHit {
  slug: string;
  handle: string;
  title: string;
  summary: string | null;
  score: number;
  tool: string;
  eventCount: number;
  startedAt: string;
}

const TOP_VECTOR = 20;
const TOP_FINAL = 10;

function bad(msg: string, code = 400) {
  return NextResponse.json({ error: msg }, { status: code, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (!q) return bad("missing q");
  if (q.length > 500) return bad("q too long");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return bad("server misconfigured", 500);
  const sql = neon(databaseUrl);

  // Embed the query — title-only-ish, no prompts.
  const queryVec = await generateSessionEmbedding(q, "", []);

  type Row = {
    id: string;
    slug: string;
    handle: string;
    title: string | null;
    summary: string | null;
    tool: string;
    event_count: number;
    started_at: Date;
    score: number;
  };

  let vectorRows: Row[] = [];
  if (queryVec) {
    const lit = toVectorLiteral(queryVec);
    vectorRows = (await sql`
      SELECT ts.id, ts.slug, u.handle AS handle, ts.title, ts.summary,
             ts.tool, ts.event_count, ts.started_at,
             1 - (ts.embedding <=> ${lit}::vector) AS score
      FROM trail_session ts
      JOIN "user" u ON u.id = ts.user_id
      WHERE ts.embedding IS NOT NULL AND u.handle IS NOT NULL
      ORDER BY ts.embedding <=> ${lit}::vector
      LIMIT ${TOP_VECTOR}
    `) as Row[];
  }

  // ILIKE fallback / boost on title + summary. Score = 0.5 floor for literal hits.
  const ilikeQ = `%${q}%`;
  const literalRows = (await sql`
    SELECT ts.id, ts.slug, u.handle AS handle, ts.title, ts.summary,
           ts.tool, ts.event_count, ts.started_at,
           0.5::float AS score
    FROM trail_session ts
    JOIN "user" u ON u.id = ts.user_id
    WHERE u.handle IS NOT NULL
      AND (ts.title ILIKE ${ilikeQ} OR ts.summary ILIKE ${ilikeQ})
    LIMIT ${TOP_VECTOR}
  `) as Row[];

  // Merge dedupe by id, keep max score.
  const byId = new Map<string, Row>();
  for (const r of [...vectorRows, ...literalRows]) {
    const prev = byId.get(r.id);
    if (!prev || r.score > prev.score) byId.set(r.id, r);
  }
  const merged = Array.from(byId.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_FINAL);

  const hits: SearchHit[] = merged.map((r) => ({
    slug: r.slug,
    handle: r.handle,
    title: r.title || r.slug,
    summary: r.summary,
    score: Number(r.score.toFixed(4)),
    tool: r.tool,
    eventCount: r.event_count,
    startedAt: new Date(r.started_at).toISOString(),
  }));

  return NextResponse.json(
    { query: q, results: hits },
    { headers: { "Cache-Control": "no-store" } },
  );
}
