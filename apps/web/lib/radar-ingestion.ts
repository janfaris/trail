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
  attachments?: unknown;
  conversation_id?: unknown;
  referenced_tweets?: unknown;
  lang?: unknown;
  possibly_sensitive?: unknown;
};

export type RawRadarTweetMedia = {
  media_key?: unknown;
  type?: unknown;
  url?: unknown;
  preview_image_url?: unknown;
  width?: unknown;
  height?: unknown;
  alt_text?: unknown;
};

export type RadarTweetMedia = {
  mediaKey: string;
  type: string;
  url: string;
  previewImageUrl?: string;
  width?: number;
  height?: number;
  altText?: string;
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

function optionalNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeMedia(media: RawRadarTweetMedia | undefined): RadarTweetMedia | null {
  if (!media || typeof media.media_key !== "string") return null;
  const type = typeof media.type === "string" ? media.type : "unknown";
  const url =
    typeof media.url === "string"
      ? media.url
      : typeof media.preview_image_url === "string"
        ? media.preview_image_url
        : null;
  if (!url) return null;

  return {
    mediaKey: media.media_key,
    type,
    url,
    previewImageUrl:
      typeof media.preview_image_url === "string" ? media.preview_image_url : undefined,
    width: optionalNumber(media.width),
    height: optionalNumber(media.height),
    altText: typeof media.alt_text === "string" ? media.alt_text : undefined,
  };
}

function mediaKeys(raw: RawRadarTweet): string[] {
  const keys = asRecord(raw.attachments).media_keys;
  return Array.isArray(keys) ? keys.filter((key): key is string => typeof key === "string") : [];
}

function normalizeTweetMedia(
  raw: RawRadarTweet,
  mediaByKey: ReadonlyMap<string, RawRadarTweetMedia> | undefined,
): RadarTweetMedia[] {
  return mediaKeys(raw)
    .map((key) => normalizeMedia(mediaByKey?.get(key)))
    .filter((media): media is RadarTweetMedia => media !== null);
}

export function normalizeRadarTweet(
  raw: RawRadarTweet,
  source: RadarSource,
  providerLabel = "X API",
  mediaByKey?: ReadonlyMap<string, RawRadarTweetMedia>,
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
      media: normalizeTweetMedia(raw, mediaByKey),
      attachments: asRecord(raw.attachments),
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
