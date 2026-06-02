import type { RadarSignalMetrics } from "@/db/schema";
import { classifyRadarSignal } from "./radar-classifier";
import type { RadarSource } from "./radar-sources";

export type RawRadarTweet = {
  id?: unknown;
  author_id?: unknown;
  text?: unknown;
  created_at?: unknown;
  public_metrics?: unknown;
  entities?: unknown;
  conversation_id?: unknown;
  referenced_tweets?: unknown;
  lang?: unknown;
  possibly_sensitive?: unknown;
};

export type NormalizedRadarTweet = {
  id: string;
  authorId: string | null;
  text: string;
  createdAt: Date;
  metrics: RadarSignalMetrics;
  entities: Record<string, unknown>;
  conversationId: string | null;
};

export type RadarSignalWrite = {
  id: string;
  source: "x";
  sourceHandle: string;
  sourceName: string;
  externalId: string;
  url: string;
  text: string;
  title: string;
  summary: string;
  whyBuildersCare: string;
  testPrompt: string;
  category: string;
  status: "unverified";
  score: string;
  metrics: RadarSignalMetrics;
  entities: Record<string, unknown>;
  tags: string[];
  publishedAt: Date;
  fetchedAt: Date;
  updatedAt: Date;
};

function asMetrics(value: unknown): RadarSignalMetrics {
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

export function normalizeRadarTweet(
  raw: RawRadarTweet,
  source: RadarSource,
  providerLabel = "X API",
): NormalizedRadarTweet {
  if (typeof raw.id !== "string" || raw.id.length === 0) {
    throw new Error(`${providerLabel} returned a ${source.handle} tweet without id`);
  }
  if (typeof raw.text !== "string" || raw.text.trim().length === 0) {
    throw new Error(`${providerLabel} returned tweet ${raw.id} without text`);
  }
  if (typeof raw.created_at !== "string") {
    throw new Error(`${providerLabel} returned tweet ${raw.id} without created_at`);
  }

  const createdAt = new Date(raw.created_at);
  if (Number.isNaN(createdAt.getTime())) {
    throw new Error(`${providerLabel} returned tweet ${raw.id} with invalid created_at`);
  }

  return {
    id: raw.id,
    authorId: typeof raw.author_id === "string" ? raw.author_id : null,
    text: raw.text.trim(),
    createdAt,
    metrics: asMetrics(raw.public_metrics),
    entities: {
      ...asRecord(raw.entities),
      referenced_tweets: Array.isArray(raw.referenced_tweets) ? raw.referenced_tweets : undefined,
      lang: typeof raw.lang === "string" ? raw.lang : undefined,
      possibly_sensitive:
        typeof raw.possibly_sensitive === "boolean" ? raw.possibly_sensitive : undefined,
    },
    conversationId: typeof raw.conversation_id === "string" ? raw.conversation_id : null,
  };
}

export function radarTweetUrl(source: RadarSource, tweetId: string): string {
  return `https://x.com/${source.handle}/status/${tweetId}`;
}

export function buildRadarSignalWrite(
  source: RadarSource,
  tweet: NormalizedRadarTweet,
  fetchedAt = new Date(),
): RadarSignalWrite {
  const classification = classifyRadarSignal({
    text: tweet.text,
    metrics: tweet.metrics,
  });

  return {
    id: `x_${tweet.id}`,
    source: "x",
    sourceHandle: source.handle,
    sourceName: source.name,
    externalId: tweet.id,
    url: radarTweetUrl(source, tweet.id),
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
    fetchedAt,
    updatedAt: fetchedAt,
  };
}

export function radarSignalUpdateValues(
  values: RadarSignalWrite,
): Omit<RadarSignalWrite, "id" | "status"> {
  const { id: _id, status: _status, ...set } = values;
  return set;
}

export function trimRadarFailureMessage(value: unknown, maxLength = 500): string {
  const message = value instanceof Error ? value.message : String(value);
  const normalized = message.replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3)}...`;
}
