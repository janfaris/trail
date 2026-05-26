export type AnthropicUsageRow = {
  bucketStart: string;
  bucketEnd: string;
  model: string | null;
  workspaceId: string | null;
  apiKeyId: string | null;
  serviceTier: string | null;
  contextWindow: string | null;
  uncachedInputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  outputTokens: number;
};

export type FetchUsageOpts = {
  apiKey: string;
  startingAt: Date;
  endingAt?: Date;
  bucketWidth?: "1h" | "1d";
  workspaceIds?: string[];
  apiKeyIds?: string[];
  models?: string[];
  groupBy?: Array<
    "workspace_id" | "api_key_id" | "model" | "service_tier" | "context_window"
  >;
  fetchImpl?: typeof fetch;
};

export class AnthropicUsageError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    // Intentionally generic — do NOT include the API key, the request URL,
    // or arbitrary headers in the error message. The body field carries the
    // raw server response (already capped to 500 chars by the caller).
    super(`Anthropic usage API error: HTTP ${status}`);
    this.name = "AnthropicUsageError";
    this.status = status;
    this.body = body;
  }
}

const ENDPOINT =
  "https://api.anthropic.com/v1/organizations/usage_report/messages";
const PAGE_CAP = 100;

function toNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return 0;
}

function toStringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

type BucketResult = {
  model?: unknown;
  workspace_id?: unknown;
  api_key_id?: unknown;
  service_tier?: unknown;
  context_window?: unknown;
  uncached_input_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
  cache_read_input_tokens?: unknown;
  output_tokens?: unknown;
};

type Bucket = {
  starting_at?: string;
  ending_at?: string;
  results?: BucketResult[];
};

type UsageResponse = {
  data?: Bucket[];
  has_more?: boolean;
  next_page?: string | null;
};

export async function fetchAnthropicOrgUsage(
  opts: FetchUsageOpts,
): Promise<AnthropicUsageRow[]> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("No fetch implementation available");
  }

  const endingAt = opts.endingAt ?? new Date();
  const bucketWidth = opts.bucketWidth ?? "1d";
  // Default grouping surfaces the per-model breakdown consumers need to
  // compute cost-per-PR (pricing varies by model + cache split).
  const groupBy = opts.groupBy ?? ["model", "workspace_id"];

  const rows: AnthropicUsageRow[] = [];
  let page: string | null = null;
  let pageCount = 0;

  while (pageCount < PAGE_CAP) {
    pageCount++;

    const params = new URLSearchParams();
    params.set("starting_at", opts.startingAt.toISOString());
    params.set("ending_at", endingAt.toISOString());
    params.set("bucket_width", bucketWidth);
    for (const g of groupBy) params.append("group_by[]", g);
    if (opts.workspaceIds) {
      for (const w of opts.workspaceIds) params.append("workspace_ids[]", w);
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
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
      },
    });

    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        body = "";
      }
      throw new AnthropicUsageError(res.status, body.slice(0, 500));
    }

    const json = (await res.json()) as UsageResponse;
    const data = json.data ?? [];
    for (const bucket of data) {
      const bucketStart = bucket.starting_at ?? "";
      const bucketEnd = bucket.ending_at ?? "";
      const results = bucket.results ?? [];
      for (const r of results) {
        rows.push({
          bucketStart,
          bucketEnd,
          model: toStringOrNull(r.model),
          workspaceId: toStringOrNull(r.workspace_id),
          apiKeyId: toStringOrNull(r.api_key_id),
          serviceTier: toStringOrNull(r.service_tier),
          contextWindow: toStringOrNull(r.context_window),
          uncachedInputTokens: toNumber(r.uncached_input_tokens),
          cacheCreationInputTokens: toNumber(r.cache_creation_input_tokens),
          cacheReadInputTokens: toNumber(r.cache_read_input_tokens),
          outputTokens: toNumber(r.output_tokens),
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
    `fetchAnthropicOrgUsage: hit hard page cap (${PAGE_CAP}); returning truncated results`,
  );
  return rows;
}
