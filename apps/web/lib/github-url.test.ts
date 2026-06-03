import { describe, expect, it } from "vitest";
import { extractGithubLinkage, parseGithubBuildUrl } from "./github-url";

describe("parseGithubBuildUrl", () => {
  it("parses public repository URLs", () => {
    expect(parseGithubBuildUrl("https://github.com/janfaris/trail")).toEqual({
      kind: "repo",
      owner: "janfaris",
      repo: "trail",
      repoFullName: "janfaris/trail",
      normalizedUrl: "https://github.com/janfaris/trail",
    });
  });

  it("parses pull request URLs using web singular and normalized web URL", () => {
    expect(parseGithubBuildUrl("https://github.com/janfaris/trail/pull/57")).toEqual({
      kind: "pull",
      owner: "janfaris",
      repo: "trail",
      repoFullName: "janfaris/trail",
      pullNumber: 57,
      normalizedUrl: "https://github.com/janfaris/trail/pull/57",
    });
  });

  it("parses release tags after /releases/tag instead of the literal tag segment", () => {
    expect(parseGithubBuildUrl("https://github.com/owner/repo/releases/tag/v1.2.3")).toEqual({
      kind: "release",
      owner: "owner",
      repo: "repo",
      repoFullName: "owner/repo",
      releaseTag: "v1.2.3",
      normalizedUrl: "https://github.com/owner/repo/releases/tag/v1.2.3",
    });
  });

  it("parses release tags that include path separators", () => {
    expect(parseGithubBuildUrl("https://github.com/owner/repo/releases/tag/mobile/v1")).toEqual({
      kind: "release",
      owner: "owner",
      repo: "repo",
      repoFullName: "owner/repo",
      releaseTag: "mobile/v1",
      normalizedUrl: "https://github.com/owner/repo/releases/tag/mobile%2Fv1",
    });
  });

  it("parses issue and discussion URLs", () => {
    expect(parseGithubBuildUrl("https://github.com/owner/repo/issues/123")).toEqual({
      kind: "issue",
      owner: "owner",
      repo: "repo",
      repoFullName: "owner/repo",
      issueNumber: 123,
      normalizedUrl: "https://github.com/owner/repo/issues/123",
    });

    expect(parseGithubBuildUrl("https://github.com/owner/repo/discussions/7")).toEqual({
      kind: "discussion",
      owner: "owner",
      repo: "repo",
      repoFullName: "owner/repo",
      discussionNumber: 7,
      normalizedUrl: "https://github.com/owner/repo/discussions/7",
    });
  });

  it("parses commit URLs and exposes linkage data", () => {
    const sha = "abcdef1234567890";
    expect(parseGithubBuildUrl(`https://github.com/owner/repo/commit/${sha}`)).toEqual({
      kind: "commit",
      owner: "owner",
      repo: "repo",
      repoFullName: "owner/repo",
      commitSha: sha,
      normalizedUrl: `https://github.com/owner/repo/commit/${sha}`,
    });

    expect(extractGithubLinkage(`https://github.com/owner/repo/commit/${sha}`)).toEqual({
      linkedRepo: "owner/repo",
      linkedPrUrl: null,
      linkedCommitSha: sha,
    });
  });

  it("rejects unsupported GitHub paths and non-GitHub URLs", () => {
    expect(parseGithubBuildUrl("https://github.com/owner/repo/wiki/page")).toBeNull();
    expect(parseGithubBuildUrl("https://example.com/owner/repo")).toBeNull();
  });
});
