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
