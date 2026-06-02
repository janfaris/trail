import { describe, expect, it } from "vitest";
import { RADAR_FETCH_SCHEDULE, nextCronRunAfter } from "./radar-cron-schedule";

describe("nextCronRunAfter", () => {
  it("returns the next 6-hour window at :30", () => {
    const from = new Date("2026-06-02T08:05:00.000Z");
    expect(nextCronRunAfter(RADAR_FETCH_SCHEDULE, from).toISOString()).toBe(
      "2026-06-02T12:30:00.000Z",
    );
  });

  it("rolls to the next 6-hour window when at or after :30", () => {
    const from = new Date("2026-06-02T12:30:00.000Z");
    expect(nextCronRunAfter(RADAR_FETCH_SCHEDULE, from).toISOString()).toBe(
      "2026-06-02T18:30:00.000Z",
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

  it("supports every-n-hours syntax", () => {
    const from = new Date("2026-06-02T00:29:00.000Z");
    expect(nextCronRunAfter("30 */6 * * *", from).toISOString()).toBe("2026-06-02T00:30:00.000Z");
  });

  it("throws on unsupported expressions", () => {
    expect(() => nextCronRunAfter("0 9 * * 1")).toThrow();
    expect(() => nextCronRunAfter("nope")).toThrow();
  });
});
