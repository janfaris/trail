import { describe, expect, it } from "vitest";
import {
  buildRadarSignalWrite,
  normalizeRadarTweet,
  radarSignalUpdateValues,
} from "./radar-ingestion";
import type { RadarSource } from "./radar-sources";

const source: RadarSource = {
  handle: "swyx",
  name: "swyx",
  role: "AI engineering + agents",
  priority: 1,
};

describe("radar ingestion helpers", () => {
  it("normalizes X API tweet payloads and builds idempotent radar writes", () => {
    const tweet = normalizeRadarTweet(
      {
        id: "123",
        author_id: "42",
        text: " Leak: new Claude coding model is testing better SWE-bench scores. ",
        created_at: "2026-06-01T20:00:00.000Z",
        public_metrics: { like_count: 10, retweet_count: "2" },
        entities: { urls: [{ expanded_url: "https://example.com" }] },
        conversation_id: "123",
        lang: "en",
      },
      source,
    );

    const fetchedAt = new Date("2026-06-01T20:10:00.000Z");
    const values = buildRadarSignalWrite(source, tweet, fetchedAt);

    expect(values.id).toBe("x_123");
    expect(values.url).toBe("https://x.com/swyx/status/123");
    expect(values.category).toBe("rumor");
    expect(values.status).toBe("unverified");
    expect(values.entities.author_id).toBe("42");
    expect(values.entities.conversation_id).toBe("123");
    expect(values.fetchedAt).toBe(fetchedAt);
  });

  it("rejects invalid tweet timestamps loudly", () => {
    expect(() =>
      normalizeRadarTweet(
        {
          id: "123",
          text: "new model",
          created_at: "not-a-date",
        },
        source,
      ),
    ).toThrow("invalid created_at");
  });

  it("omits primary key from conflict update payloads", () => {
    const tweet = normalizeRadarTweet(
      {
        id: "123",
        text: "new model",
        created_at: "2026-06-01T20:00:00.000Z",
      },
      source,
    );
    const update = radarSignalUpdateValues(buildRadarSignalWrite(source, tweet));

    expect(update).not.toHaveProperty("id");
    expect(update).not.toHaveProperty("status");
    expect(update.externalId).toBe("123");
  });
});
