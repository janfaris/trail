// Backfill recipe cards for trail_session rows where recipe_generated_at IS NULL.
// Idempotent — re-running skips already-populated rows.
//
// Usage:
//   pnpm -F @trail/web run recipes:backfill
//
// Requires DATABASE_URL and (AZURE_OPENAI_API_KEY|OPENAI_API_KEY) in env.

import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

// Imported AFTER env is loaded so db/client.ts sees DATABASE_URL.
const { db, schema } = await import("../db/client");
const { generateRecipe } = await import("../lib/recipe-gen");
const { isNull } = await import("drizzle-orm");

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main() {
  const rows = await db
    .select({ id: schema.trailSession.id, slug: schema.trailSession.slug })
    .from(schema.trailSession)
    .where(isNull(schema.trailSession.recipeGeneratedAt));

  console.log(`[recipes:backfill] found ${rows.length} sessions to process`);

  let done = 0;
  for (const row of rows) {
    done += 1;
    console.log(`[recipes:backfill] (${done}/${rows.length}) ${row.slug} (${row.id})`);
    await generateRecipe(row.id);
    await sleep(500);
  }

  console.log(`[recipes:backfill] complete — processed ${rows.length} sessions`);
}

main().catch((err) => {
  console.error("[recipes:backfill] fatal", err);
  process.exit(1);
});
