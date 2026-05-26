import { describe, it, expect, vi } from "vitest";
import {
  fetchAnthropicOrgUsage,
  AnthropicUsageError,
} from "../src/anthropic-org.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("anthropic-org client", () => {
  it("happy_path: flattens 2 buckets × 3 rows into 6 AnthropicUsageRow", async () => {
    const fakeFetch = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            starting_at: "2026-05-01T00:00:00Z",
            ending_at: "2026-05-02T00:00:00Z",
            results: [
              {
                model: "claude-opus-4-7",
                workspace_id: "ws_a",
                uncached_input_tokens: 100,
                cache_creation_input_tokens: 200,
                cache_read_input_tokens: 300,
                output_tokens: 40,
              },
              {
                model: "claude-sonnet-4-6",
                workspace_id: "ws_a",
                uncached_input_tokens: 10,
                cache_creation_input_tokens: 20,
                cache_read_input_tokens: 30,
                output_tokens: 4,
              },
              {
                model: "claude-haiku-4-5",
                workspace_id: "ws_a",
                uncached_input_tokens: 1,
                cache_creation_input_tokens: 2,
                cache_read_input_tokens: 3,
                output_tokens: 1,
              },
            ],
          },
          {
            starting_at: "2026-05-02T00:00:00Z",
            ending_at: "2026-05-03T00:00:00Z",
            results: [
              {
                model: "claude-opus-4-7",
                workspace_id: "ws_b",
                uncached_input_tokens: 500,
                cache_creation_input_tokens: 600,
                cache_read_input_tokens: 700,
                output_tokens: 80,
              },
              {
                model: "claude-sonnet-4-6",
                workspace_id: "ws_b",
                uncached_input_tokens: 50,
                cache_creation_input_tokens: 60,
                cache_read_input_tokens: 70,
                output_tokens: 8,
              },
              {
                model: "claude-haiku-4-5",
                workspace_id: "ws_b",
                uncached_input_tokens: 5,
                cache_creation_input_tokens: 6,
                cache_read_input_tokens: 7,
                output_tokens: 2,
              },
            ],
          },
        ],
        has_more: false,
        next_page: null,
      }),
    );

    const rows = await fetchAnthropicOrgUsage({
      apiKey: "sk-ant-admin-XYZ",
      startingAt: new Date("2026-05-01T00:00:00Z"),
      endingAt: new Date("2026-05-03T00:00:00Z"),
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    expect(rows).toHaveLength(6);
    expect(fakeFetch).toHaveBeenCalledTimes(1);

    const first = rows[0]!;
    expect(first.model).toBe("claude-opus-4-7");
    expect(first.workspaceId).toBe("ws_a");
    expect(first.bucketStart).toBe("2026-05-01T00:00:00Z");
    expect(first.bucketEnd).toBe("2026-05-02T00:00:00Z");
    expect(first.uncachedInputTokens).toBe(100);
    expect(first.cacheCreationInputTokens).toBe(200);
    expect(first.cacheReadInputTokens).toBe(300);
    expect(first.outputTokens).toBe(40);

    const fourth = rows[3]!;
    expect(fourth.workspaceId).toBe("ws_b");
    expect(fourth.bucketStart).toBe("2026-05-02T00:00:00Z");

    const totalOutput = rows.reduce((a, r) => a + r.outputTokens, 0);
    expect(totalOutput).toBe(40 + 4 + 1 + 80 + 8 + 2);

    // Verify the request URL carries the required query params and the
    // headers carry the api key + anthropic-version.
    const firstCall = fakeFetch.mock.calls[0];
    expect(firstCall).toBeDefined();
    const url = firstCall![0] as string;
    expect(url).toContain("starting_at=");
    expect(url).toContain("ending_at=");
    expect(url).toContain("bucket_width=1d");
    expect(url).toContain("group_by%5B%5D=model");
    expect(url).toContain("group_by%5B%5D=workspace_id");
    const init = firstCall![1] as RequestInit | undefined;
    expect(init).toBeDefined();
    const headers = init!.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-admin-XYZ");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("pagination: follows next_page until has_more is false", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              starting_at: "a",
              ending_at: "b",
              results: [
                {
                  model: "m1",
                  output_tokens: 1,
                  uncached_input_tokens: 0,
                  cache_creation_input_tokens: 0,
                  cache_read_input_tokens: 0,
                },
                {
                  model: "m2",
                  output_tokens: 2,
                  uncached_input_tokens: 0,
                  cache_creation_input_tokens: 0,
                  cache_read_input_tokens: 0,
                },
              ],
            },
          ],
          has_more: true,
          next_page: "page_token_2",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              starting_at: "c",
              ending_at: "d",
              results: [
                {
                  model: "m3",
                  output_tokens: 3,
                  uncached_input_tokens: 0,
                  cache_creation_input_tokens: 0,
                  cache_read_input_tokens: 0,
                },
                {
                  model: "m4",
                  output_tokens: 4,
                  uncached_input_tokens: 0,
                  cache_creation_input_tokens: 0,
                  cache_read_input_tokens: 0,
                },
              ],
            },
          ],
          has_more: false,
          next_page: null,
        }),
      );

    const rows = await fetchAnthropicOrgUsage({
      apiKey: "sk-ant-admin-XYZ",
      startingAt: new Date("2026-05-01T00:00:00Z"),
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    expect(rows).toHaveLength(4);
    expect(fakeFetch).toHaveBeenCalledTimes(2);

    const firstUrl = fakeFetch.mock.calls[0]![0] as string;
    expect(firstUrl).not.toContain("page=");
    const secondUrl = fakeFetch.mock.calls[1]![0] as string;
    expect(secondUrl).toContain("page=page_token_2");

    expect(rows.map((r) => r.model)).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("missing_fields: token fields default to 0, string fields to null", async () => {
    const fakeFetch = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            starting_at: "a",
            ending_at: "b",
            // Intentionally omit cache_creation_input_tokens,
            // cache_read_input_tokens, uncached_input_tokens, workspace_id,
            // api_key_id, service_tier, context_window.
            results: [{ model: "m1", output_tokens: 5 }],
          },
        ],
        has_more: false,
        next_page: null,
      }),
    );

    const rows = await fetchAnthropicOrgUsage({
      apiKey: "sk-ant-admin-XYZ",
      startingAt: new Date("2026-05-01T00:00:00Z"),
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.cacheCreationInputTokens).toBe(0);
    expect(r.cacheReadInputTokens).toBe(0);
    expect(r.uncachedInputTokens).toBe(0);
    expect(r.outputTokens).toBe(5);
    expect(r.model).toBe("m1");
    expect(r.workspaceId).toBeNull();
    expect(r.apiKeyId).toBeNull();
    expect(r.serviceTier).toBeNull();
    expect(r.contextWindow).toBeNull();
  });

  it("auth_error: 401 throws AnthropicUsageError without leaking api key", async () => {
    const apiKey = "sk-ant-admin-SECRET-DO-NOT-LEAK-abc123";
    const fakeFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { type: "authentication_error" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );

    let caught: unknown;
    try {
      await fetchAnthropicOrgUsage({
        apiKey,
        startingAt: new Date("2026-05-01T00:00:00Z"),
        fetchImpl: fakeFetch as unknown as typeof fetch,
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(AnthropicUsageError);
    const err = caught as AnthropicUsageError;
    expect(err.status).toBe(401);
    expect(err.message).not.toContain(apiKey);
    expect(err.message).not.toContain("sk-ant-admin-");
    // Stringifying the whole error (incl. .body) must not include the key.
    expect(JSON.stringify({ message: err.message, body: err.body })).not.toContain(
      apiKey,
    );
  });

  it("rate_limit: 429 throws AnthropicUsageError with status 429", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }));

    let caught: unknown;
    try {
      await fetchAnthropicOrgUsage({
        apiKey: "sk-ant-admin-XYZ",
        startingAt: new Date("2026-05-01T00:00:00Z"),
        fetchImpl: fakeFetch as unknown as typeof fetch,
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(AnthropicUsageError);
    const err = caught as AnthropicUsageError;
    expect(err.status).toBe(429);
    expect(err.body).toContain("slow down");
  });

  it("page_cap: hard cap at 100 pages, console.warn, no throw", async () => {
    const fakeFetch = vi.fn().mockImplementation(async () =>
      jsonResponse({
        data: [
          {
            starting_at: "a",
            ending_at: "b",
            results: [
              {
                model: "m",
                output_tokens: 1,
                uncached_input_tokens: 0,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
              },
            ],
          },
        ],
        has_more: true,
        next_page: "never_ending",
      }),
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const rows = await fetchAnthropicOrgUsage({
        apiKey: "sk-ant-admin-XYZ",
        startingAt: new Date("2026-05-01T00:00:00Z"),
        fetchImpl: fakeFetch as unknown as typeof fetch,
      });

      expect(fakeFetch).toHaveBeenCalledTimes(100);
      expect(rows).toHaveLength(100);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const warnMsg = warnSpy.mock.calls[0]?.[0];
      expect(String(warnMsg)).toMatch(/page cap/i);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
