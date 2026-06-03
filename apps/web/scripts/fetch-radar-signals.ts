// Local CLI only. Do not import this file from Next.js routes/pages/components.
//
// Dry-run by default:
//   pnpm -F @trail/web run radar:fetch
//
// Apply:
//   pnpm -F @trail/web run radar:fetch -- --apply --limit=10

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import {
  type RawRadarTweet,
  type RawRadarTweetMedia,
  buildRadarSignalWrite,
  normalizeRadarTweet,
  radarSignalUpdateValues,
} from "../lib/radar-ingestion";
import {
  RADAR_DEFAULT_MAX_RESULTS_PER_SOURCE,
  RADAR_X_SOURCES,
  type RadarSource,
  activeRadarSources,
  buildRadarSourceQuery,
} from "../lib/radar-sources";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnv({ path: path.join(__dirname, "..", ".env.local") });
if (!process.env.DATABASE_URL) {
  loadEnv({ path: path.join(__dirname, "..", "..", "..", ".env.local") });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type XUrlResponse = {
  data?: unknown;
  includes?: {
    media?: RawRadarTweetMedia[];
  };
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
  if (!raw) return activeRadarSources();

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

function parseXurlTweets(stdout: string, source: RadarSource) {
  const parsed = JSON.parse(stdout) as XUrlResponse;
  const data = Array.isArray(parsed.data) ? parsed.data : [];
  const mediaByKey = new Map(
    (parsed.includes?.media ?? [])
      .filter((media): media is RawRadarTweetMedia & { media_key: string } => {
        return typeof media.media_key === "string";
      })
      .map((media) => [media.media_key, media]),
  );
  return data.map((item) => normalizeRadarTweet(item as RawRadarTweet, source, "xurl", mediaByKey));
}

async function main() {
  const apply = process.argv.includes("--apply");
  const limit = numberOption("--limit", RADAR_DEFAULT_MAX_RESULTS_PER_SOURCE, 10, 100);
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
        const values = buildRadarSignalWrite(source, tweet);

        if (!apply) {
          console.log(
            `[radar:fetch] would store ${values.category} @${source.handle}: ${values.title}`,
          );
          continue;
        }

        if (!db || !schema) throw new Error("Database client was not initialized");
        await db
          .insert(schema.radarSignal)
          .values(values)
          .onConflictDoUpdate({
            target: schema.radarSignal.id,
            set: radarSignalUpdateValues(values),
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
