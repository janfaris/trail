import { describe, it, expect, vi } from "vitest";
import {
  fetchCopilotMetrics,
  CopilotMetricsError,
} from "../src/copilot-org.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("copilot-org client", () => {
  it("happy_path: flattens 3 daily entries with completions, chat, and models", async () => {
    const fakeFetch = vi.fn().mockResolvedValueOnce(
      jsonResponse([
        {
          date: "2026-05-01",
          total_active_users: 50,
          total_engaged_users: 40,
          copilot_ide_code_completions: {
            total_engaged_users: 30,
            editors: [
              { name: "vscode", total_engaged_users: 25 },
              { name: "jetbrains", total_engaged_users: 5 },
            ],
            languages: [],
          },
          copilot_ide_chat: {
            total_engaged_users: 20,
            editors: [],
          },
          copilot_dotcom_chat: {
            total_engaged_users: 10,
            models: [
              {
                name: "gpt-4o",
                is_custom_model: false,
                total_engaged_users: 8,
                total_chats: 100,
              },
              {
                name: "claude-3.5-sonnet",
                is_custom_model: false,
                total_engaged_users: 4,
                total_chats: 30,
              },
            ],
          },
          copilot_dotcom_pull_requests: {
            total_engaged_users: 6,
            repositories: [],
          },
        },
        {
          date: "2026-05-02",
          total_active_users: 55,
          total_engaged_users: 42,
          copilot_ide_code_completions: {
            total_engaged_users: 33,
            editors: [
              { name: "vscode", total_engaged_users: 28 },
              { name: "neovim", total_engaged_users: 5 },
            ],
          },
          copilot_ide_chat: {
            total_engaged_users: 22,
          },
          copilot_dotcom_chat: {
            total_engaged_users: 11,
            models: [
              {
                name: "gpt-4o",
                total_engaged_users: 9,
                total_chats: 120,
              },
            ],
          },
          copilot_dotcom_pull_requests: {
            total_engaged_users: 7,
          },
        },
        {
          date: "2026-05-03",
          total_active_users: 60,
          total_engaged_users: 45,
          copilot_ide_code_completions: {
            total_engaged_users: 35,
            editors: [{ name: "vscode", total_engaged_users: 35 }],
          },
          copilot_ide_chat: {
            total_engaged_users: 24,
          },
          copilot_dotcom_chat: {
            total_engaged_users: 12,
            models: [
              {
                name: "claude-3.5-sonnet",
                total_engaged_users: 12,
                total_chats: 200,
              },
            ],
          },
          copilot_dotcom_pull_requests: {
            total_engaged_users: 8,
          },
        },
      ]),
    );
    // Second call returns empty array to terminate pagination.
    fakeFetch.mockResolvedValueOnce(jsonResponse([]));

    const rows = await fetchCopilotMetrics({
      token: "ghp_FAKE_TOKEN_xyz",
      org: "acme",
      since: new Date("2026-05-01T00:00:00Z"),
      until: new Date("2026-05-03T23:59:59Z"),
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    expect(rows).toHaveLength(3);

    const first = rows[0]!;
    expect(first.date).toBe("2026-05-01");
    expect(first.totalActiveUsers).toBe(50);
    expect(first.totalEngagedUsers).toBe(40);
    expect(first.ideCompletionsEngagedUsers).toBe(30);
    expect(first.ideChatEngagedUsers).toBe(20);
    expect(first.dotcomChatEngagedUsers).toBe(10);
    expect(first.dotcomPullRequestsEngagedUsers).toBe(6);
    expect(first.editorsUsed).toEqual(["vscode", "jetbrains"]);
    expect(first.modelsUsed).toEqual([
      { name: "gpt-4o", engagedUsers: 8, totalChats: 100 },
      { name: "claude-3.5-sonnet", engagedUsers: 4, totalChats: 30 },
    ]);

    const second = rows[1]!;
    expect(second.editorsUsed).toEqual(["vscode", "neovim"]);
    expect(second.modelsUsed).toHaveLength(1);
    expect(second.modelsUsed[0]).toEqual({
      name: "gpt-4o",
      engagedUsers: 9,
      totalChats: 120,
    });

    const third = rows[2]!;
    expect(third.editorsUsed).toEqual(["vscode"]);
    expect(third.modelsUsed[0]?.name).toBe("claude-3.5-sonnet");

    // Verify the request URL carries query params and headers carry the
    // bearer token + GitHub API version.
    const firstCall = fakeFetch.mock.calls[0];
    expect(firstCall).toBeDefined();
    const url = firstCall![0] as string;
    expect(url).toContain("https://api.github.com/orgs/acme/copilot/metrics");
    expect(url).toContain("since=");
    expect(url).toContain("until=");
    expect(url).toContain("page=1");
    const init = firstCall![1] as RequestInit | undefined;
    expect(init).toBeDefined();
    const headers = init!.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer ghp_FAKE_TOKEN_xyz");
    expect(headers["Accept"]).toBe("application/vnd.github+json");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });

  it("pagination: walks pages until empty array", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse([
          {
            date: "2026-05-01",
            total_active_users: 10,
            total_engaged_users: 5,
          },
          {
            date: "2026-05-02",
            total_active_users: 12,
            total_engaged_users: 6,
          },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            date: "2026-05-03",
            total_active_users: 14,
            total_engaged_users: 7,
          },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse([]));

    const rows = await fetchCopilotMetrics({
      token: "ghp_xyz",
      org: "acme",
      since: new Date("2026-05-01T00:00:00Z"),
      until: new Date("2026-05-03T23:59:59Z"),
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    expect(rows).toHaveLength(3);
    expect(fakeFetch).toHaveBeenCalledTimes(3);

    const url1 = fakeFetch.mock.calls[0]![0] as string;
    expect(url1).toContain("page=1");
    const url2 = fakeFetch.mock.calls[1]![0] as string;
    expect(url2).toContain("page=2");
    const url3 = fakeFetch.mock.calls[2]![0] as string;
    expect(url3).toContain("page=3");

    expect(rows.map((r) => r.date)).toEqual([
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
    ]);
  });

  it("missing_fields: nulls for optional sections, empty arrays for models/editors", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse([
          {
            date: "2026-05-01",
            total_active_users: 10,
            total_engaged_users: 2,
            // No copilot_ide_code_completions, no copilot_ide_chat,
            // no copilot_dotcom_chat, no copilot_dotcom_pull_requests.
          },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse([]));

    const rows = await fetchCopilotMetrics({
      token: "ghp_xyz",
      org: "acme",
      since: new Date("2026-05-01T00:00:00Z"),
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.date).toBe("2026-05-01");
    expect(r.totalActiveUsers).toBe(10);
    expect(r.totalEngagedUsers).toBe(2);
    expect(r.ideCompletionsEngagedUsers).toBeNull();
    expect(r.ideChatEngagedUsers).toBeNull();
    expect(r.dotcomChatEngagedUsers).toBeNull();
    expect(r.dotcomPullRequestsEngagedUsers).toBeNull();
    expect(r.modelsUsed).toEqual([]);
    expect(r.editorsUsed).toEqual([]);
  });

  it("auth_error: 401 throws CopilotMetricsError without leaking token", async () => {
    const token = "ghp_SECRET_DO_NOT_LEAK_abc123XYZ";
    const fakeFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Bad credentials" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );

    let caught: unknown;
    try {
      await fetchCopilotMetrics({
        token,
        org: "acme",
        since: new Date("2026-05-01T00:00:00Z"),
        fetchImpl: fakeFetch as unknown as typeof fetch,
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(CopilotMetricsError);
    const err = caught as CopilotMetricsError;
    expect(err.status).toBe(401);
    expect(err.message).not.toContain(token);
    expect(err.message).not.toContain("ghp_SECRET_DO_NOT_LEAK");
    // Stringifying the whole error (incl. .body) must not include the token.
    expect(
      JSON.stringify({ message: err.message, body: err.body }),
    ).not.toContain(token);
  });

  it("rate_limit: 429 throws CopilotMetricsError with status 429", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }));

    let caught: unknown;
    try {
      await fetchCopilotMetrics({
        token: "ghp_xyz",
        org: "acme",
        since: new Date("2026-05-01T00:00:00Z"),
        fetchImpl: fakeFetch as unknown as typeof fetch,
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(CopilotMetricsError);
    const err = caught as CopilotMetricsError;
    expect(err.status).toBe(429);
    expect(err.body).toContain("rate limited");
  });

  it("page_cap: hard cap at 50 pages, console.warn, no throw", async () => {
    const fakeFetch = vi.fn().mockImplementation(async () =>
      jsonResponse([
        {
          date: "2026-05-01",
          total_active_users: 1,
          total_engaged_users: 1,
        },
      ]),
    );

    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    try {
      const rows = await fetchCopilotMetrics({
        token: "ghp_xyz",
        org: "acme",
        since: new Date("2026-05-01T00:00:00Z"),
        fetchImpl: fakeFetch as unknown as typeof fetch,
      });

      expect(fakeFetch).toHaveBeenCalledTimes(50);
      expect(rows).toHaveLength(50);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const warnMsg = warnSpy.mock.calls[0]?.[0];
      expect(String(warnMsg)).toMatch(/page cap/i);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
