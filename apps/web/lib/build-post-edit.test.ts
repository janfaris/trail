import { describe, expect, it } from "vitest";
import {
  MANUAL_POST_EDIT_WINDOW_MS,
  buildPostEditDeadline,
  canEditManualPost,
  detectManualPostKind,
} from "./build-post-edit";

describe("canEditManualPost", () => {
  const published = new Date("2026-06-06T12:00:00.000Z");

  it("is false for never-published posts", () => {
    expect(canEditManualPost(null, published)).toBe(false);
  });

  it("is true at publish time", () => {
    expect(canEditManualPost(published, published)).toBe(true);
  });

  it("is true just inside the window", () => {
    const justInside = new Date(published.getTime() + MANUAL_POST_EDIT_WINDOW_MS - 1000);
    expect(canEditManualPost(published, justInside)).toBe(true);
  });

  it("is true exactly at the deadline", () => {
    const deadline = buildPostEditDeadline(published);
    expect(canEditManualPost(published, deadline)).toBe(true);
  });

  it("is false just past the window", () => {
    const justAfter = new Date(published.getTime() + MANUAL_POST_EDIT_WINDOW_MS + 1000);
    expect(canEditManualPost(published, justAfter)).toBe(false);
  });
});

describe("detectManualPostKind", () => {
  it("treats X-only proof as a quote", () => {
    expect(detectManualPostKind(["x"])).toBe("quote");
    expect(detectManualPostKind(["twitter"])).toBe("quote");
  });

  it("treats X + demo/github as a build", () => {
    expect(detectManualPostKind(["x", "demo"])).toBe("build");
    expect(detectManualPostKind(["x", "github"])).toBe("build");
  });

  it("treats github-only and demo-only as a build", () => {
    expect(detectManualPostKind(["github"])).toBe("build");
    expect(detectManualPostKind(["demo"])).toBe("build");
  });

  it("treats website-only and no proof as a build", () => {
    expect(detectManualPostKind(["website"])).toBe("build");
    expect(detectManualPostKind([])).toBe("build");
  });

  it("is case-insensitive", () => {
    expect(detectManualPostKind(["X"])).toBe("quote");
    expect(detectManualPostKind(["GitHub"])).toBe("build");
  });
});
