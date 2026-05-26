/**
 * Generate the LLM one-liner for a Recap.
 *
 * Best-effort: returns null if no AI client is configured, so the recap
 * still ships with stat-only headline. Validator warnings are diagnostic
 * only — we never regex-rewrite the LLM output.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { aiClient, textModel } from "@/lib/ai-client";
import { validateOneLiner } from "./one-liner-validator";
import type { RecapPayload } from "./aggregate";
import type { CostAggregateOutput, CostTier } from "./cost-aggregate";

const TONE_SPEC_PATH = path.join(process.cwd(), "prompts", "recap-tone-spec.md");

let _toneSpecCache: string | null = null;
async function loadToneSpec(): Promise<string> {
  if (_toneSpecCache) return _toneSpecCache;
  try {
    _toneSpecCache = await fs.readFile(TONE_SPEC_PATH, "utf8");
  } catch {
    _toneSpecCache = "";
  }
  return _toneSpecCache;
}

export interface OneLinerContext {
  /**
   * Either a classic RecapPayload (pulse/weekly/...) or a CostAggregateOutput
   * (cost-pulse/cost-weekly/...). Discriminated by the inner `tier` string —
   * see isCostPayload() below.
   */
  payload: RecapPayload | CostAggregateOutput;
  /** Title of the source session (pulse/project/cost-pulse). */
  sessionTitle?: string | null;
  /** Summary of the source session (pulse/project/cost-pulse). */
  sessionSummary?: string | null;
  /** Linked repo for verification, if any. */
  linkedRepo?: string | null;
}

function isCostPayload(
  p: RecapPayload | CostAggregateOutput,
): p is CostAggregateOutput {
  // Both shapes carry a `tier` and a `v` field, but only the cost payload
  // carries `metrics`. Keying the guard on a structural field rather than
  // the tier string keeps it resilient to typos.
  return "metrics" in p && "breakdown" in p;
}

function fmtUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  // Compact representation for the LLM context — 4 decimals is enough signal
  // and keeps tiny costs visible. The validator + tone-spec take care of the
  // human formatting in the final one-liner.
  return n.toFixed(4);
}

export interface OneLinerResult {
  text: string | null;
  warnings: string[];
}

function compactContext(ctx: OneLinerContext): string {
  const p = ctx.payload;
  const lines: string[] = [];
  lines.push(`tier: ${p.tier}`);

  if (isCostPayload(p)) {
    const m = p.metrics;
    lines.push(`shipped_prs: ${m.shippedPrCount}`);
    lines.push(`total_cost_usd: ${fmtUsd(m.totalCostUsd)}`);
    if (m.avgCostPerPrUsd != null) {
      lines.push(`cost_per_pr_usd: ${fmtUsd(m.avgCostPerPrUsd)}`);
    }
    if (m.medianCostPerPrUsd != null) {
      lines.push(`median_cost_per_pr_usd: ${fmtUsd(m.medianCostPerPrUsd)}`);
    }
    if (m.topModelByCost) {
      lines.push(
        `top_model: ${m.topModelByCost.model} (${m.topModelByCost.vendor}, $${fmtUsd(m.topModelByCost.costUsd)})`,
      );
    }
    if (m.topVendorByCost) {
      lines.push(
        `top_vendor: ${m.topVendorByCost.vendor} ($${fmtUsd(m.topVendorByCost.costUsd)})`,
      );
    }
    if (m.mostExpensivePr) {
      lines.push(
        `most_expensive_pr: ${m.mostExpensivePr.title ?? m.mostExpensivePr.prUrl} ($${fmtUsd(m.mostExpensivePr.costUsd)})`,
      );
    }
    if (m.unattributedCostUsd > 0.5) {
      lines.push(`unattributed_cost_usd: ${fmtUsd(m.unattributedCostUsd)}`);
    }
  } else {
    lines.push(`sessions: ${p.sessionCount}`);
    lines.push(`shipped: ${p.shippedCount}`);
    if (p.totalSeconds > 0) {
      lines.push(`total_minutes: ${Math.round(p.totalSeconds / 60)}`);
    }
    if (p.topModels.length > 0) {
      lines.push(`models: ${p.topModels.map((m) => m.name).join(", ")}`);
    }
    if (p.topTools.length > 0) {
      lines.push(`tools: ${p.topTools.map((t) => t.name).join(", ")}`);
    }
    if (p.topFrameworks.length > 0) {
      lines.push(`frameworks: ${p.topFrameworks.map((f) => f.name).join(", ")}`);
    }
    if (p.topRepos.length > 0) {
      lines.push(`repos: ${p.topRepos.map((r) => r.name).join(", ")}`);
    }
  }

  if (ctx.sessionTitle) lines.push(`session_title: ${ctx.sessionTitle}`);
  if (ctx.sessionSummary) lines.push(`session_summary: ${ctx.sessionSummary}`);
  if (ctx.linkedRepo) lines.push(`linked_repo: ${ctx.linkedRepo}`);
  return lines.join("\n");
}

