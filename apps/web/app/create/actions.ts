"use server";

import { type ParsedGithubBuildUrl, parseGithubBuildUrl } from "@/lib/github-url";
import { canonicalLabel } from "@/lib/tags";
import { headers } from "next/headers";

type GitHubBuildDraft = {
  title: string;
  summary: string;
  stack: string[];
  githubUrl: string;
};

type GitHubImportResult =
  | {
      ok: true;
      sourceLabel: string;
      draft: GitHubBuildDraft;
    }
  | {
      ok: false;
      error: string;
    };

type GitHubFetchResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };

type GitHubRepoPayload = {
  name?: unknown;
  full_name?: unknown;
  description?: unknown;
  language?: unknown;
  topics?: unknown;
  private?: unknown;
};

type GitHubPullPayload = {
  title?: unknown;
  body?: unknown;
  state?: unknown;
  merged_at?: unknown;
};

type GitHubReleasePayload = {
  name?: unknown;
  tag_name?: unknown;
  body?: unknown;
};

type GitHubIssuePayload = {
  title?: unknown;
  body?: unknown;
  state?: unknown;
};

type GitHubCommitPayload = {
  commit?: {
    message?: unknown;
  };
};

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_FETCH_TIMEOUT_MS = 5000;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function truncate(value: string, maxLength: number): string {
  return value.replace(/\s+\n/g, "\n").trim().slice(0, maxLength);
}

function firstParagraph(value: unknown): string | null {
  const body = text(value);
  if (!body) return null;
  return truncate(body.split(/\n{2,}/)[0] ?? body, 700);
}

function stackFromRepo(repo: GitHubRepoPayload): string[] {
  const values = [
    text(repo.language),
    ...(Array.isArray(repo.topics) ? repo.topics.map((topic) => text(topic)) : []),
  ].filter((value): value is string => Boolean(value));
  const seen = new Set<string>();
  return values
    .map((value) => canonicalLabel(value.toLowerCase().replace(/[^a-z0-9]+/g, "-")))
    .filter((value) => {
      const key = value.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function githubHeaders(): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "TrailBuildImporter",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function fetchGithubJson<T>(path: string): Promise<GitHubFetchResult<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_FETCH_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(`${GITHUB_API_BASE}${path}`, {
      headers: githubHeaders(),
      next: { revalidate: 300 },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "GitHub took too long to respond. Try again in a moment." };
    }
    return { ok: false, error: "Trail could not reach GitHub. Paste the details manually." };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
      return {
        ok: false,
        error:
          "GitHub import is rate limited right now. Try again later or paste details manually.",
      };
    }
    if (response.status === 404) {
      return {
        ok: false,
        error:
          "That GitHub repo, PR, release, issue, discussion, or commit was not found. Private links are not importable yet.",
      };
    }
    return { ok: false, error: "GitHub could not return metadata for that link." };
  }

  const data = (await response.json()) as T;
  return { ok: true, data };
}

async function verifyGithubWebUrl(url: string): Promise<GitHubFetchResult<null>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_FETCH_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": "TrailBuildImporter" },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "GitHub took too long to respond. Try again in a moment." };
    }
    return { ok: false, error: "Trail could not reach GitHub. Paste the details manually." };
  } finally {
    clearTimeout(timeout);
  }

  if (response.ok) return { ok: true, data: null };
  if (response.status === 404) {
    return {
      ok: false,
      error:
        "That GitHub repo, PR, release, issue, discussion, or commit was not found. Private links are not importable yet.",
    };
  }
  return { ok: false, error: "GitHub could not verify that discussion link." };
}

