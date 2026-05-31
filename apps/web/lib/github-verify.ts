import { Octokit } from "@octokit/rest";

let warnedMissingToken = false;

/** GitHub identity of the session owner, used to bind commit authorship. */
export interface CommitOwnerIdentity {
  /** Numeric GitHub user id (rename-safe). From `account.account_id`. */
  githubId?: number | null;
  /** GitHub login. From `user.handle`. Matched case-insensitively. */
  login?: string | null;
}

export type ShippedReason =
  | "merged-and-owned"
  | "not-on-default"
  | "private-repo"
  | "owner-unbound"
  | "no-owner-identity"
  | "no-token"
  | "bad-input"
  | "error";

/** Auditable evidence for why a commit did (or didn't) earn 'shipped'. */
export interface ShippedVerification {
  shipped: boolean;
  reason: ShippedReason;
  defaultBranch?: string;
  private?: boolean;
  matchedBy?: "commit-author" | "commit-committer";
}

interface GhUserLike {
  id?: number;
  login?: string | null;
}

function identityMatches(u: GhUserLike | null | undefined, owner: CommitOwnerIdentity): boolean {
  if (!u) return false;
  // The numeric id is rename-safe and authoritative: when both sides expose an
  // id, an id mismatch is final — a stale/spoofable login must NOT override it.
  if (owner.githubId != null && typeof u.id === "number") {
    return u.id === owner.githubId;
  }
  if (owner.login && u.login && u.login.toLowerCase() === owner.login.toLowerCase()) {
    return true;
  }
  return false;
}

/**
 * Verify that a commit SHA was actually SHIPPED by the session owner — i.e. it
 * is reachable from the default branch of a PUBLIC repo AND it is bound to the
 * owner's GitHub identity. This underpins the public Verified Builder badge, so
 * every check is auditable by a stranger and we fail closed on any doubt.
 *
 * Three gates, all required:
 *  1. Ancestry — fetch the repo's default_branch, then compareCommitsWithBasehead
 *     with basehead = `${sha}...${default_branch}`. status='identical' (same
 *     commit) or 'ahead' (default branch is ahead of sha) both mean sha is an
 *     ancestor of default branch, i.e. merged. 'behind'/'diverged' = not merged.
 *  2. Public — a private repo can't be audited by a viewer, so it can never
 *     light the public badge.
 *  3. Authorship — the merged commit must be bound to the session owner's
 *     GitHub identity. The resolved AUTHOR is primary; the committer is only
 *     honoured when the author is unresolved (git author email not linked to a
 *     GitHub account). Repo ownership is deliberately NOT accepted: a fork — or
 *     a manual mirror-push to a fresh non-fork repo — places all of upstream's
 *     history on an attacker-controlled default branch, so owning the repo
 *     proves nothing about who wrote the commit. Author-primary also blocks the
 *     rebase/cherry-pick forgery (rewrite someone else's commit, become
 *     committer-of-record). Without an owner identity, or with no match, we fail
 *     closed. This blocks linking a popular OSS commit the user didn't write.
 *
 * Token sourcing — pass the SESSION OWNER's GitHub OAuth token so the read runs
 * with their permissions; falls back to GITHUB_TOKEN env. Returns a structured
 * result (never throws) so callers can persist the evidence and reason.
 */
