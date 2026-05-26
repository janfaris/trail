import { Octokit } from "@octokit/rest";

let warnedMissingToken = false;

/**
 * Verify that a commit SHA is reachable from the default branch of a repo —
 * i.e. it's been merged / shipped.
 *
 * Strategy: fetch the repo to learn its default_branch, then call
 * compareCommitsWithBasehead with basehead = `${sha}...${default_branch}`.
 * GitHub returns status='identical' when the two refs point at the same
 * commit, or status='ahead' when the head (default branch) is ahead of the
 * base (sha) — both mean sha is an ancestor of default branch, i.e. merged.
 * 'behind' or 'diverged' means it isn't on the default branch.
 *
 * Returns false on any error (missing token, network, 404, etc).
 */
export async function verifyShipped(repo: string, sha: string): Promise<boolean> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    if (!warnedMissingToken) {
      console.warn("[github-verify] GITHUB_TOKEN not set; verifyShipped() will always return false");
      warnedMissingToken = true;
    }
    return false;
  }
  const [owner, name] = repo.split("/");
  if (!owner || !name || !sha) return false;

  try {
    const gh = new Octokit({ auth: token });
    const { data: repoData } = await gh.repos.get({ owner, repo: name });
    const defaultBranch = repoData.default_branch;
    const { data: cmp } = await gh.repos.compareCommitsWithBasehead({
      owner,
      repo: name,
      basehead: `${sha}...${defaultBranch}`,
    });
    return cmp.status === "identical" || cmp.status === "ahead";
  } catch (err) {
    console.warn("[github-verify] verifyShipped failed:", (err as Error).message);
    return false;
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