function repoPath(parsed: ParsedGithubBuildUrl): string {
  return `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
}

function buildRepoDraft(parsed: ParsedGithubBuildUrl, repo: GitHubRepoPayload): GitHubBuildDraft {
  const repoName = text(repo.name) ?? parsed.repo;
  const repoFullName = text(repo.full_name) ?? parsed.repoFullName;
  const description = text(repo.description);
  return {
    title: repoName,
    summary: truncate(
      [
        `Imported from GitHub repo ${repoFullName}.`,
        description ?? "Add what you built, who it helps, and what feedback you want.",
      ].join("\n\n"),
      1200,
    ),
    stack: stackFromRepo(repo),
    githubUrl: parsed.normalizedUrl,
  };
}

function buildPullDraft(
  parsed: Extract<ParsedGithubBuildUrl, { kind: "pull" }>,
  repo: GitHubRepoPayload,
  pull: GitHubPullPayload,
): GitHubBuildDraft {
  const repoFullName = text(repo.full_name) ?? parsed.repoFullName;
  const pullTitle = text(pull.title) ?? `PR #${parsed.pullNumber}`;
  const body = firstParagraph(pull.body);
  const state = text(pull.merged_at) ? "merged" : text(pull.state);

  return {
    title: truncate(pullTitle, 120),
    summary: truncate(
      [
        `Imported from GitHub PR #${parsed.pullNumber} in ${repoFullName}${
          state ? ` (${state})` : ""
        }.`,
        body ?? text(repo.description) ?? "Add what changed and what feedback you want.",
      ].join("\n\n"),
      1200,
    ),
    stack: stackFromRepo(repo),
    githubUrl: parsed.normalizedUrl,
  };
}

function buildReleaseDraft(
  parsed: Extract<ParsedGithubBuildUrl, { kind: "release" }>,
  repo: GitHubRepoPayload,
  release: GitHubReleasePayload,
): GitHubBuildDraft {
  const repoFullName = text(repo.full_name) ?? parsed.repoFullName;
  const releaseName = text(release.name) ?? text(release.tag_name) ?? parsed.releaseTag;

  return {
    title: truncate(`Release ${releaseName}`, 120),
    summary: truncate(
      [
        `Imported from GitHub release ${releaseName} in ${repoFullName}.`,
        firstParagraph(release.body) ??
          text(repo.description) ??
          "Add what shipped in this release.",
      ].join("\n\n"),
      1200,
    ),
    stack: stackFromRepo(repo),
    githubUrl: parsed.normalizedUrl,
  };
}

function buildIssueDraft(
  parsed: Extract<ParsedGithubBuildUrl, { kind: "issue" }>,
  repo: GitHubRepoPayload,
  issue: GitHubIssuePayload,
): GitHubBuildDraft {
  const repoFullName = text(repo.full_name) ?? parsed.repoFullName;
  const issueTitle = text(issue.title) ?? `Issue #${parsed.issueNumber}`;
  const state = text(issue.state);

  return {
    title: truncate(issueTitle, 120),
    summary: truncate(
      [
        `Imported from GitHub issue #${parsed.issueNumber} in ${repoFullName}${
          state ? ` (${state})` : ""
        }.`,
        firstParagraph(issue.body) ??
          text(repo.description) ??
          "Add what this issue is asking builders to solve.",
      ].join("\n\n"),
      1200,
    ),
    stack: stackFromRepo(repo),
    githubUrl: parsed.normalizedUrl,
  };
}

function buildDiscussionDraft(
  parsed: Extract<ParsedGithubBuildUrl, { kind: "discussion" }>,
  repo: GitHubRepoPayload,
): GitHubBuildDraft {
  const repoFullName = text(repo.full_name) ?? parsed.repoFullName;

  return {
    title: `Discussion #${parsed.discussionNumber} in ${repoFullName}`,
    summary: truncate(
      [
        `Imported from GitHub discussion #${parsed.discussionNumber} in ${repoFullName}.`,
        text(repo.description) ??
          "Add the question, decision, or build idea from this discussion before publishing.",
      ].join("\n\n"),
      1200,
    ),
    stack: stackFromRepo(repo),
    githubUrl: parsed.normalizedUrl,
  };
}

