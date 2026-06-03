import {
  type NormalizedRadarTweet,
  type RawRadarTweet,
  type RawRadarTweetMedia,
  normalizeRadarTweet,
} from "./radar-ingestion";
import {
  RADAR_DEFAULT_MAX_RESULTS_PER_SOURCE,
  type RadarSource,
  activeRadarSources,
  buildRadarSourceQuery,
} from "./radar-sources";

const DEFAULT_X_API_BASE_URL = "https://api.x.com/2";
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const TWEET_FIELDS = [
  "attachments",
  "author_id",
  "conversation_id",
  "created_at",
  "entities",
  "lang",
  "possibly_sensitive",
  "public_metrics",
  "referenced_tweets",
].join(",");
const TWEET_EXPANSIONS = ["attachments.media_keys"].join(",");
const MEDIA_FIELDS = [
  "alt_text",
  "media_key",
  "preview_image_url",
  "type",
  "url",
  "width",
  "height",
].join(",");

export type RadarXApiRateLimit = {
  remaining: number | null;
  resetAt: Date | null;
  retryAfterSeconds: number | null;
};

export type FetchRadarTweetsForSourceOptions = {
  bearerToken: string;
  source: RadarSource;
  limit?: number;
  apiBaseUrl?: string;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type FetchRadarTweetsForSourceResult = {
  source: RadarSource;
  tweets: NormalizedRadarTweet[];
  rateLimit: RadarXApiRateLimit;
};

type XApiSearchResponse = {
  data?: RawRadarTweet[];
  errors?: Array<{ title?: string; detail?: string; type?: string }>;
  includes?: {
    media?: RawRadarTweetMedia[];
  };
  meta?: Record<string, unknown>;
};

export class RadarXApiError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | null;

  constructor(message: string, status: number, retryAfterSeconds: number | null) {
    super(message);
    this.name = "RadarXApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function boundedLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return RADAR_DEFAULT_MAX_RESULTS_PER_SOURCE;
  return Math.min(Math.max(Math.floor(value ?? RADAR_DEFAULT_MAX_RESULTS_PER_SOURCE), 10), 100);
}

function normalizedBaseUrl(apiBaseUrl: string | undefined): string {
  return (apiBaseUrl || DEFAULT_X_API_BASE_URL).replace(/\/+$/, "");
}

function boundedTimeoutMs(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_REQUEST_TIMEOUT_MS;
  return Math.min(Math.max(Math.floor(value ?? DEFAULT_REQUEST_TIMEOUT_MS), 100), 45_000);
}

function numberHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function rateLimitFromHeaders(headers: Headers): RadarXApiRateLimit {
  const resetSeconds = numberHeader(headers, "x-rate-limit-reset");
  const retryAfterSeconds = numberHeader(headers, "retry-after");
  return {
    remaining: numberHeader(headers, "x-rate-limit-remaining"),
    resetAt: resetSeconds ? new Date(resetSeconds * 1000) : null,
    retryAfterSeconds,
  };
}

function errorMessageFromBody(status: number, body: string): string {
  if (!body) return `X API request failed with ${status}`;
  try {
    const parsed = JSON.parse(body) as XApiSearchResponse;
    const firstError = parsed.errors?.[0];
    const detail = firstError?.detail || firstError?.title || body;
    return `X API request failed with ${status}: ${detail}`;
  } catch {
    return `X API request failed with ${status}: ${body.slice(0, 300)}`;
  }
}

function mediaByKeyFromResponse(response: XApiSearchResponse): Map<string, RawRadarTweetMedia> {
  return new Map(
    (response.includes?.media ?? [])
      .filter((media): media is RawRadarTweetMedia & { media_key: string } => {
        return typeof media.media_key === "string";
      })
      .map((media) => [media.media_key, media]),
  );
}

export async function fetchRadarTweetsForSource({
  bearerToken,
  source,
  limit,
  apiBaseUrl,
  requestTimeoutMs,
  fetchImpl = fetch,
}: FetchRadarTweetsForSourceOptions): Promise<FetchRadarTweetsForSourceResult> {
  const query = buildRadarSourceQuery(source.handle);
  if (query.length > 512) {
    throw new Error(`Radar X query for @${source.handle} is too long for recent search`);
  }

  const url = new URL(`${normalizedBaseUrl(apiBaseUrl)}/tweets/search/recent`);
  url.searchParams.set("query", query);
  url.searchParams.set("max_results", String(boundedLimit(limit)));
  url.searchParams.set("tweet.fields", TWEET_FIELDS);
  url.searchParams.set("expansions", TWEET_EXPANSIONS);
  url.searchParams.set("media.fields", MEDIA_FIELDS);

  const timeoutMs = boundedTimeoutMs(requestTimeoutMs);
  const controller = new AbortController();
  const timeoutError = () =>
    new RadarXApiError(`X API request timed out after ${timeoutMs}ms`, 504, null);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(timeoutError());
    }, timeoutMs);
  });
  let response: Response | undefined;
  let body = "";
  try {
    response = await Promise.race([
      fetchImpl(url, {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${bearerToken}`,
        },
        signal: controller.signal,
      }),
      timeoutPromise,
    ]);
    body = await Promise.race([response.text(), timeoutPromise]);
  } catch (error) {
    if (error instanceof RadarXApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw timeoutError();
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    if (timedOut) {
      await response?.body?.cancel().catch(() => undefined);
    }
  }

  if (!response) throw new Error("X API request did not return a response");

  const rateLimit = rateLimitFromHeaders(response.headers);

  if (!response.ok) {
    throw new RadarXApiError(
      errorMessageFromBody(response.status, body),
      response.status,
      rateLimit.retryAfterSeconds,
    );
  }

  const parsed = body ? (JSON.parse(body) as XApiSearchResponse) : {};
  const data = Array.isArray(parsed.data) ? parsed.data : [];
  const mediaByKey = mediaByKeyFromResponse(parsed);
  return {
    source,
    tweets: data.map((item) => normalizeRadarTweet(item, source, "X API", mediaByKey)),
    rateLimit,
  };
}

export function defaultRadarSources(): RadarSource[] {
  return activeRadarSources();
}
