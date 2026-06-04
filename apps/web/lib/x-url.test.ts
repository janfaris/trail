import { describe, expect, it } from "vitest";
import { parseXPostUrl } from "./x-url";

describe("parseXPostUrl", () => {
  it("parses and normalizes x.com status URLs", () => {
    expect(parseXPostUrl("https://x.com/janfaris/status/1234567890123456789")).toEqual({
      handle: "janfaris",
      statusId: "1234567890123456789",
      normalizedUrl: "https://x.com/janfaris/status/1234567890123456789",
    });
  });

  it("parses twitter.com and mobile.twitter.com status URL variants", () => {
    expect(parseXPostUrl("https://twitter.com/user_name/statuses/12345?ref=trail")).toEqual({
      handle: "user_name",
      statusId: "12345",
      normalizedUrl: "https://x.com/user_name/status/12345",
    });

    expect(parseXPostUrl("https://mobile.twitter.com/user_name/status/67890")).toEqual({
      handle: "user_name",
      statusId: "67890",
      normalizedUrl: "https://x.com/user_name/status/67890",
    });
  });

  it("rejects unsupported hosts, handles, and non-status paths", () => {
    expect(parseXPostUrl("https://example.com/janfaris/status/12345")).toBeNull();
    expect(parseXPostUrl("https://x.com/this_handle_is_too_long/status/12345")).toBeNull();
    expect(parseXPostUrl("https://x.com/janfaris")).toBeNull();
    expect(parseXPostUrl("https://x.com/janfaris/status/not-a-number")).toBeNull();
  });
});
