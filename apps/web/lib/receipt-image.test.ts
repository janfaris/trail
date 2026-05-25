// Determinism check for the receipt PNG renderer. Same input → byte-identical
// output. If this ever fails, the renderer leaked non-deterministic state
// (system time, random IDs, default-font fallback chains) — fix at the
// source, don't loosen this test.

import { describe, it, expect } from "vitest";
import { renderReceiptPng, type ReceiptImageInput } from "./receipt-image";

const SAMPLE: ReceiptImageInput = {
  handle: "jan",
  slug: "abc123",
  shortId: "abc1234",
  tool: "claude-code",
  date: "2026-05-23",
  tldr:
    "Wired GitHub commit linkage so receipts can claim a real merged SHA from the default branch.",
  commitSha: "deadbeefcafebabe1234567890abcdef12345678",
  changedFiles: [
    "apps/web/lib/receipt-image.ts",
    "apps/web/app/api/receipt/[id]/image.png/route.ts",
    "apps/web/app/u/[user]/[slug]/page.tsx",
    "apps/web/package.json",
    "docs/plans/2026-05-23-trail-receipts-freelance-wedge.md",
    "apps/web/lib/receipt-image.test.ts",
  ],
  redactionCount: 3,
  status: "shipped",
};

describe("renderReceiptPng", () => {
  it("produces a byte-identical PNG for identical input", async () => {
    const a = await renderReceiptPng(SAMPLE);
    const b = await renderReceiptPng(SAMPLE);
    expect(a.equals(b)).toBe(true);
    expect(a.length).toBeGreaterThan(1000);
    // PNG magic: 89 50 4E 47
    expect(a[0]).toBe(0x89);
    expect(a[1]).toBe(0x50);
    expect(a[2]).toBe(0x4e);
    expect(a[3]).toBe(0x47);
  });

  it("renders all three status variants without throwing", async () => {
    for (const status of ["shipped", "draft", "unverified"] as const) {
      const buf = await renderReceiptPng({ ...SAMPLE, status });
      expect(buf.length).toBeGreaterThan(1000);
    }
  });
});