function tierGuidance(tier: RecapPayload["tier"] | CostTier | string): string {
  switch (tier) {
    case "pulse":
      return "This is a Pulse Recap — one shipped session. Refer to the work in the past tense. The session title and summary are your strongest source of specifics.";
    case "project":
      return "This is a Project Recap — the client-facing version of the work. Lead with the outcome. Reference the linked repo or files if available.";
    case "weekly":
      return "This is a Weekly Recap. Summarize the week, but pick ONE concrete thing to lead with — not a list.";
    case "monthly":
      return "This is a Monthly Recap. Pick the most interesting fight or ship of the month and lead with it.";
    case "wrapped":
      return "This is the annual Wrapped Recap. One sentence. The year in one specific image, not a summary.";
    case "cost-pulse":
      return "This is a Cost-Pulse Recap — one shipped PR with its real dollar cost. Mention the cost-per-PR figure and the dominant model. Past tense. Factual. No hype.";
    case "cost-weekly":
      return "This is a Cost-Weekly Recap — what the week of shipped PRs actually cost. Lead with a concrete $/PR number and the dominant model. Past tense. No editorializing.";
    case "cost-monthly":
      return "This is a Cost-Monthly Recap. Pick the most expensive shipped PR and the dominant model, and frame it as a $/PR number across the month. Past tense.";
    case "cost-project":
      return "This is a Cost-Project Recap — total dollars spent shipping a single project. Lead with the total cost and the dominant model.";
    default:
      return "Write a single-sentence recap in the tone above.";
  }
}

export async function generateOneLiner(
  ctx: OneLinerContext,
): Promise<OneLinerResult> {
  const client = aiClient();
  if (!client) return { text: null, warnings: ["no-ai-client"] };

  const toneSpec = await loadToneSpec();
  const system = [
    "You write one-line summaries (\"one-liners\") for developer Recaps shared on X and LinkedIn.",
    "",
    "Output ONLY the one-liner. No quotes. No prefix. No explanation. No trailing newline.",
    "",
    "Follow this tone spec exactly:",
    "",
    toneSpec,
    "",
    tierGuidance(ctx.payload.tier),
  ].join("\n");

  const user = [
    "Write the one-liner for this Recap.",
    "",
    "Recap data:",
    compactContext(ctx),
  ].join("\n");

  try {
    const completion = await client.chat.completions.create({
      model: textModel(),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const content = completion.choices?.[0]?.message?.content?.trim();
    if (!content) return { text: null, warnings: ["no-llm-content"] };

    // Strip surrounding quotes if the LLM added them despite instructions.
    const stripped = content
      .replace(/^["'`]+/, "")
      .replace(/["'`]+$/, "")
      .trim();

    const { warnings } = validateOneLiner(stripped);
    return { text: stripped, warnings };
  } catch (err) {
    return {
      text: null,
      warnings: ["llm-error: " + (err instanceof Error ? err.message : String(err))],
    };
  }
}
