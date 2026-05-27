// Spend Audit — Layer 2 Pro feature. Single LLM call over the user's top
// expensive sessions, returns concrete $-saving findings.
//
// Caching: one row per (userId, windowDays, windowBucket=UTC-day). Same
// calendar day = same row. The unique index does double duty as the rate
// limiter for "1/24h" and the findings cache.
//
// Monthly cap: 10 rows in the trailing 30 days, counted in the route layer.
//
// Errors are a typed code so the API route can map them to status codes.

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { aiClient, textModel } from "@/lib/ai-client";
import { assembleBundle, scrubBundle, type Bundle } from "./audit-bundle";

export type AuditFinding = {
  title: string;
  severity: "low" | "medium" | "high";
  recommendation: string;
  estimatedMonthlySavingsUsd: number;
  evidenceEventIds?: string[];
};

export type AuditResult = {
  id: string;
  findings: AuditFinding[];
  totalPotentialSavingsUsd: number;
  auditCostUsd: number | null;
  generatedAt: Date;
  model: string;
  cached: boolean;
};

export class SpendAuditError extends Error {
  constructor(
    public readonly code:
      | "no_data"
      | "no_llm_configured"
      | "invalid_llm_response"
      | "anonymize_failed"
      | "monthly_cap_exceeded",
    public readonly details?: unknown,
  ) {
    super(code);
    this.name = "SpendAuditError";
  }
}

const FindingSchema = z.object({
  title: z.string().trim().min(1).max(200),
  severity: z.enum(["low", "medium", "high"]),
  recommendation: z.string().trim().min(1).max(2000),
  estimated_monthly_savings_usd: z.number().finite().nonnegative(),
  evidence_event_ids: z.array(z.string()).max(50).optional(),
});

const LlmResponseSchema = z.object({
  findings: z.array(FindingSchema).min(1).max(20),
  total_potential_savings_usd: z.number().finite().nonnegative(),
});

// Hardcoded pricing snapshot for the audit-cost ROI footnote. Unknown models
// fall through to `null` rather than guessing.
const PRICE_MAP: Record<string, { in: number; out: number; cached: number }> = {
  "gpt-5.5": { in: 5, out: 30, cached: 0.5 },
  "gpt-5.4-mini": { in: 0.15, out: 0.6, cached: 0.075 },
};

function rowToResult(row: typeof schema.spendAudit.$inferSelect, cached: boolean): AuditResult {
  return {
    id: row.id,
    findings: row.findings ?? [],
    totalPotentialSavingsUsd:
      row.totalPotentialSavingsUsd == null ? 0 : Number(row.totalPotentialSavingsUsd),
    auditCostUsd: row.auditCostUsd == null ? null : Number(row.auditCostUsd),
    generatedAt: row.generatedAt,
    model: row.model,
    cached,
  };
}

