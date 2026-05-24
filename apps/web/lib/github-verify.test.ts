import { describe, it, expect, vi, beforeEach } from "vitest";

const reposGet = vi.fn();
const compareCommitsWithBasehead = vi.fn();

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    repos: {
      get: reposGet,
      compareCommitsWithBasehead,
    },
  })),
}));

import { verifyShipped } from "./github-verify";

describe("verifyShipped", () => {
  beforeEach(() => {
    reposGet.mockReset();
    compareCommitsWithBasehead.mockReset();
    process.env.GITHUB_TOKEN = "test-token";
  });

  it("returns true when sha is identical to default branch HEAD", async () => {
    reposGet.mockResolvedValue({ data: { default_branch: "main" } });
    compareCommitsWithBasehead.mockResolvedValue({ data: { status: "identical" } });
    expect(await verifyShipped("owner/repo", "abc123")).toBe(true);
  });

  it("returns true when default branch is ahead of sha (merged)", async () => {
    reposGet.mockResolvedValue({ data: { default_branch: "main" } });
    compareCommitsWithBasehead.mockResolvedValue({ data: { status: "ahead" } });
    expect(await verifyShipped("owner/repo", "abc123")).toBe(true);
  });

  it("returns false when sha is not on default branch (diverged)", async () => {
    reposGet.mockResolvedValue({ data: { default_branch: "main" } });
    compareCommitsWithBasehead.mockResolvedValue({ data: { status: "diverged" } });
    expect(await verifyShipped("owner/repo", "abc123")).toBe(false);
  });

  it("returns false when sha is behind (not merged in)", async () => {
    reposGet.mockResolvedValue({ data: { default_branch: "main" } });
    compareCommitsWithBasehead.mockResolvedValue({ data: { status: "behind" } });
    expect(await verifyShipped("owner/repo", "abc123")).toBe(false);
  });

  it("returns false when GITHUB_TOKEN is missing", async () => {
    delete process.env.GITHUB_TOKEN;
    expect(await verifyShipped("owner/repo", "abc123")).toBe(false);
    expect(reposGet).not.toHaveBeenCalled();
  });

  it("returns false on network/API error", async () => {
    reposGet.mockRejectedValue(new Error("network down"));
    expect(await verifyShipped("owner/repo", "abc123")).toBe(false);
  });

  it("returns false on malformed repo", async () => {
    expect(await verifyShipped("bogus", "abc123")).toBe(false);
  });
});
