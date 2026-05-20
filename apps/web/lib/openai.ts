import { z } from "zod";
import { aiClient, textModel } from "./ai-client";

export const SessionMetaSchema = z.object({
  title: z.string().max(80),
  summary: z.string().max(300),
});

export type SessionMeta = z.infer<typeof SessionMetaSchema>;

const SYSTEM_PROMPT = `You generate concise metadata for a developer's AI coding/research session.

Return JSON with:
- title: <=70 chars, sentence case, no quotes, no trailing period. Capture the user's actual goal or outcome (not a literal paraphrase of the first prompt). Examples: "Lupa pricing market research", "Cursor parser implementation for Trail".
- summary: 2 sentences, ~200 chars total. Past tense. What the user was trying to do + what was accomplished or decided. No emoji, no marketing speak, no "AI-assisted" filler.`;

const JSON_SCHEMA = {
  name: "session_meta",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string", maxLength: 80 },
      summary: { type: "string", maxLength: 300 },
    },
    required: ["title", "summary"],
  },
} as const;

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}

export async function generateSessionMeta(
  prompts: string[],
  lastEventKinds: string[],
): Promise<SessionMeta | null> {
  const c = aiClient();
  if (!c) return null;

  const model = textModel();
  const promptBlock = prompts
    .slice(0, 3)
    .map((p, i) => `Prompt ${i + 1}:\n${truncate(p, 1200)}`)
    .join("\n\n");
  const tailBlock = lastEventKinds.slice(-3).join(", ") || "(none)";

  const userMsg = `User prompts:\n${promptBlock || "(none)"}\n\nLast event kinds: ${tailBlock}`;

  try {
    const res = await c.chat.completions.create({
      model,
      temperature: 0.4,
      max_completion_tokens: 300,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
      response_format: { type: "json_schema", json_schema: JSON_SCHEMA },
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = SessionMetaSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return parsed.data;
  } catch (err) {
    console.error("[openai.generateSessionMeta] failed:", (err as Error).message);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Sensitive-content flag — second LLM pass on the already-scrubbed payload.
// Defense-in-depth on top of regex detectors + entropy guard. The model is
// asked to call this out conservatively; we accept some false positives
// because the consequence is a "pending review" state, not a deletion.
// ──────────────────────────────────────────────────────────────────────────

const FLAG_SYSTEM = `You are a content-safety checker for a developer session-sharing platform.

Inspect the JSON sample (already passed through regex-based redaction).
Decide whether it STILL contains anything that looks like:
- credentials, API keys, secrets, tokens, passwords (regex may have missed novel formats)
- personally-identifying info: full real names + employer, phone numbers, home addresses
- proprietary code with NDA-shaped markers ("internal use only", "confidential", customer DBs by name)
- private internal URLs / hostnames not caught by *.internal / *.local

Be conservative — only flag if a reasonable security reviewer would block the share.
Return JSON {"has_sensitive": boolean, "reasons": ["short reason", ...]}.
If has_sensitive=false, reasons MUST be empty.`;

const FLAG_SCHEMA = {
  name: "sensitive_flag",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      has_sensitive: { type: "boolean" },
      reasons: {
        type: "array",
        items: { type: "string", maxLength: 200 },
        maxItems: 6,
      },
    },
    required: ["has_sensitive", "reasons"],
  },
} as const;

export const SensitiveFlagSchema = z.object({
  has_sensitive: z.boolean(),
  reasons: z.array(z.string()).max(6),
});
export type SensitiveFlag = z.infer<typeof SensitiveFlagSchema>;

/**
 * Best-effort content flag. Returns null if the model is unreachable so the
 * caller can fall back to "publish-anyway" without a hard outage. A real
 * `has_sensitive=true` MUST gate the upload server-side.
 */
export async function flagSensitive(payload: unknown): Promise<SensitiveFlag | null> {
  const c = aiClient();
  if (!c) return null;
  const model = textModel();

  // Cap payload at ~12k chars to bound cost. We trim from the middle so the
  // first/last events (which usually carry the most identifying context)
  // both stay in view.
  const serialized = JSON.stringify(payload);
  const sample =
    serialized.length <= 12000
      ? serialized
      : serialized.slice(0, 6000) + "\n…[trimmed]…\n" + serialized.slice(-6000);

  try {
    const res = await c.chat.completions.create({
      model,
      temperature: 0,
      max_completion_tokens: 400,
      messages: [
        { role: "system", content: FLAG_SYSTEM },
        { role: "user", content: sample },
      ],
      response_format: { type: "json_schema", json_schema: FLAG_SCHEMA },
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = SensitiveFlagSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return parsed.data;
  } catch (err) {
    console.error("[openai.flagSensitive] failed:", (err as Error).message);
    return null;
  }
}
