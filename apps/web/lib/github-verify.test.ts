import { beforeEach, describe, expect, it, vi } from "vitest";

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

// Default owner identity used across the happy-path cases.
const OWNER = { githubId: 42, login: "octocat" };

/** A public repo owned by `owner` whose default branch is `main`. */
function publicRepo(ownerLike: { id?: number; login?: string } = { id: 42, login: "octocat" }) {
  return { data: { default_branch: "main", private: false, owner: ownerLike } };
}

/** A compare response with `status` and a base_commit author/committer. */
function compare(
  status: string,
  base: {
    author?: { id?: number; login?: string };
    committer?: { id?: number; login?: string };
  } = {},
) {
  return { data: { status, base_commit: base } };
}

describe("verifyShipped", () => {
  beforeEach(() => {
    reposGet.mockReset();
    compareCommitsWithBasehead.mockReset();
    process.env.GITHUB_TOKEN = "test-token";
  });

  it("does NOT ship on repo ownership alone — fork/mirror forgery is rejected", async () => {
    // Attacker forks (or mirror-pushes) a public repo they now "own"; the famous
    // commit is an ancestor of their default branch, but they did not write it.
    // Repo ownership must count for nothing — only author/committer binds.
    reposGet.mockResolvedValue(publicRepo({ id: 42, login: "octocat" }));
    compareCommitsWithBasehead.mockResolvedValue(
      compare("ahead", {
        author: { id: 1000, login: "rauchg" },
        committer: { id: 2000, login: "web-flow" },
      }),
    );
    const r = await verifyShipped("octocat/forked-repo", "abc123", { owner: OWNER });
    expect(r.shipped).toBe(false);
    expect(r.reason).toBe("owner-unbound");
  });

  it("ships when merged (identical) and the commit author matches the owner", async () => {
    reposGet.mockResolvedValue(publicRepo({ id: 42, login: "octocat" }));
    compareCommitsWithBasehead.mockResolvedValue(
      compare("identical", { author: { id: 42, login: "octocat" } }),
    );
    const r = await verifyShipped("octocat/repo", "abc123", { owner: OWNER });
    expect(r.shipped).toBe(true);
    expect(r.reason).toBe("merged-and-owned");
    expect(r.matchedBy).toBe("commit-author");
  });

  it("ships when merged (ahead) and the commit author matches the owner", async () => {
    reposGet.mockResolvedValue(publicRepo({ id: 999, login: "someorg" }));
    compareCommitsWithBasehead.mockResolvedValue(
      compare("ahead", { author: { id: 42, login: "octocat" } }),
    );
    const r = await verifyShipped("someorg/repo", "abc123", { owner: OWNER });
    expect(r.shipped).toBe(true);
    expect(r.matchedBy).toBe("commit-author");
  });

  it("ships when the commit committer matches by case-insensitive login", async () => {
    reposGet.mockResolvedValue(publicRepo({ id: 999, login: "someorg" }));
    compareCommitsWithBasehead.mockResolvedValue(
      compare("ahead", { committer: { id: 7, login: "OctoCat" } }),
    );
    const r = await verifyShipped("someorg/repo", "abc123", { owner: { login: "octocat" } });
    expect(r.shipped).toBe(true);
    expect(r.matchedBy).toBe("commit-committer");
  });

  it("treats numeric id as authoritative: a login match cannot override an id mismatch", async () => {
    reposGet.mockResolvedValue(publicRepo({ id: 999, login: "someorg" }));
    // Same login as the owner, but the GitHub-resolved id (5) ≠ owner id (42):
    // a renamed/impersonated login must not pass when ids are known.
    compareCommitsWithBasehead.mockResolvedValue(
      compare("ahead", { author: { id: 5, login: "octocat" } }),
    );
    const r = await verifyShipped("someorg/repo", "abc123", { owner: OWNER });
    expect(r.shipped).toBe(false);
    expect(r.reason).toBe("owner-unbound");
  });

  it("does not ship when author is someone else, even if committer matches (rebase/cherry-pick forgery)", async () => {
    // Attacker cherry-picks/rebases rauchg's commit onto their own branch using
    // their GitHub-linked identity → they become committer-of-record. The author
    // is still rauchg, so the author-primary rule rejects it.
    reposGet.mockResolvedValue(publicRepo({ id: 999, login: "someorg" }));
    compareCommitsWithBasehead.mockResolvedValue(
      compare("ahead", {
        author: { id: 1000, login: "rauchg" },
        committer: { id: 42, login: "octocat" },
      }),
    );
    const r = await verifyShipped("someorg/repo", "abc123", { owner: OWNER });
    expect(r.shipped).toBe(false);
    expect(r.reason).toBe("owner-unbound");
  });

  it("does not ship when sha is not on the default branch (diverged)", async () => {
    reposGet.mockResolvedValue(publicRepo());
    compareCommitsWithBasehead.mockResolvedValue(compare("diverged"));
    const r = await verifyShipped("octocat/repo", "abc123", { owner: OWNER });
    expect(r.shipped).toBe(false);
    expect(r.reason).toBe("not-on-default");
  });

  it("does not ship when sha is behind (not merged in)", async () => {
    reposGet.mockResolvedValue(publicRepo());
    compareCommitsWithBasehead.mockResolvedValue(compare("behind"));
    const r = await verifyShipped("octocat/repo", "abc123", { owner: OWNER });
    expect(r.shipped).toBe(false);
    expect(r.reason).toBe("not-on-default");
  });

  it("does not ship for a private repo (unauditable)", async () => {
    reposGet.mockResolvedValue({
      data: { default_branch: "main", private: true, owner: { id: 42, login: "octocat" } },
    });
    const r = await verifyShipped("octocat/repo", "abc123", { owner: OWNER });
    expect(r.shipped).toBe(false);
    expect(r.reason).toBe("private-repo");
    expect(compareCommitsWithBasehead).not.toHaveBeenCalled();
  });

  it("does not ship when merged but owned by nobody we recognize", async () => {
    reposGet.mockResolvedValue(publicRepo({ id: 999, login: "vercel" }));
    compareCommitsWithBasehead.mockResolvedValue(
      compare("ahead", {
        author: { id: 1000, login: "rauchg" },
        committer: { id: 2000, login: "web-flow" },
      }),
    );
    const r = await verifyShipped("vercel/next.js", "abc123", { owner: OWNER });
    expect(r.shipped).toBe(false);
    expect(r.reason).toBe("owner-unbound");
  });

  it("fails closed with no owner identity (no API calls)", async () => {
    const r = await verifyShipped("octocat/repo", "abc123", {
      owner: { githubId: null, login: null },
    });
    expect(r.shipped).toBe(false);
    expect(r.reason).toBe("no-owner-identity");
    expect(reposGet).not.toHaveBeenCalled();
  });

  it("fails closed when no token is available (no API calls)", async () => {
    process.env.GITHUB_TOKEN = "";
    const r = await verifyShipped("octocat/repo", "abc123", { owner: OWNER });
    expect(r.shipped).toBe(false);
    expect(r.reason).toBe("no-token");
    expect(reposGet).not.toHaveBeenCalled();
  });

  it("prefers the passed user token over the env token", async () => {
    process.env.GITHUB_TOKEN = "";
    reposGet.mockResolvedValue(publicRepo());
    compareCommitsWithBasehead.mockResolvedValue(
      compare("identical", { author: { id: 42, login: "octocat" } }),
    );
    const r = await verifyShipped("octocat/repo", "abc123", {
      userToken: "user-tok",
      owner: OWNER,
    });
    expect(r.shipped).toBe(true);
  });

  it("returns error on network/API failure", async () => {
    reposGet.mockRejectedValue(new Error("network down"));
    const r = await verifyShipped("octocat/repo", "abc123", { owner: OWNER });
    expect(r.shipped).toBe(false);
    expect(r.reason).toBe("error");
  });

  it("returns bad-input on a malformed repo", async () => {
    const r = await verifyShipped("bogus", "abc123", { owner: OWNER });
    expect(r.shipped).toBe(false);
    expect(r.reason).toBe("bad-input");
  });
});
