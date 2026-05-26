export type CopilotMetricRow = {
  date: string;
  totalActiveUsers: number;
  totalEngagedUsers: number;
  ideCompletionsEngagedUsers: number | null;
  ideChatEngagedUsers: number | null;
  dotcomChatEngagedUsers: number | null;
  dotcomPullRequestsEngagedUsers: number | null;
  modelsUsed: Array<{ name: string; engagedUsers: number; totalChats: number | null }>;
  editorsUsed: string[];
};

export type FetchCopilotMetricsOpts = {
  token: string;
  org: string;
  since?: Date;
  until?: Date;
  fetchImpl?: typeof fetch;
};

export class CopilotMetricsError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    // Intentionally generic — do NOT include the bearer token, the request
    // URL, or arbitrary headers in the error message. The body field carries
    // the raw server response (already capped to 500 chars by the caller).
    super(`GitHub Copilot metrics API error: HTTP ${status}`);
    this.name = "CopilotMetricsError";
    this.status = status;
    this.body = body;
  }
}

const PAGE_CAP = 50;
const DEFAULT_WINDOW_MS = 28 * 24 * 60 * 60 * 1000;

function toNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return 0;
}

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

type CopilotModelEntry = {
  name?: unknown;
  total_engaged_users?: unknown;
  total_chats?: unknown;
};

type CopilotEditorEntry = {
  name?: unknown;
};

type CopilotDailyEntry = {
  date?: unknown;
  total_active_users?: unknown;
  total_engaged_users?: unknown;
  copilot_ide_code_completions?: {
    editors?: CopilotEditorEntry[];
    total_engaged_users?: unknown;
  };
  copilot_ide_chat?: {
    total_engaged_users?: unknown;
  };
  copilot_dotcom_chat?: {
    models?: CopilotModelEntry[];
    total_engaged_users?: unknown;
  };
  copilot_dotcom_pull_requests?: {
    total_engaged_users?: unknown;
  };
};

function flattenEntry(entry: CopilotDailyEntry): CopilotMetricRow {
  const completions = entry.copilot_ide_code_completions;
  const ideChat = entry.copilot_ide_chat;
  const dotcomChat = entry.copilot_dotcom_chat;
  const dotcomPRs = entry.copilot_dotcom_pull_requests;

  const editorsRaw = completions?.editors ?? [];
  const editorsSet = new Set<string>();
  for (const ed of editorsRaw) {
    if (ed && typeof ed.name === "string") editorsSet.add(ed.name);
  }

  const modelsRaw = dotcomChat?.models ?? [];
  const modelsUsed: CopilotMetricRow["modelsUsed"] = [];
  for (const m of modelsRaw) {
    if (!m || typeof m.name !== "string") continue;
    modelsUsed.push({
      name: m.name,
      engagedUsers: toNumber(m.total_engaged_users),
      totalChats: toNumberOrNull(m.total_chats),
    });
  }

  return {
    date: typeof entry.date === "string" ? entry.date : "",
    totalActiveUsers: toNumber(entry.total_active_users),
    totalEngagedUsers: toNumber(entry.total_engaged_users),
    ideCompletionsEngagedUsers: completions
      ? toNumberOrNull(completions.total_engaged_users)
      : null,
    ideChatEngagedUsers: ideChat
      ? toNumberOrNull(ideChat.total_engaged_users)
      : null,
    dotcomChatEngagedUsers: dotcomChat
      ? toNumberOrNull(dotcomChat.total_engaged_users)
      : null,
    dotcomPullRequestsEngagedUsers: dotcomPRs
      ? toNumberOrNull(dotcomPRs.total_engaged_users)
      : null,
    modelsUsed,
    editorsUsed: Array.from(editorsSet),
  };
}

export async function fetchCopilotMetrics(
  opts: FetchCopilotMetricsOpts,
): Promise<CopilotMetricRow[]> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("No fetch implementation available");
  }

  const until = opts.until ?? new Date();
  const since = opts.since ?? new Date(until.getTime() - DEFAULT_WINDOW_MS);

  const endpoint = `https://api.github.com/orgs/${encodeURIComponent(opts.org)}/copilot/metrics`;

  const rows: CopilotMetricRow[] = [];
  let page = 1;
  let pageCount = 0;

  while (pageCount < PAGE_CAP) {
    pageCount++;

    const params = new URLSearchParams();
    params.set("since", since.toISOString());
    params.set("until", until.toISOString());
    params.set("page", String(page));

    const url = `${endpoint}?${params.toString()}`;
    const res = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${opts.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        body = "";
      }
      throw new CopilotMetricsError(res.status, body.slice(0, 500));
    }

    const json = (await res.json()) as unknown;
    const data: CopilotDailyEntry[] = Array.isArray(json)
      ? (json as CopilotDailyEntry[])
      : [];

    if (data.length === 0) {
      return rows;
    }

    for (const entry of data) {
      rows.push(flattenEntry(entry));
    }

    page++;
  }

  // Hard cap reached. Warn and return what we have instead of throwing,
  // so a misbehaving server can't take down a sync job.
  console.warn(
    `fetchCopilotMetrics: hit hard page cap (${PAGE_CAP}); returning truncated results`,
  );
  return rows;
}
