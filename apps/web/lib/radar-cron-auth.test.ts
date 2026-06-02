import { describe, expect, it } from "vitest";
import { authorizeRadarCronRequest } from "./radar-cron-auth";

describe("authorizeRadarCronRequest", () => {
  it("accepts the radar-specific secret", () => {
    const headers = new Headers({ authorization: "Bearer radar-secret" });

    expect(
      authorizeRadarCronRequest(headers, {
        RADAR_CRON_SECRET: "radar-secret",
        CRON_SECRET: "cron-secret",
      }),
    ).toEqual({ ok: true });
  });

  it("accepts the Vercel cron secret", () => {
    const headers = new Headers({ authorization: "Bearer cron-secret" });

    expect(
      authorizeRadarCronRequest(headers, {
        RADAR_CRON_SECRET: "radar-secret",
        CRON_SECRET: "cron-secret",
      }),
    ).toEqual({ ok: true });
  });

  it("rejects missing or wrong authorization", () => {
    expect(
      authorizeRadarCronRequest(new Headers(), {
        RADAR_CRON_SECRET: "radar-secret",
        CRON_SECRET: undefined,
      }),
    ).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("reports missing secret configuration", () => {
    expect(
      authorizeRadarCronRequest(new Headers({ authorization: "Bearer anything" }), {
        RADAR_CRON_SECRET: undefined,
        CRON_SECRET: undefined,
      }),
    ).toEqual({ ok: false, reason: "not-configured" });
  });
});
