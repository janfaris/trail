export type ParsedGithubBuildUrl =
  | {
      kind: "repo";
      owner: string;
      repo: string;
      repoFullName: string;
      normalizedUrl: string;
    }
  | {
      kind: "pull";
      owner: string;
      repo: string;
      repoFullName: string;
      normalizedUrl: string;
      pullNumber: number;
    }
  | {
      kind: "commit";
      owner: string;
      repo: string;
      repoFullName: string;
      normalizedUrl: string;
      commitSha: string;
    }
  | {
      kind: "release";
      owner: string;
      repo: string;
      repoFullName: string;
      normalizedUrl: string;
      releaseTag: string;
    }
  | {
      kind: "issue";
      owner: string;
      repo: string;
      repoFullName: string;
      normalizedUrl: string;
      issueNumber: number;
    }
  | {
      kind: "discussion";
      owner: string;
      repo: string;
      repoFullName: string;
      normalizedUrl: string;
      discussionNumber: number;
    };

const GITHUB_NAME_RE = /^[A-Za-z0-9._-]+$/;
const GITHUB_SHA_RE = /^[A-Fa-f0-9]{7,64}$/;

function decodePathPart(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function normalizeGithubWebUrl(owner: string, repo: string, suffix = ""): string {
  return `https://github.com/${owner}/${repo}${suffix}`;
}

export function parseGithubBuildUrl(value: string | null | undefined): ParsedGithubBuildUrl | null {
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;

  const segments = url.pathname.split("/").filter(Boolean);
  const owner = decodePathPart(segments[0]);
  const repo = decodePathPart(segments[1]);
  if (!owner || !repo || !GITHUB_NAME_RE.test(owner) || !GITHUB_NAME_RE.test(repo)) {
    return null;
  }

  const repoFullName = `${owner}/${repo}`;
  const section = segments[2];

  if (!section) {
    return {
      kind: "repo",
      owner,
      repo,
      repoFullName,
      normalizedUrl: normalizeGithubWebUrl(owner, repo),
    };
  }

  if (section === "pull") {
    const pullNumber = Number(segments[3]);
    if (!Number.isInteger(pullNumber) || pullNumber <= 0) return null;
    return {
      kind: "pull",
      owner,
      repo,
      repoFullName,
      pullNumber,
      normalizedUrl: normalizeGithubWebUrl(owner, repo, `/pull/${pullNumber}`),
    };
  }

  if (section === "issues") {
    const issueNumber = Number(segments[3]);
    if (!Number.isInteger(issueNumber) || issueNumber <= 0) return null;
    return {
      kind: "issue",
      owner,
      repo,
      repoFullName,
      issueNumber,
      normalizedUrl: normalizeGithubWebUrl(owner, repo, `/issues/${issueNumber}`),
    };
  }

  if (section === "discussions") {
    const discussionNumber = Number(segments[3]);
    if (!Number.isInteger(discussionNumber) || discussionNumber <= 0) return null;
    return {
      kind: "discussion",
      owner,
      repo,
      repoFullName,
      discussionNumber,
      normalizedUrl: normalizeGithubWebUrl(owner, repo, `/discussions/${discussionNumber}`),
    };
  }

  if (section === "commit") {
    const commitSha = decodePathPart(segments[3]);
    if (!commitSha || !GITHUB_SHA_RE.test(commitSha)) return null;
    return {
      kind: "commit",
      owner,
      repo,
      repoFullName,
      commitSha,
      normalizedUrl: normalizeGithubWebUrl(owner, repo, `/commit/${commitSha}`),
    };
  }

  if (section === "releases" && segments[3] === "tag") {
    const releaseTag = decodePathPart(segments.slice(4).join("/"));
    if (!releaseTag) return null;
    return {
      kind: "release",
      owner,
      repo,
      repoFullName,
      releaseTag,
      normalizedUrl: normalizeGithubWebUrl(
        owner,
        repo,
        `/releases/tag/${encodeURIComponent(releaseTag)}`,
      ),
    };
  }

  return null;
}

export function extractGithubLinkage(value: string | null): {
  linkedRepo: string | null;
  linkedPrUrl: string | null;
  linkedCommitSha: string | null;
} {
  const parsed = parseGithubBuildUrl(value);
  if (!parsed) {
    return { linkedRepo: null, linkedPrUrl: null, linkedCommitSha: null };
  }

  return {
    linkedRepo: parsed.repoFullName,
    linkedPrUrl: parsed.kind === "pull" ? parsed.normalizedUrl : null,
    linkedCommitSha: parsed.kind === "commit" ? parsed.commitSha : null,
  };
}
