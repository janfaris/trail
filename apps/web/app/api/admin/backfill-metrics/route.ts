import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { extractLanguages, computeDurationSeconds } from "@/lib/session-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-shot backfill for trail_session.languages + duration_seconds.
// Loads each session's events, computes both, UPDATEs in place. Idempotent
// (only touches rows where either field is NULL).

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET missing" }, { status: 500 });
  const a = req.headers.get("authorization") ?? "";
  if (a !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return NextResponse.json({ error: "DATABASE_URL missing" }, { status: 500 });
  const sql = neon(databaseUrl);

  const rows = (await sql(
    `SELECT id, started_at, ended_at FROM trail_session
     WHERE languages IS NULL OR duration_seconds IS NULL`,
  )) as Array<{ id: string; started_at: string; ended_at: string | null }>;

  let updated = 0;
  const samples: Array<{ id: string; languages: Record<string, number>; durationSeconds: number | null }> = [];
  for (const r of rows) {
    const events = (await sql(
      `SELECT kind, at, data FROM event WHERE session_id = $1 ORDER BY idx ASC`,
      [r.id],
    )) as Array<{ kind: string; at: string; data: unknown }>;

    // event.data holds the raw event payload (kind/at/name/args/...)
    const ev = events.map((e) => ({ kind: e.kind, payload: e.data, at: e.at }));
    const languages = extractLanguages(ev);
    const dur = computeDurationSeconds(
      r.started_at ? new Date(r.started_at) : null,
      r.ended_at ? new Date(r.ended_at) : null,
      ev,
    );
    const langs = Object.keys(languages).length > 0 ? languages : null;
    await sql(
      `UPDATE trail_session SET languages = $1, duration_seconds = $2 WHERE id = $3`,
      [langs ? JSON.stringify(langs) : null, dur, r.id],
    );
    updated++;
    if (samples.length < 3) samples.push({ id: r.id, languages: languages, durationSeconds: dur });
  }

  return NextResponse.json({ ok: true, scanned: rows.length, updated, samples });
}
