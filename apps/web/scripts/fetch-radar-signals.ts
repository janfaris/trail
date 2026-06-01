// Local CLI only. Do not import this file from Next.js routes/pages/components.
//
// Dry-run by default:
//   pnpm -F @trail/web run radar:fetch
//
// Apply:
//   pnpm -F @trail/web run radar:fetch -- --apply --limit=20

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { classifyRadarSignal } from "../lib/radar-classifier";
import { RADAR_X_SOURCES, type RadarSource, buildRadarSourceQuery } from "../lib/radar-sources";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnv({ path: path.join(__dirname, "..", ".env.local") });
if (!process.env.DATABASE_URL) {
  loadEnv({ path: path.join(__dirname, "..", "..", "..", ".env.local") });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type XUrlTweet = {
  id?: unknown;
  author_id?: unknown;
  text?: unknown;
  created_at?: unknown;
  public_metrics?: unknown;
  entities?: unknown;
  conversation_id?: unknown;
};

type XUrlResponse = {
  data?: unknown;
};

type NormalizedTweet = {
  id: string;
  authorId: string | null;
  text: string;
  createdAt: Date;
  metrics: Record<string, number>;
  entities: Record<string, unknown>;
  conversationId: string | null;
};

function optionValue(name: string, fallback: string): string {
  const prefix = `${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function numberOption(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(optionValue(name, String(fallback)));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function selectedSources(): RadarSource[] {
  const raw = optionValue("--sources", "").trim();
  if (!raw) return RADAR_X_SOURCES;

  const wanted = new Set(
    raw
      .split(",")
      .map((handle) => handle.trim().replace(/^@/, "").toLowerCase())
      .filter(Boolean),
  );
  return RADAR_X_SOURCES.filter((source) => wanted.has(source.handle.toLowerCase()));
}

function runXurl(args: string[]): string {
  const result = spawnSync("xurl", args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 45_000,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `xurl exited with ${result.status}`);
  }
  return result.stdout;
}

function assertXurlReady() {
  try {
    runXurl(["whoami"]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `xurl is not available or not authenticated. Install/login locally first, then retry. ${message}`,
    );
  }
}

function asMetrics(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const metrics: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) metrics[key] = parsed;
  }
  return metrics;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeTweet(raw: XUrlTweet, source: RadarSource): NormalizedTweet {
  if (typeof raw.id !== "string" || raw.id.length === 0) {
    throw new Error(`xurl returned a ${source.handle} tweet without id`);
  }
  if (typeof raw.text !== "string" || raw.text.trim().length === 0) {
    throw new Error(`xurl returned tweet ${raw.id} without text`);
  }
  if (typeof raw.created_at !== "string") {
    throw new Error(`xurl returned tweet ${raw.id} without created_at`);
  }

  const createdAt = new Date(raw.created_at);
  if (Number.isNaN(createdAt.getTime())) {
    throw new Error(`xurl returned tweet ${raw.id} with invalid created_at`);
  }

  return {
    id: raw.id,
    authorId: typeof raw.author_id === "string" ? raw.author_id : null,
    text: raw.text.trim(),
    createdAt,
    metrics: asMetrics(raw.public_metrics),
    entities: asRecord(raw.entities),
    conversationId: typeof raw.conversation_id === "string" ? raw.conversation_id : null,
  };
}

function parseXurlTweets(stdout: string, source: RadarSource): NormalizedTweet[] {
  const parsed = JSON.parse(stdout) as XUrlResponse;
  const data = Array.isArray(parsed.data) ? parsed.data : [];
  return data.map((item) => normalizeTweet(item as XUrlTweet, source));
}

function tweetUrl(source: RadarSource, tweetId: string): string {
  return `https://x.com/${source.handle}/status/${tweetId}`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const limit = numberOption("--limit", 20, 10, 100);
  const pauseMs = numberOption("--pause-ms", 1100, 0, 10_000);
  const sources = selectedSources();

  if (sources.length === 0) {
    throw new Error("No radar sources selected. Use handles from RADAR_X_SOURCES.");
  }

  assertXurlReady();

  let db: Awaited<typeof import("../db/client")>["db"] | null = null;
  let schema: Awaited<typeof import("../db/client")>["schema"] | null = null;
  if (apply) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
    const client = await import("../db/client");
    db = client.db;
    schema = client.schema;
  }

  let fetched = 0;
  let stored = 0;
  const failures: string[] = [];

  console.log(
    `[radar:fetch] ${apply ? "apply" : "dry-run"}; sources=${sources
      .map((source) => source.handle)
      .join(",")} limit=${limit}`,
  );

  for (const [index, source] of sources.entries()) {
    const query = buildRadarSourceQuery(source.handle);
    try {
      const stdout = runXurl(["search", query, "-n", String(limit)]);
      const tweets = parseXurlTweets(stdout, source);
      fetched += tweets.length;
      console.log(`[radar:fetch] @${source.handle}: ${tweets.length} signals`);

      for (const tweet of tweets) {
        const classification = classifyRadarSignal({
          text: tweet.text,
          metrics: tweet.metrics,
        });
        const id = `x_${tweet.id}`;
        const url = tweetUrl(source, tweet.id);

        if (!apply) {
          console.log(
            `[radar:fetch] would store ${classification.category} @${source.handle}: ${classification.title}`,
          );
          continue;
        }

        if (!db || !schema) throw new Error("Database client was not initialized");
        await db
          .insert(schema.radarSignal)
          .values({
            id,
            source: "x",
            sourceHandle: source.handle,
            sourceName: source.name,
            externalId: tweet.id,
            url,
            text: tweet.text,
            title: classification.title,
            summary: classification.summary,
            whyBuildersCare: classification.whyBuildersCare,
            testPrompt: classification.testPrompt,
            category: classification.category,
            status: "unverified",
            score: classification.score.toFixed(2),
            metrics: tweet.metrics,
            entities: {
              ...tweet.entities,
              author_id: tweet.authorId,
              conversation_id: tweet.conversationId,
            },
            tags: classification.tags,
            publishedAt: tweet.createdAt,
            fetchedAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: schema.radarSignal.id,
            set: {
              sourceHandle: source.handle,
              sourceName: source.name,
              url,
              text: tweet.text,
              title: classification.title,
              summary: classification.summary,
              whyBuildersCare: classification.whyBuildersCare,
              testPrompt: classification.testPrompt,
              category: classification.category,
              status: "unverified",
              score: classification.score.toFixed(2),
              metrics: tweet.metrics,
              entities: {
                ...tweet.entities,
                author_id: tweet.authorId,
                conversation_id: tweet.conversationId,
              },
              tags: classification.tags,
              publishedAt: tweet.createdAt,
              fetchedAt: new Date(),
              updatedAt: new Date(),
            },
          });
        stored += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`@${source.handle}: ${message}`);
      console.error(`[radar:fetch] failed @${source.handle}: ${message}`);
    }

    if (index < sources.length - 1 && pauseMs > 0) await sleep(pauseMs);
  }

  console.log(
    `[radar:fetch] complete; fetched=${fetched} ${apply ? `stored=${stored}` : "stored=0"}`,
  );
  if (failures.length > 0) {
    console.error(
      `[radar:fetch] failures:\n${failures.map((failure) => `- ${failure}`).join("\n")}`,
    );
  }
}

main().catch((err) => {
  console.error("[radar:fetch] fatal", err);
  process.exit(1);
});
