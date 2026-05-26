export type OpenAIUsageRow = {
  bucketStart: string;
  bucketEnd: string;
  model: string | null;
  projectId: string | null;
  userId: string | null;
  apiKeyId: string | null;
  batch: boolean | null;
  inputTokens: number;
  inputCachedTokens: number;
  outputTokens: number;
  numRequests: number;
};

export type FetchOpenAIUsageOpts = {
  apiKey: string;
  startingAt: Date;
  endingAt?: Date;
  bucketWidth?: "1m" | "1h" | "1d";
  groupBy?: Array<"project_id" | "user_id" | "api_key_id" | "model" | "batch">;
  projectIds?: string[];
  apiKeyIds?: string[];
  models?: string[];
  fetchImpl?: typeof fetch;
};

export class OpenAIUsageError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    // Intentionally generic — do NOT include the API key, the request URL,
    // or arbitrary headers in the error message. The body field carries the
    // raw server response (already capped to 500 chars by the caller).
    super(`OpenAI usage API error: HTTP ${status}`);
    this.name = "OpenAIUsageError";
    this.status = status;
    this.body = body;
  }
}

const ENDPOINT = "https://api.openai.com/v1/organization/usage/completions";
const PAGE_CAP = 100;

function toNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return 0;
}

function toStringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function toBoolOrNull(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function epochSecondsToIso(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) {
    return new Date(v * 1000).toISOString();
  }
  return "";
}

type BucketResult = {
  model?: unknown;
  project_id?: unknown;
  user_id?: unknown;
  api_key_id?: unknown;
  batch?: unknown;
  input_tokens?: unknown;
  input_cached_tokens?: unknown;
  output_tokens?: unknown;
  num_model_requests?: unknown;
};

type Bucket = {
  start_time?: number;
  end_time?: number;
  results?: BucketResult[];
};

type UsageResponse = {
  data?: Bucket[];
  has_more?: boolean;
  next_page?: string | null;
};

export async function fetchOpenAIOrgUsage(
  opts: FetchOpenAIUsageOpts,
): Promise<OpenAIUsageRow[]> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("No fetch implementation available");
  }

  const endingAt = opts.endingAt ?? new Date();
  const bucketWidth = opts.bucketWidth ?? "1d";
  // Default grouping surfaces the per-model breakdown consumers need to
  // compute cost-per-PR (pricing varies by model + cached split).
  const groupBy = opts.groupBy ?? ["model", "project_id"];

  // OpenAI Usage API takes epoch SECONDS (not milliseconds, not ISO).
  // This is a well-known footgun; conversion is centralised here.
  const startTimeSec = Math.floor(opts.startingAt.getTime() / 1000);
  const endTimeSec = Math.floor(endingAt.getTime() / 1000);

  const rows: OpenAIUsageRow[] = [];
  let page: string | null = null;
  let pageCount = 0;

  while (pageCount < PAGE_CAP) {
    pageCount++;

    const params = new URLSearchParams();
    params.set("start_time", String(startTimeSec));
    params.set("end_time", String(endTimeSec));
    params.set("bucket_width", bucketWidth);
    for (const g of groupBy) params.append("group_by[]", g);
    if (opts.projectIds) {
      for (const p of opts.projectIds) params.append("project_ids[]", p);
    }
    if (opts.apiKeyIds) {
      for (const k of opts.apiKeyIds) params.append("api_key_ids[]", k);
    }
    if (opts.models) {
      for (const m of opts.models) params.append("models[]", m);
    }
    if (page) params.set("page", page);

    const url = `${ENDPOINT}?${params.toString()}`;
    const res = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
      },
    });

    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        body = "";
      }
      throw new OpenAIUsageError(res.status, body.slice(0, 500));
    }

    const json = (await res.json()) as UsageResponse;
    const data = json.data ?? [];
    for (const bucket of data) {
      const bucketStart = epochSecondsToIso(bucket.start_time);
      const bucketEnd = epochSecondsToIso(bucket.end_time);
      const results = bucket.results ?? [];
      for (const r of results) {
        rows.push({
          bucketStart,
          bucketEnd,
          model: toStringOrNull(r.model),
          projectId: toStringOrNull(r.project_id),
          userId: toStringOrNull(r.user_id),
          apiKeyId: toStringOrNull(r.api_key_id),
          batch: toBoolOrNull(r.batch),
          inputTokens: toNumber(r.input_tokens),
          inputCachedTokens: toNumber(r.input_cached_tokens),
          outputTokens: toNumber(r.output_tokens),
          numRequests: toNumber(r.num_model_requests),
        });
      }
    }

    if (!json.has_more || !json.next_page) {
      return rows;
    }
    page = json.next_page;
  }

  // Hard cap reached. Warn and return what we have instead of throwing,
  // so a misbehaving server can't take down a sync job.
  console.warn(
    `fetchOpenAIOrgUsage: hit hard page cap (${PAGE_CAP}); returning truncated results`,
  );
  return rows;
}
