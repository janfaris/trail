import OpenAI from "openai";

let _client: OpenAI | null = null;
function client(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (!_client) _client = new OpenAI({ apiKey: key });
  return _client;
}

// Build a single text blob from the session's signal sources. Cap at ~16k chars
// (~4k tokens) — text-embedding-3-large accepts up to 8191 tokens, plenty of room.
const MAX_CHARS = 16_000;

export function buildEmbeddingInput(
  title: string,
  summary: string,
  prompts: string[],
): string {
  const head = `Title: ${title}\n\nSummary: ${summary}\n\nPrompts:\n`;
  let body = "";
  const slice = prompts.slice(0, 10);
  for (let i = 0; i < slice.length; i++) {
    const chunk = `${i + 1}. ${slice[i].trim()}\n`;
    if (head.length + body.length + chunk.length > MAX_CHARS) break;
    body += chunk;
  }
  return (head + body).slice(0, MAX_CHARS);
}

/**
 * Generate a 3072-dim embedding for a session. Returns null on missing key or
 * upstream failure — callers must treat embedding as best-effort.
 */
export async function generateSessionEmbedding(
  title: string,
  summary: string,
  prompts: string[],
): Promise<number[] | null> {
  const c = client();
  if (!c) return null;
  const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large";
  const input = buildEmbeddingInput(title, summary, prompts);
  if (!input.trim()) return null;
  try {
    const res = await c.embeddings.create({ model, input });
    const v = res.data[0]?.embedding;
    return v && Array.isArray(v) ? v : null;
  } catch (err) {
    console.error("[embeddings.generateSessionEmbedding] failed:", (err as Error).message);
    return null;
  }
}

/** pgvector accepts vectors as the literal '[0.1,0.2,...]' string. */
export function toVectorLiteral(v: number[]): string {
  return "[" + v.join(",") + "]";
}
