import { describe, expect, it, vi } from "vitest";
import type { RadarSource } from "./radar-sources";
import { type RadarXApiError, fetchRadarTweetsForSource } from "./radar-x-api";

const source: RadarSource = {
  handle: "swyx",
  name: "swyx",
  role: "AI engineering + agents",
  priority: 1,
};

describe("fetchRadarTweetsForSource", () => {
  it("calls X recent search and normalizes returned tweets", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "123",
              text: "New agent workflow guide",
              created_at: "2026-06-01T20:00:00.000Z",
              public_metrics: { like_count: 5 },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "x-rate-limit-remaining": "58",
            "x-rate-limit-reset": "1780350000",
          },
        },
      ),
    );

    const result = await fetchRadarTweetsForSource({
      bearerToken: "token",
      source,
      limit: 20,
      apiBaseUrl: "https://api.example.test/2",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toContain("tweets/search/recent");
    expect(String(url)).toContain("from%3Aswyx");
    expect((init as RequestInit).headers).toMatchObject({
      authorization: "Bearer token",
    });
    expect(result.tweets).toHaveLength(1);
    expect(result.tweets[0]?.id).toBe("123");
    expect(result.rateLimit.remaining).toBe(58);
  });

  it("surfaces rate limit failures with retry metadata", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ detail: "rate limit exceeded" }] }), {
        status: 429,
        headers: { "retry-after": "60" },
      }),
    );

    await expect(
      fetchRadarTweetsForSource({
        bearerToken: "token",
        source,
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 60,
    } satisfies Partial<RadarXApiError>);
  });

  it("converts aborted requests into per-source failures", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    const fetchImpl = vi.fn().mockRejectedValue(abortError);

    await expect(
      fetchRadarTweetsForSource({
        bearerToken: "token",
        source,
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      status: 504,
    } satisfies Partial<RadarXApiError>);
  });

  it("times out stalled response bodies", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start() {
            // Keep the body open until the application-level timeout aborts it.
          },
        }),
        { status: 200 },
      ),
    );

    await expect(
      fetchRadarTweetsForSource({
        bearerToken: "token",
        source,
        requestTimeoutMs: 100,
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      status: 504,
    } satisfies Partial<RadarXApiError>);
  });
});
