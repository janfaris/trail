// Backfill AI-generated titles + summaries for trail_session rows where summary IS NULL.
// Idempotent — re-running is a no-op for rows already populated.
//
// Usage:
//   pnpm tsx apps/web/scripts/ai-backfill-titles.mjs
//
// Requires DATABASE_URL and OPENAI_API_KEY in apps/web/.env.local.

import { config as loadEnv } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Try apps/web/.env.local first, then repo root .env.local for DATABASE_URL.
loadEnv({ path: path.join(__dirname, "..", ".env.local") });
if (!process.env.DATABASE_URL) {
  loadEnv({ path: path.join(__dirname, "..", "..", "..", ".env.local") });
}

const DATABASE_URL = process.env.DATABASE_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-5.4-mini";

if (!DATABASE_URL) throw new Error("DATABASE_URL not set");
if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");

const CONCURRENCY = 5;

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
};

function truncate(s, max) {
  return s.length <= max ? s : s.slice(0, max) + "…";
}

async function generateSessionMeta(prompts, lastEventKinds) {
  const promptBlock = prompts
    .slice(0, 3)
    .map((p, i) => `Prompt ${i + 1}:\n${truncate(p, 1200)}`)
    .join("\n\n");
  const tailBlock = lastEventKinds.slice(-3).join(", ") || "(none)";
  const userMsg = `User prompts:\n${promptBlock || "(none)"}\n\nLast event kinds: ${tailBlock}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      max_completion_tokens: 300,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
      response_format: { type: "json_schema", json_schema: JSON_SCHEMA },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error("empty response");
  const usage = data.usage || {};
  const parsed = JSON.parse(raw);
  return {
    title: String(parsed.title).slice(0, 80),
    summary: String(parsed.summary).slice(0, 300),
    inputTokens: usage.prompt_tokens || 0,
    outputTokens: usage.completion_tokens || 0,
  };
}

const sql = neon(DATABASE_URL);

console.log("Fetching sessions where summary IS NULL…");
const sessions = await sql`
  SELECT id, slug, title
  FROM trail_session
  WHERE summary IS NULL
  ORDER BY started_at DESC
`;
console.log(`Found ${sessions.length} sessions to process.`);

let done = 0;
let errors = 0;
let totalIn = 0;
let totalOut = 0;

async function processOne(sess) {
  try {
    const promptRows = await sql`
      SELECT data
      FROM event
      WHERE session_id = ${sess.id} AND kind = 'prompt'
      ORDER BY idx ASC
      LIMIT 3
    `;
    const prompts = promptRows
      .map((r) => (r.data && typeof r.data.text === "string" ? r.data.text : null))
      .filter((p) => p && p.trim().length > 0);

    if (prompts.length === 0) {
      done++;
      return;
    }

    const lastRows = await sql`
      SELECT kind FROM event
      WHERE session_id = ${sess.id}
      ORDER BY idx DESC
      LIMIT 3
    `;
    const lastKinds = lastRows.map((r) => r.kind).reverse();

    const meta = await generateSessionMeta(prompts, lastKinds);
    totalIn += meta.inputTokens;
    totalOut += meta.outputTokens;

    await sql`
      UPDATE trail_session
      SET title = ${meta.title}, summary = ${meta.summary}
      WHERE id = ${sess.id}
    `;
    done++;
    if (done % 10 === 0) {
      console.log(`  progress: ${done}/${sessions.length} (errors: ${errors})`);
    }
  } catch (e) {
    errors++;
    console.error(`  skip ${sess.slug}: ${e.message}`);
  }
}

// Bounded concurrency pool
async function runPool(items, worker, concurrency) {
  let idx = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < items.length) {
      const i = idx++;
      await worker(items[i]);
    }
  });
  await Promise.all(workers);
}

await runPool(sessions, processOne, CONCURRENCY);

// gpt-5.4-mini approximate pricing fallback: assume ~$0.25/M input, $2/M output.
const INPUT_PER_MTOK = Number(process.env.OPENAI_INPUT_PRICE_PER_MTOK || 0.25);
const OUTPUT_PER_MTOK = Number(process.env.OPENAI_OUTPUT_PRICE_PER_MTOK || 2);
const cost = (totalIn / 1_000_000) * INPUT_PER_MTOK + (totalOut / 1_000_000) * OUTPUT_PER_MTOK;

console.log(`\nDone. processed=${done} errors=${errors}`);
console.log(`tokens in=${totalIn} out=${totalOut}`);
console.log(`est. cost = $${cost.toFixed(4)} (assumes $${INPUT_PER_MTOK}/M in, $${OUTPUT_PER_MTOK}/M out)`);
