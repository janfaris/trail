import { spawnSync } from "node:child_process";
import path from "node:path";
import { statSync } from "node:fs";

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
  /** The cwd that produced the result (caller's cwd or its enclosing dir). */
  cwd: string;
}

function git(args: string[], cwd?: string): string | null {
  try {
    const r = spawnSync("git", args, { encoding: "utf8", cwd });
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

/**
 * Resolve a file path to its containing directory if it's a file, else
 * use the path as-is. Used so we can pass an arbitrary `source_path`
 * from a session row (which might be a file, a dir, or empty) and still
 * end up running git commands inside the right repo.
 */
function dirOf(p: string): string {
  try {
    const s = statSync(p);
    return s.isDirectory() ? p : path.dirname(p);
  } catch {
    return path.dirname(p) || process.cwd();
  }
}

export function detectGitContext(cwdOpt?: string): GitContext {
  const cwd = cwdOpt ? dirOf(cwdOpt) : process.cwd();
  const remote = git(["config", "--get", "remote.origin.url"], cwd);
  const sha = git(["rev-parse", "HEAD"], cwd);
  if (!remote) return { repo: null, commitSha: sha, repoUrl: null, cwd };
  const parsed = parseGithubRemote(remote);
  if (!parsed) return { repo: null, commitSha: sha, repoUrl: null, cwd };
  return { repo: parsed.repo, commitSha: sha, repoUrl: parsed.url, cwd };
}

/**
 * Convenience: detect git context starting from a session's source file.
 * Equivalent to `detectGitContext(sourcePath)` but reads cleanly at call
 * sites. Returns null cwd if path is empty / unusable.
 */
export function detectGitContextForCwd(p: string | null | undefined): GitContext {
  return detectGitContext(p ?? undefined);
}
