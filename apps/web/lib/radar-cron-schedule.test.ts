import { describe, expect, it } from "vitest";
import { RADAR_FETCH_SCHEDULE, nextCronRunAfter } from "./radar-cron-schedule";

describe("nextCronRunAfter", () => {
  it("returns this hour's :30 when before :30", () => {
    const from = new Date("2026-06-02T08:05:00.000Z");
    expect(nextCronRunAfter(RADAR_FETCH_SCHEDULE, from).toISOString()).toBe(
      "2026-06-02T08:30:00.000Z",
    );
  });

  it("rolls to next hour when at or after :30", () => {
    const from = new Date("2026-06-02T08:30:00.000Z");
    expect(nextCronRunAfter(RADAR_FETCH_SCHEDULE, from).toISOString()).toBe(
      "2026-06-02T09:30:00.000Z",
    );
  });

  it("rolls across midnight", () => {
    const from = new Date("2026-06-02T23:45:00.000Z");
    expect(nextCronRunAfter(RADAR_FETCH_SCHEDULE, from).toISOString()).toBe(
      "2026-06-03T00:30:00.000Z",
    );
  });

  it("supports a fixed hour", () => {
    const from = new Date("2026-06-02T08:05:00.000Z");
    expect(nextCronRunAfter("0 6 * * *", from).toISOString()).toBe("2026-06-03T06:00:00.000Z");
  });

  it("throws on unsupported expressions", () => {
    expect(() => nextCronRunAfter("0 9 * * 1")).toThrow();
    expect(() => nextCronRunAfter("nope")).toThrow();
  });
});
