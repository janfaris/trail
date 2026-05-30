// Backfill the session_tag corpus from each session's existing LLM taxonomy
// (trail_session.tool / tools_used / frameworks / models). This is the
// re-runnable, idempotent path: for every session we delete its existing tags
// and reinsert the freshly projected set, so re-processing after a taxonomy or
// alias-map change never leaves stale rows.
//
// Usage:
//   pnpm -F @trail/web run tags:backfill
//
// Requires DATABASE_URL in env (apps/web/.env.local or repo-root .env.local).

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try apps/web/.env.local first, then repo root .env.local.
loadEnv({ path: path.join(__dirname, "..", ".env.local") });
if (!process.env.DATABASE_URL) {
  loadEnv({ path: path.join(__dirname, "..", "..", "..", ".env.local") });
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set");
}

async function main() {
  // Imported AFTER env is loaded so db/client.ts sees DATABASE_URL.
  const { db, schema } = await import("../db/client");
  const { extractSessionTags } = await import("../lib/tags");
  const { eq } = await import("drizzle-orm");
  const { randomUUID } = await import("node:crypto");

  const rows = await db
    .select({
      id: schema.trailSession.id,
      slug: schema.trailSession.slug,
      tool: schema.trailSession.tool,
      toolsUsed: schema.trailSession.toolsUsed,
      frameworks: schema.trailSession.frameworks,
      models: schema.trailSession.models,
    })
    .from(schema.trailSession);

  console.log(`[tags:backfill] found ${rows.length} sessions`);

  let processed = 0;
  let inserted = 0;
  for (const row of rows) {
    processed += 1;
    const tags = extractSessionTags({
      tool: row.tool,
      toolsUsed: (row.toolsUsed as string[] | null) ?? null,
      frameworks: (row.frameworks as string[] | null) ?? null,
      models: (row.models as string[] | null) ?? null,
    });

    // Delete + reinsert per session. Idempotent: re-running yields the same
    // rows. The neon-http driver has no transaction support, so these run
    // sequentially — acceptable for a backfill (a session briefly tag-less
    // between the two statements only matters if the process dies mid-row, and
    // re-running the script repairs it).
    await db.delete(schema.sessionTag).where(eq(schema.sessionTag.sessionId, row.id));
    if (tags.length > 0) {
      await db.insert(schema.sessionTag).values(
        tags.map((t) => ({
          id: randomUUID(),
          sessionId: row.id,
          tag: t.tag,
          label: t.label,
          kind: t.kind,
          confidence: t.confidence.toFixed(3),
          source: t.source,
        })),
      );
    }
    inserted += tags.length;

    if (processed % 50 === 0 || processed === rows.length) {
      console.log(`[tags:backfill] (${processed}/${rows.length}) ${inserted} tags so far`);
    }
  }

  console.log(`[tags:backfill] done — ${processed} sessions, ${inserted} tags`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
