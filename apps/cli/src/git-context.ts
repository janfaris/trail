import { spawnSync } from "node:child_process";

// Detect the GitHub repo + HEAD commit from the cwd. Best-effort — returns
// nulls when not inside a repo, when remote isn't github, or when commands
// fail. Never throws.

export interface GitContext {
  /** owner/repo (e.g. "janfaris/trail") */
  repo: string | null;
  /** Full HEAD commit SHA */
  commitSha: string | null;
  /** Full URL to the repo on GitHub (https) */
  repoUrl: string | null;
}

function git(args: string[]): string | null {
  try {
    const r = spawnSync("git", args, { encoding: "utf8" });
    if (r.status !== 0) return null;
    return r.stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Parse a git remote URL into owner/repo. Handles:
 *   git@github.com:owner/repo.git
 *   https://github.com/owner/repo.git
 *   https://github.com/owner/repo
 *   ssh://git@github.com/owner/repo.git
 */
export function parseGithubRemote(remote: string): { repo: string; url: string } | null {
  // SSH form: git@github.com:owner/repo(.git)
  let m = remote.match(/git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (m) return { repo: `${m[1]}/${m[2]}`, url: `https://github.com/${m[1]}/${m[2]}` };
  // HTTPS / SSH URL form
  m = remote.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?(?:\/)?$/);
  if (m) return { repo: `${m[1]}/${m[2]}`, url: `https://github.com/${m[1]}/${m[2]}` };
  return null;
}

export function detectGitContext(): GitContext {
  const remote = git(["config", "--get", "remote.origin.url"]);
  const sha = git(["rev-parse", "HEAD"]);
  if (!remote) return { repo: null, commitSha: sha, repoUrl: null };
  const parsed = parseGithubRemote(remote);
  if (!parsed) return { repo: null, commitSha: sha, repoUrl: null };
  return { repo: parsed.repo, commitSha: sha, repoUrl: parsed.url };
}
