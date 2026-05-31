import { describe, expect, it } from "vitest";
import { parseGithubRemote } from "../src/git-context.js";

// parseGithubRemote underpins badge eligibility: the server regex-gates
// x-trail-linked-repo to ^[\w.-]+/[\w.-]+$, so the CLI must normalize every
// real GitHub remote form to owner/repo — and must NOT match deceptive
// look-alike hosts that could spoof provenance.
describe("parseGithubRemote — normalization", () => {
  const expected = { repo: "owner/repo", url: "https://github.com/owner/repo" };

  it("parses SSH scp form with .git", () => {
    expect(parseGithubRemote("git@github.com:owner/repo.git")).toEqual(expected);
  });

  it("parses SSH scp form without .git", () => {
    expect(parseGithubRemote("git@github.com:owner/repo")).toEqual(expected);
  });

  it("parses HTTPS form with .git", () => {
    expect(parseGithubRemote("https://github.com/owner/repo.git")).toEqual(expected);
  });

  it("parses HTTPS form without .git", () => {
    expect(parseGithubRemote("https://github.com/owner/repo")).toEqual(expected);
  });

  it("parses HTTPS form with trailing slash", () => {
    expect(parseGithubRemote("https://github.com/owner/repo/")).toEqual(expected);
  });

  it("parses ssh:// URL form", () => {
    expect(parseGithubRemote("ssh://git@github.com/owner/repo.git")).toEqual(expected);
  });

  it("parses HTTPS form with userinfo", () => {
    expect(parseGithubRemote("https://user@github.com/owner/repo.git")).toEqual(expected);
  });
});

describe("parseGithubRemote — deceptive hosts return null", () => {
  it("rejects notgithub.com (prefix look-alike)", () => {
    expect(parseGithubRemote("https://notgithub.com/owner/repo")).toBeNull();
  });

  it("rejects github.com.evil.com (suffix look-alike)", () => {
    expect(parseGithubRemote("https://github.com.evil.com/owner/repo")).toBeNull();
  });

  it("rejects a non-github host", () => {
    expect(parseGithubRemote("https://gitlab.com/owner/repo")).toBeNull();
  });

  it("rejects an SSH scp look-alike host", () => {
    expect(parseGithubRemote("git@notgithub.com:owner/repo.git")).toBeNull();
  });

  it("rejects garbage input", () => {
    expect(parseGithubRemote("not a remote")).toBeNull();
  });
});