function buildCommitDraft(
  parsed: Extract<ParsedGithubBuildUrl, { kind: "commit" }>,
  repo: GitHubRepoPayload,
  commit: GitHubCommitPayload,
): GitHubBuildDraft {
  const repoFullName = text(repo.full_name) ?? parsed.repoFullName;
  const message = text(commit.commit?.message);
  const [subject, ...bodyLines] = message?.split(/\r?\n/) ?? [];
  const body = bodyLines.join("\n").trim();

  return {
    title: truncate(subject || `Commit ${parsed.commitSha.slice(0, 7)}`, 120),
    summary: truncate(
      [
        `Imported from GitHub commit ${parsed.commitSha.slice(0, 7)} in ${repoFullName}.`,
        body || text(repo.description) || "Add what this commit changed and why it matters.",
      ].join("\n\n"),
      1200,
    ),
    stack: stackFromRepo(repo),
    githubUrl: parsed.normalizedUrl,
  };
}

export async function importGithubBuildDraft(githubUrl: string): Promise<GitHubImportResult> {
  if (!process.env.BETTER_AUTH_SECRET) {
    return { ok: false, error: "Sign in before importing GitHub metadata." };
  }

  const { auth } = await import("@/lib/auth");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { ok: false, error: "Sign in before importing GitHub metadata." };
  }

  const parsed = parseGithubBuildUrl(githubUrl);
  if (!parsed) {
    return {
      ok: false,
      error: "Paste a public GitHub repo, PR, release, issue, discussion, or commit URL.",
    };
  }

  const repoResult = await fetchGithubJson<GitHubRepoPayload>(repoPath(parsed));
  if (!repoResult.ok) return repoResult;
  const repo = repoResult.data;
  if (repo.private === true) {
    return {
      ok: false,
      error:
        "That GitHub repo, PR, release, issue, discussion, or commit was not found. Private links are not importable yet.",
    };
  }

  if (parsed.kind === "pull") {
    const pullResult = await fetchGithubJson<GitHubPullPayload>(
      `${repoPath(parsed)}/pulls/${parsed.pullNumber}`,
    );
    if (!pullResult.ok) return pullResult;
    return {
      ok: true,
      sourceLabel: `GitHub PR #${parsed.pullNumber}`,
      draft: buildPullDraft(parsed, repo, pullResult.data),
    };
  }

  if (parsed.kind === "release") {
    const releaseResult = await fetchGithubJson<GitHubReleasePayload>(
      `${repoPath(parsed)}/releases/tags/${encodeURIComponent(parsed.releaseTag)}`,
    );
    if (!releaseResult.ok) return releaseResult;
    return {
      ok: true,
      sourceLabel: `GitHub release ${parsed.releaseTag}`,
      draft: buildReleaseDraft(parsed, repo, releaseResult.data),
    };
  }

  if (parsed.kind === "issue") {
    const issueResult = await fetchGithubJson<GitHubIssuePayload>(
      `${repoPath(parsed)}/issues/${parsed.issueNumber}`,
    );
    if (!issueResult.ok) return issueResult;
    return {
      ok: true,
      sourceLabel: `GitHub issue #${parsed.issueNumber}`,
      draft: buildIssueDraft(parsed, repo, issueResult.data),
    };
  }

  if (parsed.kind === "discussion") {
    const discussionResult = await verifyGithubWebUrl(parsed.normalizedUrl);
    if (!discussionResult.ok) return discussionResult;
    return {
      ok: true,
      sourceLabel: `GitHub discussion #${parsed.discussionNumber}`,
      draft: buildDiscussionDraft(parsed, repo),
    };
  }

  if (parsed.kind === "commit") {
    const commitResult = await fetchGithubJson<GitHubCommitPayload>(
      `${repoPath(parsed)}/commits/${encodeURIComponent(parsed.commitSha)}`,
    );
    if (!commitResult.ok) return commitResult;
    return {
      ok: true,
      sourceLabel: `GitHub commit ${parsed.commitSha.slice(0, 7)}`,
      draft: buildCommitDraft(parsed, repo, commitResult.data),
    };
  }

  return {
    ok: true,
    sourceLabel: `GitHub repo ${parsed.repoFullName}`,
    draft: buildRepoDraft(parsed, repo),
  };
}
