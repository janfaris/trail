import { describe, expect, it } from "vitest";
import {
  VERIFIED_BUILDER_THRESHOLD,
  type VerifiableSession,
  computeVerifiedBuilder,
  isVerifiedShippedSession,
} from "./verified-builder";

function session(over: Partial<VerifiableSession> = {}): VerifiableSession {
  return {
    visibility: "public",
    sharedAt: new Date("2024-01-01T00:00:00Z"),
    outcome: null,
    linkedCommitSha: null,
    receiptStatus: null,
    receiptVerifiedAt: null,
    ...over,
  };
}

describe("isVerifiedShippedSession", () => {
  it("counts a receipt-verified shipped session", () => {
    expect(
      isVerifiedShippedSession(
        session({ receiptStatus: "shipped", receiptVerifiedAt: new Date() }),
      ),
    ).toBe(true);
  });

  it("rejects receiptStatus=shipped when receiptVerifiedAt is missing", () => {
    expect(isVerifiedShippedSession(session({ receiptStatus: "shipped" }))).toBe(false);
  });

  it("ignores outcome+linkedCommitSha — that pair is forgeable and not sufficient", () => {
    expect(
      isVerifiedShippedSession(session({ outcome: "shipped", linkedCommitSha: "a1b2c3d4" })),
    ).toBe(false);
  });

  it("ignores a non-shipped receiptStatus even with a commit", () => {
    expect(
      isVerifiedShippedSession(
        session({ receiptStatus: "draft", outcome: "shipped", linkedCommitSha: "a1b2c3d4" }),
      ),
    ).toBe(false);
  });

  it("never counts a non-public session, even if receipt-verified", () => {
    for (const visibility of ["private", "pending", "redacted"]) {
      expect(
        isVerifiedShippedSession(
          session({
            visibility,
            receiptStatus: "shipped",
            receiptVerifiedAt: new Date(),
          }),
        ),
      ).toBe(false);
    }
  });

  it("never counts an unshared public-default session, even if receipt-verified", () => {
    expect(
      isVerifiedShippedSession(
        session({
          sharedAt: null,
          receiptStatus: "shipped",
          receiptVerifiedAt: new Date(),
        }),
      ),
    ).toBe(false);
  });
});

describe("computeVerifiedBuilder", () => {
  it("is unverified with zero qualifying sessions", () => {
    const status = computeVerifiedBuilder([
      session({ outcome: "unknown" }),
      session({
        visibility: "private",
        receiptStatus: "shipped",
        receiptVerifiedAt: new Date(),
      }),
    ]);
    expect(status).toEqual({
      verified: false,
      verifiedShippedCount: 0,
      threshold: VERIFIED_BUILDER_THRESHOLD,
    });
  });

  it("verifies at the default threshold of one receipt-verified session", () => {
    const status = computeVerifiedBuilder([
      session({ receiptStatus: "shipped", receiptVerifiedAt: new Date() }),
      session({ outcome: "rabbithole" }),
    ]);
    expect(status.verified).toBe(true);
    expect(status.verifiedShippedCount).toBe(1);
    expect(status.threshold).toBe(1);
  });

  it("counts only receipt-verified public sessions in the total", () => {
    const status = computeVerifiedBuilder([
      session({ receiptStatus: "shipped", receiptVerifiedAt: new Date() }),
      session({ receiptStatus: "shipped", receiptVerifiedAt: new Date() }),
      // forgeable proxy — ignored
      session({ outcome: "shipped", linkedCommitSha: "a1" }),
      // private — ignored
      session({
        visibility: "private",
        receiptStatus: "shipped",
        receiptVerifiedAt: new Date(),
      }),
    ]);
    expect(status.verifiedShippedCount).toBe(2);
    expect(status.verified).toBe(true);
  });

  it("honours a custom higher threshold", () => {
    const status = computeVerifiedBuilder(
      [session({ receiptStatus: "shipped", receiptVerifiedAt: new Date() })],
      3,
    );
    expect(status.verified).toBe(false);
    expect(status.verifiedShippedCount).toBe(1);
    expect(status.threshold).toBe(3);
  });

  it("handles an empty session list", () => {
    expect(computeVerifiedBuilder([])).toEqual({
      verified: false,
      verifiedShippedCount: 0,
      threshold: VERIFIED_BUILDER_THRESHOLD,
    });
  });
});
