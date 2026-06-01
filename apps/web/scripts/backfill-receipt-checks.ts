// Backfill GPT-5.4-mini receipt checks for public receipts.
//
// Dry-run by default:
//   pnpm -F @trail/web run receipt-checks:backfill -- --limit=10
//
// Apply:
//   pnpm -F @trail/web run receipt-checks:backfill -- --apply --limit=10

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnv({ path: path.join(__dirname, "..", ".env.local") });
if (!process.env.DATABASE_URL) {
  loadEnv({ path: path.join(__dirname, "..", "..", "..", ".env.local") });
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set");
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function optionValue(name: string, fallback: string): string {
  const prefix = `${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

async function main() {
  const { db, schema } = await import("../db/client");
  const { generateReceiptAiReview } = await import("../lib/receipt-ai-review");
  const { and, desc, eq, isNotNull, isNull } = await import("drizzle-orm");
  const apply = process.argv.includes("--apply");
  const limit = Math.min(Math.max(Number(optionValue("--limit", "10")) || 10, 1), 100);

  const rows = await db
    .select({
      id: schema.trailSession.id,
      slug: schema.trailSession.slug,
      sharedAt: schema.trailSession.sharedAt,
    })
    .from(schema.trailSession)
    .where(
      and(
        eq(schema.trailSession.visibility, "public"),
        isNotNull(schema.trailSession.sharedAt),
        isNotNull(schema.trailSession.receiptGeneratedAt),
        isNull(schema.trailSession.redactedAt),
        isNull(schema.trailSession.receiptAiReviewGeneratedAt),
      ),
    )
    .orderBy(desc(schema.trailSession.sharedAt))
    .limit(limit);

  const mode = apply ? "apply" : "dry-run";
  console.log(`[receipt-checks:backfill] ${mode}; found ${rows.length} receipts (limit ${limit})`);

  if (!apply) {
    for (const row of rows) {
      console.log(`[receipt-checks:backfill] would check ${row.slug} (${row.id})`);
    }
    return;
  }

  let succeeded = 0;
  for (const [index, row] of rows.entries()) {
    console.log(`[receipt-checks:backfill] (${index + 1}/${rows.length}) ${row.slug} (${row.id})`);
    const result = await generateReceiptAiReview(row.id);
    if (result.ok) {
      succeeded += 1;
      console.log(`[receipt-checks:backfill] ok ${row.slug}`);
    } else {
      console.error(
        `[receipt-checks:backfill] failed ${row.slug}: ${result.message ?? result.reason}`,
      );
    }
    await sleep(500);
  }

  console.log(`[receipt-checks:backfill] complete; succeeded ${succeeded}/${rows.length}`);
}

main().catch((err) => {
  console.error("[receipt-checks:backfill] fatal", err);
  process.exit(1);
});
