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
    outcome: null,
    linkedCommitSha: null,
    receiptStatus: null,
    receiptVerifiedAt: null,
    ...over,
  };
}

describe("isVerifiedShippedSession", () => {
  it("counts a receipt-verified shipped session (future ideal)", () => {
    expect(
      isVerifiedShippedSession(
        session({ receiptStatus: "shipped", receiptVerifiedAt: new Date() }),
      ),
    ).toBe(true);
  });

  it("counts a shipped outcome backed by a real commit (populated proxy)", () => {
    expect(
      isVerifiedShippedSession(session({ outcome: "shipped", linkedCommitSha: "a1b2c3d4" })),
    ).toBe(true);
  });

  it("rejects a shipped outcome with no commit attached", () => {
    expect(isVerifiedShippedSession(session({ outcome: "shipped" }))).toBe(false);
  });

  it("rejects a shipped outcome with a blank commit sha", () => {
    expect(isVerifiedShippedSession(session({ outcome: "shipped", linkedCommitSha: "   " }))).toBe(
      false,
    );
  });

  it("rejects receiptStatus=shipped when receiptVerifiedAt is missing", () => {
    expect(isVerifiedShippedSession(session({ receiptStatus: "shipped" }))).toBe(false);
  });

  it("rejects a non-shipped outcome even with a commit", () => {
    expect(
      isVerifiedShippedSession(session({ outcome: "abandoned", linkedCommitSha: "a1b2c3d4" })),
    ).toBe(false);
  });

  it("never counts a non-public session, even if shipped + committed", () => {
    for (const visibility of ["private", "pending", "redacted"]) {
      expect(
        isVerifiedShippedSession(
          session({ visibility, outcome: "shipped", linkedCommitSha: "a1b2c3d4" }),
        ),
      ).toBe(false);
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
});

describe("computeVerifiedBuilder", () => {
  it("is unverified with zero qualifying sessions", () => {
    const status = computeVerifiedBuilder([
      session({ outcome: "unknown" }),
      session({ visibility: "private", outcome: "shipped", linkedCommitSha: "x1" }),
    ]);
    expect(status).toEqual({
      verified: false,
      verifiedShippedCount: 0,
      threshold: VERIFIED_BUILDER_THRESHOLD,
    });
  });

  it("verifies at the default threshold of one commit-backed shipped session", () => {
    const status = computeVerifiedBuilder([
      session({ outcome: "shipped", linkedCommitSha: "a1b2c3d4" }),
      session({ outcome: "rabbithole" }),
    ]);
    expect(status.verified).toBe(true);
    expect(status.verifiedShippedCount).toBe(1);
    expect(status.threshold).toBe(1);
  });

  it("counts both rule branches and ignores private sessions in the total", () => {
    const status = computeVerifiedBuilder([
      session({ outcome: "shipped", linkedCommitSha: "a1" }),
      session({ receiptStatus: "shipped", receiptVerifiedAt: new Date() }),
      session({ visibility: "private", outcome: "shipped", linkedCommitSha: "b2" }),
    ]);
    expect(status.verifiedShippedCount).toBe(2);
    expect(status.verified).toBe(true);
  });

  it("honours a custom higher threshold", () => {
    const status = computeVerifiedBuilder(
      [session({ outcome: "shipped", linkedCommitSha: "a1" })],
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