export async function verifyShipped(
  repo: string,
  sha: string,
  opts?: { userToken?: string | null; owner?: CommitOwnerIdentity | null },
): Promise<ShippedVerification> {
  const token = opts?.userToken ?? process.env.GITHUB_TOKEN;
  if (!token) {
    if (!warnedMissingToken) {
      console.warn(
        "[github-verify] no GitHub token (user OAuth or GITHUB_TOKEN); verifyShipped() returns false",
      );
      warnedMissingToken = true;
    }
    return { shipped: false, reason: "no-token" };
  }
  const [owner, name] = repo.split("/");
  if (!owner || !name || !sha) return { shipped: false, reason: "bad-input" };

  // Without the owner's identity we can't bind authorship — fail closed before
  // spending any API calls.
  const identity = opts?.owner;
  if (!identity || (identity.githubId == null && !identity.login)) {
    return { shipped: false, reason: "no-owner-identity" };
  }

  try {
    const gh = new Octokit({ auth: token });
    const { data: repoData } = await gh.repos.get({ owner, repo: name });

    if (repoData.private) {
      return { shipped: false, reason: "private-repo", private: true };
    }
    const defaultBranch = repoData.default_branch;

    const { data: cmp } = await gh.repos.compareCommitsWithBasehead({
      owner,
      repo: name,
      basehead: `${sha}...${defaultBranch}`,
    });
    const merged = cmp.status === "identical" || cmp.status === "ahead";
    if (!merged) {
      return { shipped: false, reason: "not-on-default", defaultBranch, private: false };
    }

    const base = cmp.base_commit;
    // Bind to who WROTE the commit, never to who owns the repo: a fork or
    // mirror-push puts upstream history on the attacker's default branch, so
    // repo ownership is forgeable. The GitHub-resolved AUTHOR is primary; the
    // committer is only honoured when the author is unresolved (e.g. the git
    // author email isn't linked to any GitHub account). This blocks the
    // rebase/cherry-pick forgery where an attacker rewrites someone else's
    // commit onto their own branch and becomes committer-of-record.
    let matchedBy: ShippedVerification["matchedBy"] | undefined;
    if (base?.author) {
      if (identityMatches(base.author, identity)) matchedBy = "commit-author";
    } else if (identityMatches(base?.committer, identity)) {
      matchedBy = "commit-committer";
    }

    if (!matchedBy) {
      return { shipped: false, reason: "owner-unbound", defaultBranch, private: false };
    }
    return { shipped: true, reason: "merged-and-owned", defaultBranch, private: false, matchedBy };
  } catch (err) {
    console.warn("[github-verify] verifyShipped failed:", (err as Error).message);
    return { shipped: false, reason: "error" };
  }
}

/**
 * Find the merged pull request that introduced a commit SHA. Uses GitHub's
 * `commits/:sha/pulls` endpoint (requires the groot media type historically,
 * now stable). Returns the HTML URL of the first MERGED PR found, or null
 * when the SHA isn't associated with any PR or the token is missing.
 *
 * Surfaces:
 *   - direct commits to default branch (no PR) → null
 *   - PR squash-merged (commit SHA is the squash commit on default) → PR URL
 *   - PR merged with merge commit (commit SHA is one of the constituent
 *     commits) → PR URL
 *
 * Token sourcing — pass the SESSION OWNER's GitHub OAuth token (from
 * better-auth `account.access_token` where `provider_id = 'github'`) so the
 * lookup runs with their permissions. Falls back to GITHUB_TOKEN env when
 * no user token is supplied (mostly useful for tests / public-repo lookups
 * in environments without OAuth). This is the multi-tenant path: a single
 * shared bot token never sees other users' private repos, but each user's
 * own OAuth token does.
 *
 * Returns null on any error so the upload route never fails on missing PR.
 */
export async function resolvePullRequest(
  repo: string,
  sha: string,
  userToken?: string | null,
): Promise<string | null> {
  const token = userToken ?? process.env.GITHUB_TOKEN;
  if (!token) return null;
  const [owner, name] = repo.split("/");
  if (!owner || !name || !sha) return null;
  try {
    const gh = new Octokit({ auth: token });
    const { data } = await gh.repos.listPullRequestsAssociatedWithCommit({
      owner,
      repo: name,
      commit_sha: sha,
    });
    const merged = data.find((pr) => pr.merged_at != null);
    return merged?.html_url ?? null;
  } catch (err) {
    console.warn(
      "[github-verify] resolvePullRequest failed:",
      (err as Error).message,
    );
    return null;
  }
}
