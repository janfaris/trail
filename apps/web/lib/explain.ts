import { aiClient, textModel } from "./ai-client";

const SYSTEM_PROMPT = `You explain what happened in a developer's AI coding/research session.

Write a 4-6 sentence narrative in past tense, plain prose. No markdown
headings, no bullets, no preamble like "In this session". Use neutral
third-person — say "the developer" or describe the work itself ("Started
by exploring…"); never write "the user". Cover:
- what the person was trying to do
- the key decisions or pivots
- what they tried and what they learned
- what they ended up with at the end

Keep it specific to what the events show. Don't editorialise or rate the
work. Tone: a colleague summarising a teammate's working notes.`;

interface ExplainEvent {
  kind: string;
  payload: unknown;
}

function summariseEvent(e: ExplainEvent): string {
  // The DB column is jsonb 'data'; payload mirrors the @trail/schema Event union.
  const p = e.payload as Record<string, unknown> | null;
  if (!p) return e.kind;
  switch (e.kind) {
    case "prompt": {
      const t = typeof p.text === "string" ? p.text : "";
      return `prompt: ${t.slice(0, 400)}`;
    }
    case "tool_use":
    case "tool": {
      const name = typeof p.name === "string" ? p.name : "tool";
      const arg = typeof p.input === "string" ? p.input.slice(0, 120) : "";
      return `tool ${name}${arg ? `: ${arg}` : ""}`;
    }
    case "file_edit":
    case "edit": {
      const path = typeof p.path === "string" ? p.path : "?";
      return `edit ${path}`;
    }
    case "command":
    case "shell": {
      const cmd = typeof p.command === "string" ? p.command : "";
      return `shell: ${cmd.slice(0, 160)}`;
    }
    case "response":
    case "assistant": {
      const t = typeof p.text === "string" ? p.text : "";
      return `assistant: ${t.slice(0, 240)}`;
    }
    default:
      return e.kind;
  }
}

export interface ExplainInput {
  title: string;
  summary: string | null;
  events: ExplainEvent[];
}

export async function generateSessionExplanation(
  input: ExplainInput,
): Promise<string | null> {
  const c = aiClient();
  if (!c) return null;
  const model = textModel();

  // Bookend trim: first 30 + last 10. If <=40 events, take them all.
  const evs = input.events;
  const slice =
    evs.length <= 40 ? evs : [...evs.slice(0, 30), ...evs.slice(-10)];

  const eventLines = slice.map((e, i) => `${i + 1}. ${summariseEvent(e)}`).join("\n");
  const meta = `Title: ${input.title}\nSummary: ${input.summary || "(none)"}\nTotal events: ${evs.length} (showing ${slice.length})`;

  try {
    const res = await c.chat.completions.create({
      model,
      temperature: 0.5,
      max_completion_tokens: 600,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${meta}\n\nEvents:\n${eventLines}` },
      ],
    });
    const text = res.choices[0]?.message?.content?.trim();
    return text || null;
  } catch (err) {
    console.error("[explain.generateSessionExplanation] failed:", (err as Error).message);
    return null;
  }
}
