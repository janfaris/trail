import { describe, it, expect, vi } from "vitest";
import {
  fetchOpenAIOrgUsage,
  OpenAIUsageError,
} from "../src/openai-org.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("openai-org client", () => {
  it("happy_path: flattens 2 buckets × 3 rows into 6 OpenAIUsageRow", async () => {
    const fakeFetch = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        object: "page",
        data: [
          {
            object: "bucket",
            start_time: 1767225600, // 2026-01-01T00:00:00Z
            end_time: 1767312000, // 2026-01-02T00:00:00Z
            results: [
              {
                object: "organization.usage.completions.result",
                model: "gpt-4o",
                project_id: "proj_a",
                input_tokens: 100,
                input_cached_tokens: 20,
                output_tokens: 40,
                num_model_requests: 5,
              },
              {
                object: "organization.usage.completions.result",
                model: "gpt-4o-mini",
                project_id: "proj_a",
                input_tokens: 50,
                input_cached_tokens: 10,
                output_tokens: 20,
                num_model_requests: 3,
              },
              {
                object: "organization.usage.completions.result",
                model: "o1",
                project_id: "proj_a",
                input_tokens: 10,
                input_cached_tokens: 0,
                output_tokens: 80,
                num_model_requests: 1,
              },
            ],
          },
          {
            object: "bucket",
            start_time: 1767312000, // 2026-01-02T00:00:00Z
            end_time: 1767398400, // 2026-01-03T00:00:00Z
            results: [
              {
                object: "organization.usage.completions.result",
                model: "gpt-4o",
                project_id: "proj_b",
                input_tokens: 500,
                input_cached_tokens: 100,
                output_tokens: 200,
                num_model_requests: 25,
              },
              {
                object: "organization.usage.completions.result",
                model: "gpt-4o-mini",
                project_id: "proj_b",
                input_tokens: 250,
                input_cached_tokens: 50,
                output_tokens: 100,
                num_model_requests: 15,
              },
              {
                object: "organization.usage.completions.result",
                model: "o1",
                project_id: "proj_b",
                input_tokens: 50,
                input_cached_tokens: 0,
                output_tokens: 400,
                num_model_requests: 5,
              },
            ],
          },
        ],
        has_more: false,
        next_page: null,
      }),
    );

    const rows = await fetchOpenAIOrgUsage({
      apiKey: "sk-admin-XYZ",
      startingAt: new Date("2026-01-01T00:00:00Z"),
      endingAt: new Date("2026-01-03T00:00:00Z"),
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    expect(rows).toHaveLength(6);
    expect(fakeFetch).toHaveBeenCalledTimes(1);

    const first = rows[0]!;
    expect(first.model).toBe("gpt-4o");
    expect(first.projectId).toBe("proj_a");
    expect(first.bucketStart).toBe("2026-01-01T00:00:00.000Z");
    expect(first.bucketEnd).toBe("2026-01-02T00:00:00.000Z");
    expect(first.inputTokens).toBe(100);
    expect(first.inputCachedTokens).toBe(20);
    expect(first.outputTokens).toBe(40);
    expect(first.numRequests).toBe(5);

    const fourth = rows[3]!;
    expect(fourth.projectId).toBe("proj_b");
    expect(fourth.bucketStart).toBe("2026-01-02T00:00:00.000Z");

    const totalOutput = rows.reduce((a, r) => a + r.outputTokens, 0);
    expect(totalOutput).toBe(40 + 20 + 80 + 200 + 100 + 400);

    const totalRequests = rows.reduce((a, r) => a + r.numRequests, 0);
    expect(totalRequests).toBe(5 + 3 + 1 + 25 + 15 + 5);

    // Verify the request URL carries the required query params and the
    // headers carry the Bearer api key.
    const firstCall = fakeFetch.mock.calls[0];
    expect(firstCall).toBeDefined();
    const url = firstCall![0] as string;
    expect(url).toContain("start_time=");
    expect(url).toContain("end_time=");
    expect(url).toContain("bucket_width=1d");
    expect(url).toContain("group_by%5B%5D=model");
    expect(url).toContain("group_by%5B%5D=project_id");
    const init = firstCall![1] as RequestInit | undefined;
    expect(init).toBeDefined();
    const headers = init!.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk-admin-XYZ");
  });

  it("pagination: follows next_page until has_more is false", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          object: "page",
          data: [
            {
              object: "bucket",
              start_time: 1767225600,
              end_time: 1767312000,
              results: [
                {
                  model: "m1",
                  input_tokens: 0,
                  input_cached_tokens: 0,
                  output_tokens: 1,
                  num_model_requests: 1,
                },
                {
                  model: "m2",
                  input_tokens: 0,
                  input_cached_tokens: 0,
                  output_tokens: 2,
                  num_model_requests: 1,
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
          object: "page",
          data: [
            {
              object: "bucket",
              start_time: 1767312000,
              end_time: 1767398400,
              results: [
                {
                  model: "m3",
                  input_tokens: 0,
                  input_cached_tokens: 0,
                  output_tokens: 3,
                  num_model_requests: 1,
                },
                {
                  model: "m4",
                  input_tokens: 0,
                  input_cached_tokens: 0,
                  output_tokens: 4,
                  num_model_requests: 1,
                },
              ],
            },
          ],
          has_more: false,
          next_page: null,
        }),
      );

    const rows = await fetchOpenAIOrgUsage({
      apiKey: "sk-admin-XYZ",
      startingAt: new Date("2026-01-01T00:00:00Z"),
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

  it("missing_fields: input_cached_tokens defaults to 0; string fields to null", async () => {
    const fakeFetch = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        object: "page",
        data: [
          {
            object: "bucket",
            start_time: 1767225600,
            end_time: 1767312000,
            // Intentionally omit input_cached_tokens, input_tokens,
            // num_model_requests, project_id, user_id, api_key_id, batch.
            results: [{ model: "m1", output_tokens: 5 }],
          },
        ],
        has_more: false,
        next_page: null,
      }),
    );

    const rows = await fetchOpenAIOrgUsage({
      apiKey: "sk-admin-XYZ",
      startingAt: new Date("2026-01-01T00:00:00Z"),
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.inputCachedTokens).toBe(0);
    expect(r.inputTokens).toBe(0);
    expect(r.outputTokens).toBe(5);
    expect(r.numRequests).toBe(0);
    expect(r.model).toBe("m1");
    expect(r.projectId).toBeNull();
    expect(r.userId).toBeNull();
    expect(r.apiKeyId).toBeNull();
    expect(r.batch).toBeNull();
  });

  it("auth_error: 401 throws OpenAIUsageError without leaking api key", async () => {
    const apiKey = "sk-admin-SECRET-DO-NOT-LEAK-abc123";
    const fakeFetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { type: "invalid_request_error" } }),
        {
          status: 401,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    let caught: unknown;
    try {
      await fetchOpenAIOrgUsage({
        apiKey,
        startingAt: new Date("2026-01-01T00:00:00Z"),
        fetchImpl: fakeFetch as unknown as typeof fetch,
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(OpenAIUsageError);
    const err = caught as OpenAIUsageError;
    expect(err.status).toBe(401);
    expect(err.message).not.toContain(apiKey);
    expect(err.message).not.toContain("sk-admin-");
    // Stringifying the whole error (incl. .body) must not include the key.
    expect(
      JSON.stringify({ message: err.message, body: err.body }),
    ).not.toContain(apiKey);
  });

  it("rate_limit: 429 throws OpenAIUsageError with status 429", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }));

    let caught: unknown;
    try {
      await fetchOpenAIOrgUsage({
        apiKey: "sk-admin-XYZ",
        startingAt: new Date("2026-01-01T00:00:00Z"),
        fetchImpl: fakeFetch as unknown as typeof fetch,
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(OpenAIUsageError);
    const err = caught as OpenAIUsageError;
    expect(err.status).toBe(429);
    expect(err.body).toContain("slow down");
  });

  it("page_cap: hard cap at 100 pages, console.warn, no throw", async () => {
    const fakeFetch = vi.fn().mockImplementation(async () =>
      jsonResponse({
        object: "page",
        data: [
          {
            object: "bucket",
            start_time: 1767225600,
            end_time: 1767312000,
            results: [
              {
                model: "m",
                input_tokens: 0,
                input_cached_tokens: 0,
                output_tokens: 1,
                num_model_requests: 1,
              },
            ],
          },
        ],
        has_more: true,
        next_page: "never_ending",
      }),
    );

    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    try {
      const rows = await fetchOpenAIOrgUsage({
        apiKey: "sk-admin-XYZ",
        startingAt: new Date("2026-01-01T00:00:00Z"),
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

  it("request_url_uses_epoch_seconds: start_time is epoch seconds, not ms or ISO", async () => {
    const fakeFetch = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        object: "page",
        data: [],
        has_more: false,
        next_page: null,
      }),
    );

    await fetchOpenAIOrgUsage({
      apiKey: "sk-admin-XYZ",
      startingAt: new Date("2026-01-15T00:00:00Z"),
      endingAt: new Date("2026-01-16T00:00:00Z"),
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    const call = fakeFetch.mock.calls[0];
    expect(call).toBeDefined();
    const url = new URL(call![0] as string);

    // 2026-01-15T00:00:00Z → epoch seconds 1768435200.
    expect(url.searchParams.get("start_time")).toBe("1768435200");
    // Defensive: must NOT be milliseconds (×1000) or ISO.
    expect(url.searchParams.get("start_time")).not.toBe("1768435200000");
    expect(url.searchParams.get("start_time")).not.toContain("T");
    expect(url.searchParams.get("start_time")).not.toContain("-");

    // Also verify end_time conversion for completeness.
    expect(url.searchParams.get("end_time")).toBe("1768521600");
  });
});