export async function getCachedAudit(
  userId: string,
  windowDays: 7 | 30 | 365,
): Promise<AuditResult | null> {
  const bucket = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(schema.spendAudit)
    .where(
      and(
        eq(schema.spendAudit.userId, userId),
        eq(schema.spendAudit.windowDays, windowDays),
        eq(schema.spendAudit.windowBucket, bucket),
      ),
    )
    .orderBy(desc(schema.spendAudit.generatedAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return rowToResult(row, true);
}

export async function getMonthlyAuditCount(userId: string): Promise<number> {
  const rows = await db
    .select({ c: count() })
    .from(schema.spendAudit)
    .where(
      and(
        eq(schema.spendAudit.userId, userId),
        gte(schema.spendAudit.generatedAt, sql`now() - interval '30 days'`),
      ),
    );
  return Number(rows[0]?.c ?? 0);
}

// Editable without redeploy — read at runtime, not import time.
async function loadAuditPrompt(): Promise<string> {
  // The receipt generator uses the same `process.cwd() + prompts/...` shape.
  const p = path.join(process.cwd(), "prompts", "spend-audit.md");
  return readFile(p, "utf8");
}

function computeAuditCost(
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } | undefined,
): number | null {
  const rates = PRICE_MAP[model];
  if (!rates || !usage) return null;
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const prompt = usage.prompt_tokens ?? 0;
  const uncachedInput = Math.max(0, prompt - cached);
  const output = usage.completion_tokens ?? 0;
  const cost =
    (uncachedInput / 1_000_000) * rates.in +
    (cached / 1_000_000) * rates.cached +
    (output / 1_000_000) * rates.out;
  if (!Number.isFinite(cost)) return null;
  return Math.round(cost * 10_000) / 10_000;
}

export async function runSpendAudit(
  userId: string,
  windowDays: 7 | 30 | 365,
): Promise<AuditResult> {
  const bucket = new Date().toISOString().slice(0, 10);

  const cached = await getCachedAudit(userId, windowDays);
  if (cached) return cached;

  const sessions = await assembleBundle(userId, windowDays, 10);
  if (sessions.length === 0) throw new SpendAuditError("no_data");

  const bundle: Bundle = { windowDays, sessions };
  let scrub;
  try {
    scrub = scrubBundle(bundle);
  } catch (err) {
    throw new SpendAuditError("anonymize_failed", (err as Error).message);
  }
  // Don't ship unknown high-entropy tokens to OpenAI even though the user
  // opted in. The named detectors cover known shapes; unnamed suspects could
  // still be credentials.
  if (scrub.redactionReport.suspectCount > 0) {
    throw new SpendAuditError("anonymize_failed", {
      reason: "entropy_suspects_present",
      suspectCount: scrub.redactionReport.suspectCount,
    });
  }

  const client = aiClient();
  if (!client) throw new SpendAuditError("no_llm_configured");

  const systemPrompt = await loadAuditPrompt();
  const model = textModel();

  const completion = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    max_completion_tokens: 4000,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Bundle:\n${scrub.scrubbedJson}` },
    ],
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) throw new SpendAuditError("invalid_llm_response", "empty content");

  let parsed: z.infer<typeof LlmResponseSchema>;
  try {
    const raw: unknown = JSON.parse(content);
    parsed = LlmResponseSchema.parse(raw);
  } catch (err) {
    throw new SpendAuditError("invalid_llm_response", (err as Error).message);
  }

  const findings: AuditFinding[] = parsed.findings.map((f) => ({
    title: f.title,
    severity: f.severity,
    recommendation: f.recommendation,
    estimatedMonthlySavingsUsd: f.estimated_monthly_savings_usd,
    evidenceEventIds: f.evidence_event_ids,
  }));

  const auditCostUsd = computeAuditCost(model, completion.usage ?? undefined);

  const id = randomUUID();
  // ON CONFLICT DO NOTHING covers the race where two same-day requests both
  // missed cache, both called the LLM, and both reached this point. Whichever
  // INSERT wins owns the row; the loser re-reads via getCachedAudit and
  // returns the winning result. Cost: one wasted LLM call.
  const insertResult = await db
    .insert(schema.spendAudit)
    .values({
      id,
      userId,
      windowDays,
      windowBucket: bucket,
      model,
      totalPotentialSavingsUsd: parsed.total_potential_savings_usd.toFixed(4),
      auditCostUsd: auditCostUsd == null ? null : auditCostUsd.toFixed(4),
      findings,
      redactionReport: scrub.redactionReport,
    })
    .onConflictDoNothing({
      target: [
        schema.spendAudit.userId,
        schema.spendAudit.windowDays,
        schema.spendAudit.windowBucket,
      ],
    })
    .returning();

  if (insertResult.length > 0) {
    return rowToResult(insertResult[0], false);
  }
  // Conflict — another request won the race. Re-read.
  const winner = await getCachedAudit(userId, windowDays);
  if (winner) return winner;
  // Shouldn't happen: conflict but no row visible.
  throw new SpendAuditError("invalid_llm_response", "race lost but no winning row");
}
