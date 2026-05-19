// Backfill embeddings for trail_session rows where embedding IS NULL.
// Usage: node apps/web/scripts/ai-backfill-embeddings.mjs
import { config as loadEnv } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, "..", "..", "..", ".env.local") });
loadEnv({ path: path.join(__dirname, "..", ".env.local"), override: false });

const DATABASE_URL = process.env.DATABASE_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large";
if (!DATABASE_URL) throw new Error("DATABASE_URL not set");
if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");

const CONCURRENCY = 5;
const MAX_CHARS = 16_000;

function buildInput(title, summary, prompts) {
  const head = `Title: ${title}\n\nSummary: ${summary}\n\nPrompts:\n`;
  let body = "";
  for (let i = 0; i < Math.min(prompts.length, 10); i++) {
    const chunk = `${i + 1}. ${prompts[i].trim()}\n`;
    if (head.length + body.length + chunk.length > MAX_CHARS) break;
    body += chunk;
  }
  return (head + body).slice(0, MAX_CHARS);
}

async function embed(input) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, input }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return {
    vector: data.data[0].embedding,
    tokens: data.usage?.total_tokens || 0,
  };
}

const sql = neon(DATABASE_URL);
console.log("Fetching sessions where embedding IS NULL…");
const sessions = await sql`
  SELECT id, slug, title, summary
  FROM trail_session
  WHERE embedding IS NULL
  ORDER BY started_at DESC
`;
console.log(`Found ${sessions.length} sessions to embed.`);

let done = 0;
let errors = 0;
let totalTokens = 0;

async function processOne(s) {
  try {
    const promptRows = await sql`
      SELECT data FROM event
      WHERE session_id = ${s.id} AND kind = 'prompt'
      ORDER BY idx ASC LIMIT 10
    `;
    const prompts = promptRows
      .map((r) => (r.data && typeof r.data.text === "string" ? r.data.text : null))
      .filter((p) => p && p.trim());
    const input = buildInput(s.title || "", s.summary || "", prompts);
    const { vector, tokens } = await embed(input);
    totalTokens += tokens;
    const lit = "[" + vector.join(",") + "]";
    await sql`UPDATE trail_session SET embedding = ${lit}::vector WHERE id = ${s.id}`;
    done++;
    console.log(`  ✓ ${s.slug} (${tokens} tokens)`);
  } catch (e) {
    errors++;
    console.error(`  skip ${s.slug}: ${e.message}`);
  }
}

async function runPool(items, worker, n) {
  let idx = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (idx < items.length) {
        const i = idx++;
        await worker(items[i]);
      }
    }),
  );
}

await runPool(sessions, processOne, CONCURRENCY);

// text-embedding-3-large: $0.13 / 1M tokens
const cost = (totalTokens / 1_000_000) * 0.13;
console.log(`\nDone. processed=${done} errors=${errors} tokens=${totalTokens}`);
console.log(`est. cost = $${cost.toFixed(6)}`);
