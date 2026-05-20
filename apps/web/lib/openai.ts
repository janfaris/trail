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
