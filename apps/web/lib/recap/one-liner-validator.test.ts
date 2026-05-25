import { describe, it, expect } from "vitest";
import { validateOneLiner } from "./one-liner-validator";

describe("validateOneLiner()", () => {
  it("passes a clean shipped line", () => {
    const { warnings } = validateOneLiner(
      "Shipped Stripe webhook idempotency after retry-storming production for twenty minutes.",
    );
    expect(warnings).toEqual([]);
  });

  it("warns on empty input", () => {
    expect(validateOneLiner("").warnings).toContain("empty one-liner");
  });

  it("warns on too short", () => {
    const { warnings } = validateOneLiner("Shipped Stripe.");
    expect(warnings.some((w) => w.startsWith("too short"))).toBe(true);
  });

  it("warns on too long", () => {
    const long = "Shipped " + Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ") + ".";
    const { warnings } = validateOneLiner(long);
    expect(warnings.some((w) => w.startsWith("too long"))).toBe(true);
  });

  it("warns on multi-sentence", () => {
    const { warnings } = validateOneLiner(
      "Shipped Stripe webhook idempotency. It took forever to debug.",
    );
    expect(warnings.some((w) => w.startsWith("multi-sentence"))).toBe(true);
  });

  it("warns on banned words", () => {
    const { warnings } = validateOneLiner(
      "Leveraged AI to build a robust authentication system this week.",
    );
    expect(warnings.some((w) => w.includes("leveraged"))).toBe(true);
    expect(warnings.some((w) => w.includes("robust"))).toBe(true);
  });

  it("warns on banned openings", () => {
    const { warnings } = validateOneLiner(
      "Excited to share my new authentication flow built with better-auth this week.",
    );
    expect(warnings.some((w) => w.includes("banned opening"))).toBe(true);
  });

  it("warns on emoji/exclamation/hashtag", () => {
    const { warnings } = validateOneLiner(
      "Shipped auth with better-auth this week 🚀 #buildinpublic!",
    );
    expect(warnings).toContain("contains emoji");
    expect(warnings).toContain("contains exclamation mark");
    expect(warnings).toContain("contains hashtag");
  });

  it("warns on em-dash pause", () => {
    const { warnings } = validateOneLiner(
      "Shipped auth this week — better-auth turned out cleaner than NextAuth.",
    );
    expect(warnings).toContain("contains em-dash pause");
  });
});
