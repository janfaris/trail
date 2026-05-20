import { db, schema } from "@/db/client";
import { aiClient, textModel } from "@/lib/ai-client";
import { eq, asc, sql } from "drizzle-orm";

const SYSTEM_PROMPT = `You produce a "recipe card" for a developer's AI coding/research session.

Return ONLY a JSON object with exactly these keys:
{
  "tldr": string,             // one sentence (<=140 chars) describing what was built or researched
  "outcome": string,          // concrete artifact (<=40 chars), e.g. "Pricing report drafted" or "3 files refactored"
  "keyPromptIdxs": number[],  // 3-5 idx values of the most pivotal prompt-kind events
  "highlightIdxs": number[]   // 3-7 idx values across any kind that best represent the session's arc
}

Rules:
- tldr is a single sentence, past tense, no leading "The user".
- outcome is a short noun phrase naming the deliverable.
- All idxs must come from the transcript provided.
- Output strictly valid JSON, no prose.`;

type EventRow = { idx: number; kind: string; data: unknown };

function eventText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  if (typeof d.text === "string") return d.text;
  if (typeof d.name === "string") return d.name;
  try {
    return JSON.stringify(d).slice(0, 400);
  } catch {
    return "";
  }
}

function buildTranscript(events: EventRow[]): string {
  const lines = events.map((e) => {
    const txt = eventText(e.data).replace(/\s+/g, " ").trim().slice(0, 400);
    return `[idx:${e.idx} kind:${e.kind}] ${txt}`;
  });
  let joined = lines.join("\n");
  const CAP = 12000;
  if (joined.length > CAP) {
    const head = joined.slice(0, 6000);
    const tail = joined.slice(joined.length - 6000);
    joined = `${head}\n…[trimmed]…\n${tail}`;
  }
  return joined;
}

function clampStr(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  const t = s.trim();
  return t.length > max ? t.slice(0, max) : t;
}

function filterIdxs(
  arr: unknown,
  validSet: Set<number>,
  min: number,
  max: number,
): number[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const v of arr) {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) continue;
    const i = Math.trunc(n);
    if (!validSet.has(i)) continue;
    if (seen.has(i)) continue;
    seen.add(i);
    out.push(i);
    if (out.length >= max) break;
  }
  return out.length >= min ? out : out; // best-effort; don't reject if short
}

export async function generateRecipe(sessionId: string): Promise<void> {
  try {
    const client = aiClient();
    if (!client) return;

    const row = await db.query.trailSession.findFirst({
      where: eq(schema.trailSession.id, sessionId),
    });
    if (!row) return;

    const events = await db
      .select({
        idx: schema.event.idx,
        kind: schema.event.kind,
        data: schema.event.data,
      })
      .from(schema.event)
      .where(eq(schema.event.sessionId, sessionId))
      .orderBy(asc(schema.event.idx));

    if (events.length === 0) return;

    const transcript = buildTranscript(events);
    const validIdxs = new Set<number>(events.map((e) => e.idx));

    const completion = await client.chat.completions.create({
      model: textModel(),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Title: ${row.title || row.slug}\nSummary: ${row.summary || ""}\n\nTranscript:\n${transcript}`,
        },
      ],
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      console.error("[recipe-gen] JSON parse failed", err);
      return;
    }
    if (!parsed || typeof parsed !== "object") return;
    const p = parsed as Record<string, unknown>;

    const tldr = clampStr(p.tldr, 140);
    const outcome = clampStr(p.outcome, 40);
    const keyPromptIdxs = filterIdxs(p.keyPromptIdxs, validIdxs, 3, 5);
    const highlightIdxs = filterIdxs(p.highlightIdxs, validIdxs, 3, 7);

    if (!tldr && !outcome && keyPromptIdxs.length === 0 && highlightIdxs.length === 0) {
      return;
    }

    await db
      .update(schema.trailSession)
      .set({
        recipeTldr: tldr || null,
        recipeOutcome: outcome || null,
        recipeKeyPromptIdxs: keyPromptIdxs,
        recipeHighlightIdxs: highlightIdxs,
        recipeGeneratedAt: sql`NOW()`,
      })
      .where(eq(schema.trailSession.id, sessionId));
  } catch (err) {
    console.error("[recipe-gen] failed for", sessionId, err);
  }
}
