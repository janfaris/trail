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
  payload: RecapPayload;
  /** Title of the source session (pulse/project only). */
  sessionTitle?: string | null;
  /** Summary of the source session (pulse/project only). */
  sessionSummary?: string | null;
  /** Linked repo for verification, if any. */
  linkedRepo?: string | null;
}

export interface OneLinerResult {
  text: string | null;
  warnings: string[];
}

function compactContext(ctx: OneLinerContext): string {
  const p = ctx.payload;
  const lines: string[] = [];
  lines.push(`tier: ${p.tier}`);
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
  if (ctx.sessionTitle) lines.push(`session_title: ${ctx.sessionTitle}`);
  if (ctx.sessionSummary) lines.push(`session_summary: ${ctx.sessionSummary}`);
  if (ctx.linkedRepo) lines.push(`linked_repo: ${ctx.linkedRepo}`);
  return lines.join("\n");
}

function tierGuidance(tier: RecapPayload["tier"]): string {
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
