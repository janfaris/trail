import { readFile } from "node:fs/promises";
import path from "node:path";

const TONE_SPEC_PATH = path.join(process.cwd(), "prompts", "receipt-tone-spec.md");

const FALLBACK_TONE_SPEC =
  "Receipts are read by paying clients. Plain, specific, past tense. No marketing.";

export async function loadToneSpec(): Promise<string> {
  try {
    return await readFile(TONE_SPEC_PATH, "utf8");
  } catch {
    return FALLBACK_TONE_SPEC;
  }
}

export function buildReceiptSystemPrompt(toneSpec: string): string {
  return `You generate Trail receipts: concise, verified summaries clients trust.

TONE SPEC (binding — follow every rule):
${toneSpec}

OUTPUT FORMAT (return strictly valid JSON, no prose, no markdown):
{
  "outcome": string,          // 1-2 sentences. The shipped artifact, past tense.
  "tldr": string,             // <=140 chars. Single sentence client-skim summary.
  "decisionSummary": string[],// 3-6 concrete decisions/tradeoffs. Each <=200 chars.
  "changedFiles": string[],   // file paths touched, max 20. Empty if unknown.
  "keyPromptIdxs": number[]   // 3-5 idx values of pivotal prompt events
}

Rules:
- Reference real files/commits seen in the transcript. Never hand-wave.
- If verification (merged commit) is missing, do NOT claim the work shipped.
- All idxs must come from the transcript.`;
}
