// Local backfill for trail_session.languages + duration_seconds.
// Mirrors /api/admin/backfill-metrics but runs against DATABASE_URL.
// Prefer the remote route when local env is unreliable.

import { neon } from "@neondatabase/serverless";
import { extractLanguages, computeDurationSeconds } from "../lib/session-metrics.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not found in env. Use the /api/admin/backfill-metrics route instead.");
  process.exit(1);
}
const sql = neon(url);

const rows = await sql`SELECT id, started_at, ended_at FROM trail_session WHERE languages IS NULL OR duration_seconds IS NULL`;
console.log(`scanning ${rows.length} sessions`);

let updated = 0;
for (const r of rows) {
  const events = await sql`SELECT kind, at, data FROM event WHERE session_id = ${r.id} ORDER BY idx ASC`;
  const ev = events.map((e) => ({ kind: e.kind, payload: e.data, at: e.at }));
  const langs = extractLanguages(ev);
  const dur = computeDurationSeconds(
    r.started_at ? new Date(r.started_at) : null,
    r.ended_at ? new Date(r.ended_at) : null,
    ev,
  );
  const langsJson = Object.keys(langs).length > 0 ? JSON.stringify(langs) : null;
  await sql`UPDATE trail_session SET languages = ${langsJson}, duration_seconds = ${dur} WHERE id = ${r.id}`;
  updated++;
  if (updated % 10 === 0) console.log(`  ${updated}/${rows.length}`);
}
console.log(`done. updated=${updated}`);
