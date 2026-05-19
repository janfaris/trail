import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import {
  extractToolCallCounts,
  countDistinctFiles,
  countPrompts,
  countFailedToolCalls,
} from "@/lib/session-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-shot backfill for tier-2 session metrics. Deleted after use.

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }
  const sql = neon(databaseUrl);

  const sessions = await sql(`
    SELECT id FROM trail_session
    WHERE tool_call_counts IS NULL OR prompt_count IS NULL
  `) as Array<{ id: string }>;

  const samples: Array<Record<string, unknown>> = [];
  let updated = 0;

  for (const row of sessions) {
    const events = await sql(
      `SELECT kind, data FROM event WHERE session_id = $1 ORDER BY idx`,
      [row.id],
    ) as Array<{ kind: string; data: unknown }>;
    const ev = events.map((e) => ({ kind: e.kind, payload: e.data }));
    const tcc = extractToolCallCounts(ev);
    const df = countDistinctFiles(ev);
    const pc = countPrompts(ev);
    const ftc = countFailedToolCalls(ev);
    const tccJson = Object.keys(tcc).length > 0 ? JSON.stringify(tcc) : null;
    await sql(
      `UPDATE trail_session
         SET tool_call_counts = $1::jsonb,
             distinct_files = $2,
             prompt_count = $3,
             failed_tool_calls = $4
       WHERE id = $5`,
      [tccJson, df, pc, ftc, row.id],
    );
    updated++;
    if (samples.length < 3) {
      samples.push({
        id: row.id,
        tool_call_counts: tcc,
        distinct_files: df,
        prompt_count: pc,
        failed_tool_calls: ftc,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: sessions.length,
    updated,
    samples,
  });
}
