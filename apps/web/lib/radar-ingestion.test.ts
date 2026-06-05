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

  it("stores media previews from X includes in the radar entities payload", () => {
    const tweet = normalizeRadarTweet(
      {
        id: "456",
        author_id: "42",
        text: "New agent UI screenshots just dropped.",
        created_at: "2026-06-01T21:00:00.000Z",
        attachments: { media_keys: ["3_abc", "7_video", "missing"] },
      },
      source,
      "X API",
      new Map([
        [
          "3_abc",
          {
            media_key: "3_abc",
            type: "photo",
            url: "https://pbs.twimg.com/media/agent-ui.jpg",
            width: 1200,
            height: 800,
            alt_text: "Screenshot of a compact agent dashboard",
          },
        ],
        [
          "7_video",
          {
            media_key: "7_video",
            type: "video",
            preview_image_url: "https://pbs.twimg.com/ext_tw_video_thumb/agent-ui.jpg",
          },
        ],
      ]),
    );

    const values = buildRadarSignalWrite(source, tweet);

    expect(values.entities.media).toEqual([
      {
        mediaKey: "3_abc",
        type: "photo",
        url: "https://pbs.twimg.com/media/agent-ui.jpg",
        previewImageUrl: undefined,
        width: 1200,
        height: 800,
        altText: "Screenshot of a compact agent dashboard",
      },
      {
        mediaKey: "7_video",
        type: "video",
        url: "https://pbs.twimg.com/ext_tw_video_thumb/agent-ui.jpg",
        previewImageUrl: "https://pbs.twimg.com/ext_tw_video_thumb/agent-ui.jpg",
        width: undefined,
        height: undefined,
        altText: undefined,
      },
    ]);
  });

  it("extracts the highest-bitrate mp4 from video variants as videoUrl", () => {
    const tweet = normalizeRadarTweet(
      {
        id: "789",
        author_id: "42",
        text: "Watch this agent ship a feature end to end.",
        created_at: "2026-06-01T21:00:00.000Z",
        attachments: { media_keys: ["13_vid"] },
      },
      source,
      "X API",
      new Map([
        [
          "13_vid",
          {
            media_key: "13_vid",
            type: "video",
            preview_image_url: "https://pbs.twimg.com/amplify_video_thumb/clip.jpg",
            variants: [
              { content_type: "application/x-mpegURL", url: "https://video.twimg.com/clip.m3u8" },
              {
                bit_rate: 256000,
                content_type: "video/mp4",
                url: "https://video.twimg.com/low.mp4",
              },
              {
                bit_rate: 2176000,
                content_type: "video/mp4",
                url: "https://video.twimg.com/high.mp4",
              },
            ],
          },
        ],
      ]),
    );

    const values = buildRadarSignalWrite(source, tweet);
    const media = values.entities.media as Array<{ videoUrl?: string }>;
    expect(media[0]?.videoUrl).toBe("https://video.twimg.com/high.mp4");
  });

  it("leaves videoUrl undefined when no mp4 variant is present", () => {
    const tweet = normalizeRadarTweet(
      {
        id: "790",
        author_id: "42",
        text: "HLS-only clip.",
        created_at: "2026-06-01T21:00:00.000Z",
        attachments: { media_keys: ["13_hls"] },
      },
      source,
      "X API",
      new Map([
        [
          "13_hls",
          {
            media_key: "13_hls",
            type: "video",
            preview_image_url: "https://pbs.twimg.com/amplify_video_thumb/hls.jpg",
            variants: [
              { content_type: "application/x-mpegURL", url: "https://video.twimg.com/only.m3u8" },
            ],
          },
        ],
      ]),
    );

    const values = buildRadarSignalWrite(source, tweet);
    const media = values.entities.media as Array<{ videoUrl?: string }>;
    expect(media[0]?.videoUrl).toBeUndefined();
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
