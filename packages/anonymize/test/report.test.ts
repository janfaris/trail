import { describe, it, expect } from "vitest";
import { anonymize, maskPreview } from "../src/index.js";
import type { Session } from "@trail/schema";

function s(events: Session["events"]): Session {
  return {
    id: "sess-1",
    user: "alice",
    tool: "claude-code",
    startedAt: "2025-01-01T00:00:00Z",
    events,
  };
}

describe("maskPreview", () => {
  it("masks the middle, keeping a short head + tail", () => {
    expect(maskPreview("sk-ant-abcdefghijklmnop2mno")).toBe("sk-a••••••••no");
    expect(maskPreview("jan@example.com")).toBe("jan@••••••••om");
  });

  it("reveals only the first char for very short values", () => {
    expect(maskPreview("topsy")).toBe("t••••");
    expect(maskPreview("ab")).toBe("a•");
  });

  it("collapses whitespace so multi-line matches render on one line", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----";
    const out = maskPreview(pem);
    expect(out).not.toContain("\n");
    expect(out.startsWith("----")).toBe(true);
  });

  it("never echoes more than head+tail of the raw value", () => {
    const secret = "abcdefghijklmnopqrstuvwxyz0123456789";
    const out = maskPreview(secret);
    // The long random middle must not survive.
    expect(out).not.toContain("ijklmnopqrstuvwxyz");
    expect(out).toBe("abcd••••••••89");
  });
});

describe("redaction report: categories + items", () => {
  it("keeps the legacy fields intact (additive change)", () => {
    const r = anonymize(s([{ kind: "prompt", at: "t", text: "ping jan@example.com" }]));
    expect(r.report.total).toBe(1);
    expect(r.report.byCategory.email).toBe(1);
    expect(Array.isArray(r.report.suspects)).toBe(true);
  });

  it("groups redactions by category with counts matching byCategory", () => {
    const r = anonymize(
      s([
        { kind: "prompt", at: "t", text: "key=sk-ant-abcdefghijklmnop2mno" },
        { kind: "decision", at: "t", note: "see /Users/janfaris/trail/foo.ts" },
        { kind: "prompt", at: "t", text: "ping jan@example.com and bob@example.org" },
      ]),
    );
    const cats = r.report.categories;
    const byCat = Object.fromEntries(cats.map((c) => [c.category, c.count]));
    expect(byCat.secret).toBe(1);
    expect(byCat.path).toBe(1);
    expect(byCat.email).toBe(2);
    // Counts in categories[] must mirror byCategory exactly.
    for (const c of cats) {
      expect(c.count).toBe(r.report.byCategory[c.category]);
    }
    // Only categories with >0 redactions appear.
    expect(cats.every((c) => c.count > 0)).toBe(true);
  });

  it("orders categories most-sensitive first", () => {
    const r = anonymize(
      s([
        { kind: "prompt", at: "t", text: "see http://api.corp.internal/v1" },
        { kind: "prompt", at: "t", text: "ping jan@example.com" },
        { kind: "prompt", at: "t", text: "token sk-ant-abcdefghijklmnop2mno" },
      ]),
    );
    const order = r.report.categories.map((c) => c.category);
    // secret must come before email which must come before internal-host.
    expect(order.indexOf("secret")).toBeLessThan(order.indexOf("email"));
    expect(order.indexOf("email")).toBeLessThan(order.indexOf("internal-host"));
  });

  it("records location (JSON path) and approximate offset per item", () => {
    const r = anonymize(s([{ kind: "prompt", at: "t", text: "key=sk-ant-abcdefghijklmnop2mno" }]));
    const item = r.report.items.find((i) => i.category === "secret");
    expect(item).toBeDefined();
    expect(item?.location).toBe("$.events[0].text");
    // "key=" is 4 chars, so the secret starts at offset 4.
    expect(item?.offset).toBe(4);
    expect(item?.label).toBe("<redacted:anthropic>");
    expect(item?.length).toBe("sk-ant-abcdefghijklmnop2mno".length);
  });

  it("walks nested tool_call args for item locations", () => {
    const r = anonymize(
      s([
        {
          kind: "tool_call",
          at: "t",
          name: "bash",
          args: { cmd: "echo ghp_abcdefghijklmnopqrst6789" },
        },
      ]),
    );
    const item = r.report.items.find((i) => i.category === "secret");
    expect(item?.location).toBe("$.events[0].args.cmd");
  });

  it("provides masked previews that never leak the raw secret", () => {
    const secret = "ghp_abcdefghijklmnopqrst6789";
    const r = anonymize(s([{ kind: "completion", at: "t", text: secret }]));
    const serialized = JSON.stringify(r.report.categories) + JSON.stringify(r.report.items);
    // The full token must not appear anywhere in the report.
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("abcdefghijklmnopqrst");
    const sample = r.report.categories.find((c) => c.category === "secret")?.samples[0];
    expect(sample?.preview).toContain("•");
  });

  it("caps per-category samples while keeping counts exact", () => {
    const events: Session["events"] = [];
    for (let i = 0; i < 9; i++) {
      events.push({ kind: "prompt", at: "t", text: `user${i}@example.com` });
    }
    const r = anonymize(s(events));
    expect(r.report.byCategory.email).toBe(9);
    const emailCat = r.report.categories.find((c) => c.category === "email");
    expect(emailCat?.count).toBe(9);
    // Samples are capped at 5 even though the count is 9.
    expect(emailCat?.samples.length).toBe(5);
  });

  it("is empty-but-valid when nothing is redacted", () => {
    const r = anonymize(s([{ kind: "prompt", at: "t", text: "just a normal prompt" }]));
    expect(r.report.total).toBe(0);
    expect(r.report.categories).toEqual([]);
    expect(r.report.items).toEqual([]);
  });
});
