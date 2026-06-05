import { describe, expect, it } from "vitest";
import { RESERVED_HANDLES, deriveInitialHandle, normalizeHandle, validateHandle } from "./handle";

describe("normalizeHandle", () => {
  it("lowercases and strips invalid characters", () => {
    expect(normalizeHandle("Jan Faris!")).toBe("janfaris");
    expect(normalizeHandle("  Cool_Builder  ")).toBe("coolbuilder");
    expect(normalizeHandle("a--b--c")).toBe("a-b-c");
    expect(normalizeHandle("-edge-")).toBe("edge");
  });
});

describe("validateHandle", () => {
  it("accepts a clean handle", () => {
    expect(validateHandle("jan-faris")).toEqual({ ok: true, handle: "jan-faris" });
  });

  it("rejects too-short handles", () => {
    expect(validateHandle("a").ok).toBe(false);
    expect(validateHandle("").ok).toBe(false);
  });

  it("rejects reserved handles", () => {
    const result = validateHandle("admin");
    expect(result.ok).toBe(false);
  });

  it("normalizes mixed case and validates", () => {
    expect(validateHandle("JanFaris")).toEqual({ ok: true, handle: "janfaris" });
  });

  it("rejects handles that are only punctuation", () => {
    expect(validateHandle("!!!").ok).toBe(false);
  });
});

describe("deriveInitialHandle", () => {
  it("prefers a normalized github login", () => {
    expect(deriveInitialHandle("JanFaris", "jan@example.com", "uid-123")).toBe("janfaris");
  });

  it("falls back to the email local part", () => {
    expect(deriveInitialHandle(null, "cool.builder@example.com", "uid-123")).toBe("coolbuilder");
  });

  it("falls back to a builder-id handle when login and email are unusable", () => {
    const handle = deriveInitialHandle("", "", "ABCD1234efgh");
    expect(handle).toBe("builder-abcd1234");
  });

  it("never derives a reserved handle directly", () => {
    const handle = deriveInitialHandle("admin", null, "uid-9999");
    expect(RESERVED_HANDLES.has(handle)).toBe(false);
  });
});
