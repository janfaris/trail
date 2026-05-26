// Task 1.2 — seed apps/web/model_price with the 2026-05 pricing snapshot for
// every vendor/model we currently surface in receipts. Idempotent via
// onConflictDoUpdate on id, so re-running just refreshes the rate columns.
//
// Usage (from apps/web):
//   npx tsx scripts/seed-model-prices.ts

import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnv({ path: path.join(__dirname, "..", "..", "..", ".env.local") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set");
}

import { db } from "@/db/client";
import { modelPrice } from "@/db/schema";
import { sql } from "drizzle-orm";

const EFFECTIVE_FROM = new Date("2026-05-01T00:00:00Z");

const ANTHROPIC_PRICING = "https://www.anthropic.com/pricing";
const OPENAI_PRICING = "https://openai.com/api/pricing/";
const CURSOR_PRICING = "https://cursor.com/pricing"; // cursor pricing page snapshot 2026-05
const COPILOT_PRICING = "https://github.com/features/copilot/plans";

type SeedRow = {
  vendor: string;
  modelId: string;
  in: string;
  out: string;
  cachedIn: string | null;
  source: string;
};

const rows: SeedRow[] = [
  { vendor: "anthropic", modelId: "claude-opus-4-5",    in: "15",   out: "75",  cachedIn: "1.5",   source: ANTHROPIC_PRICING },
  { vendor: "anthropic", modelId: "claude-sonnet-4-5",  in: "3",    out: "15",  cachedIn: "0.3",   source: ANTHROPIC_PRICING },
  { vendor: "anthropic", modelId: "claude-haiku-4-5",   in: "0.25", out: "1.25",cachedIn: "0.03",  source: ANTHROPIC_PRICING },
  { vendor: "openai",    modelId: "gpt-4o",             in: "2.50", out: "10",  cachedIn: "1.25",  source: OPENAI_PRICING },
  { vendor: "openai",    modelId: "gpt-4o-mini",        in: "0.15", out: "0.60",cachedIn: "0.075", source: OPENAI_PRICING },
  { vendor: "openai",    modelId: "o1",                 in: "15",   out: "60",  cachedIn: "7.50",  source: OPENAI_PRICING },
  { vendor: "openai",    modelId: "o1-mini",            in: "3",    out: "12",  cachedIn: "1.50",  source: OPENAI_PRICING },
  { vendor: "cursor",    modelId: "composer-1",         in: "1.25", out: "5",   cachedIn: null,    source: `${CURSOR_PRICING} (cursor pricing page snapshot 2026-05)` },
  { vendor: "copilot",   modelId: "gpt-4o",             in: "2.50", out: "10",  cachedIn: "1.25",  source: COPILOT_PRICING },
  { vendor: "copilot",   modelId: "claude-sonnet-4-5",  in: "3",    out: "15",  cachedIn: "0.3",   source: COPILOT_PRICING },
];

async function main() {
  let touched = 0;
  for (const r of rows) {
    const id = `${r.vendor}:${r.modelId}:2026-05`;
    await db
      .insert(modelPrice)
      .values({
        id,
        vendor: r.vendor,
        modelId: r.modelId,
        inUsdPerMtok: r.in,
        outUsdPerMtok: r.out,
        cachedInUsdPerMtok: r.cachedIn,
        effectiveFrom: EFFECTIVE_FROM,
        effectiveTo: null,
        source: r.source,
      })
      .onConflictDoUpdate({
        target: modelPrice.id,
        set: {
          vendor: sql`excluded.vendor`,
          modelId: sql`excluded.model_id`,
          inUsdPerMtok: sql`excluded.in_usd_per_mtok`,
          outUsdPerMtok: sql`excluded.out_usd_per_mtok`,
          cachedInUsdPerMtok: sql`excluded.cached_in_usd_per_mtok`,
          effectiveFrom: sql`excluded.effective_from`,
          effectiveTo: sql`excluded.effective_to`,
          source: sql`excluded.source`,
        },
      });
    touched += 1;
  }
  console.log(`seeded ${touched} rows`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
