"use server";

import type { BuildPostInput } from "@/app/feed/actions";
import { aiClient, textModel } from "@/lib/ai-client";
import { normalizeBuildPostText, validateBuildPostQuality } from "@/lib/build-post-quality";
import { type ParsedGithubBuildUrl, parseGithubBuildUrl } from "@/lib/github-url";
import { canonicalLabel } from "@/lib/tags";
import { parseXPostUrl } from "@/lib/x-url";
import { headers } from "next/headers";

type GitHubBuildDraft = {
  title: string;
  summary: string;
  stack: string[];
  githubUrl: string;
};

type XBuildDraft = {
  title: string;
  summary: string;
  xUrl: string;
};

type BuildPostAssistDraft = Pick<BuildPostInput, "title" | "summary" | "proofNote" | "question">;

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

type XImportResult =
  | {
      ok: true;
      sourceLabel: string;
      draft: XBuildDraft;
    }
  | {
      ok: false;
      error: string;
    };

type BuildPostAssistResult =
  | {
      ok: true;
      draft: BuildPostAssistDraft;
      missing: string[];
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

type XOEmbedPayload = {
  author_name?: unknown;
  html?: unknown;
  url?: unknown;
};

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_FETCH_TIMEOUT_MS = 5000;
const X_OEMBED_URL = "https://publish.twitter.com/oembed";
const X_FETCH_TIMEOUT_MS = 5000;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function truncate(value: string, maxLength: number): string {
  return value.replace(/\s+\n/g, "\n").trim().slice(0, maxLength);
}

function truncateUnknown(value: unknown, maxLength: number): string {
  return typeof value === "string" ? truncate(value, maxLength) : "";
}

function assistProofUrlCount(input: BuildPostInput): number {
  return [input.githubUrl, input.xUrl, input.demoUrl].filter((value) => value.trim()).length;
}

function parseAssistDraft(value: unknown): BuildPostAssistDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    title: truncateUnknown(record.title, 120),
    summary: truncateUnknown(record.summary, 1200),
    proofNote: truncateUnknown(record.proofNote, 500),
    question: truncateUnknown(record.question, 260),
  };
}

function firstParagraph(value: unknown): string | null {
  const body = text(value);
  if (!body) return null;
  return truncate(body.split(/\n{2,}/)[0] ?? body, 700);
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function textFromHtml(value: unknown): string | null {
  const html = text(value);
  if (!html) return null;
  const stripped = decodeHtmlText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
  return stripped ? truncate(stripped, 700) : null;
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

async function fetchXOEmbed(url: string): Promise<GitHubFetchResult<XOEmbedPayload>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), X_FETCH_TIMEOUT_MS);
  let response: Response;

  try {
    const oembedUrl = new URL(X_OEMBED_URL);
    oembedUrl.searchParams.set("url", url);
    oembedUrl.searchParams.set("omit_script", "1");
    oembedUrl.searchParams.set("dnt", "1");

    response = await fetch(oembedUrl, {
      headers: { Accept: "application/json", "User-Agent": "TrailBuildImporter" },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "X took too long to respond. Try again in a moment." };
    }
    return { ok: false, error: "Trail could not reach X. Paste the details manually." };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    if (response.status === 404) {
      return {
        ok: false,
        error: "That public X post was not found. Private or deleted posts are not importable.",
      };
    }
    return { ok: false, error: "X could not return metadata for that post." };
  }

  const data = (await response.json()) as XOEmbedPayload;
  return { ok: true, data };
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

export async function importXBuildDraft(xUrl: string): Promise<XImportResult> {
  if (!process.env.BETTER_AUTH_SECRET) {
    return { ok: false, error: "Sign in before importing X metadata." };
  }

  const { auth } = await import("@/lib/auth");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { ok: false, error: "Sign in before importing X metadata." };
  }

  const parsed = parseXPostUrl(xUrl);
  if (!parsed) {
    return { ok: false, error: "Paste a public X or Twitter status URL." };
  }

  const result = await fetchXOEmbed(parsed.normalizedUrl);
  if (!result.ok) return result;

  const canonicalPost = parseXPostUrl(text(result.data.url));
  if (!canonicalPost || canonicalPost.statusId !== parsed.statusId) {
    return { ok: false, error: "X could not verify the canonical post URL." };
  }

  const authorName = text(result.data.author_name);
  const postText = textFromHtml(result.data.html);
  const authorLabel = authorName
    ? `${authorName} (@${canonicalPost.handle})`
    : `@${canonicalPost.handle}`;

  return {
    ok: true,
    sourceLabel: `X post by @${canonicalPost.handle}`,
    draft: {
      title: truncate(`Discussing @${canonicalPost.handle}'s X post`, 120),
      summary: truncate(
        [
          `Imported from a public X post by ${authorLabel}.`,
          postText ?? "Add your take: what should builders learn, test, or discuss from this post?",
        ].join("\n\n"),
        1200,
      ),
      xUrl: canonicalPost.normalizedUrl,
    },
  };
}

export async function improveBuildPostDraft(input: BuildPostInput): Promise<BuildPostAssistResult> {
  if (!process.env.BETTER_AUTH_SECRET) {
    return { ok: false, error: "Sign in before using the draft helper." };
  }

  const { auth } = await import("@/lib/auth");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { ok: false, error: "Sign in before using the draft helper." };
  }

  const seed = {
    title: normalizeBuildPostText(input.title, 120),
    summary: normalizeBuildPostText(input.summary, 1200),
    proofNote: normalizeBuildPostText(input.proofNote, 500),
    question: normalizeBuildPostText(input.question, 260),
  };
  if (!seed.title && !seed.summary && !seed.proofNote && !seed.question) {
    return {
      ok: false,
      error:
        "Write a rough outcome, proof note, or question first so Trail has something to improve.",
    };
  }

  const client = aiClient();
  if (!client) {
    return {
      ok: false,
      error: "AI draft help is not configured yet. You can still complete the checklist manually.",
    };
  }

  const proofUrls = [
    input.githubUrl.trim() ? `GitHub: ${input.githubUrl.trim()}` : null,
    input.xUrl.trim() ? `X/Twitter: ${input.xUrl.trim()}` : null,
    input.demoUrl.trim() ? `Demo: ${input.demoUrl.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const completion = await client.chat.completions.create({
      model: textModel(),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You improve short build-post drafts for Trail, a dark social feed for AI builders. Return only JSON with string fields: title, summary, proofNote, question. Keep the builder's meaning. Do not invent proof, links, metrics, users, customers, revenue, or launch results. If no proof note was supplied, leave proofNote empty unless the user already wrote a public proof note. The summary should be concrete, useful, and concise.",
        },
        {
          role: "user",
          content: [
            "Improve this draft so it clearly says what shipped, why it matters, and what builders can discuss.",
            "",
            `Title: ${seed.title || "(none)"}`,
            `Summary: ${seed.summary || "(none)"}`,
            `Proof note: ${seed.proofNote || "(none)"}`,
            `Question: ${seed.question || "(none)"}`,
            "",
            proofUrls ? `Existing proof URLs:\n${proofUrls}` : "Existing proof URLs: none",
          ].join("\n"),
        },
      ],
    });
    const content = completion.choices[0]?.message.content;
    if (!content) {
      return { ok: false, error: "Trail could not improve the draft. Try again in a moment." };
    }

    const parsed = parseAssistDraft(JSON.parse(content) as unknown);
    if (!parsed) {
      return { ok: false, error: "Trail could not read the AI draft. Try again in a moment." };
    }

    const draft = {
      title: parsed.title || seed.title,
      summary: parsed.summary || seed.summary,
      proofNote: parsed.proofNote || seed.proofNote,
      question: parsed.question || seed.question,
    };
    const quality = validateBuildPostQuality({
      summary: draft.summary,
      proofUrlCount: assistProofUrlCount(input),
      proofNote: draft.proofNote,
      question: draft.question,
    });

    return {
      ok: true,
      draft,
      missing: quality.issues.map((issue) => issue.message),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Trail could not improve the draft: ${error.message}`
          : "Trail could not improve the draft. Try again in a moment.",
    };
  }
}

// ---------------------------------------------------------------------------
// Bulk "import my GitHub" seeding tool.
//
// Uses the builder's own stored GitHub OAuth token to list their public repos
// and turn each into an editable DRAFT build post. Attribution stays honest:
// we never accept a free-text username, only the verified GitHub identity tied
// to this account, and we publish under the builder's own profile with the
// canonical repo URL as visible proof. Publishing still runs through the same
// quality gate + rate limit as /create, and is deduped per repo.
// ---------------------------------------------------------------------------

export type GithubImportKind = "repo" | "shipment";

export type GithubRepoDraft = {
  key: string;
  kind: GithubImportKind;
  repoFullName: string;
  subtitle: string;
  title: string;
  summary: string;
  stack: string[];
  githubUrl: string;
  description: string | null;
  pushedAt: string | null;
};

export type GithubProfileImportResult =
  | { ok: true; login: string; drafts: GithubRepoDraft[] }
  | { ok: false; error: string };

type GithubViewerRepoPayload = GitHubRepoPayload & {
  html_url?: unknown;
  fork?: unknown;
  archived?: unknown;
  pushed_at?: unknown;
  owner?: { login?: unknown } | null;
};

async function githubTokenFetch<T>(
  path: string,
  token: string,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${GITHUB_API_BASE}${path}`, {
      headers: {
        ...githubHeaders(),
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status === 401) {
      return { ok: false, error: "Your GitHub connection expired. Sign in again to refresh it." };
    }
    if (!response.ok) {
      return { ok: false, error: "GitHub could not return your repositories right now." };
    }
    return { ok: true, data: (await response.json()) as T };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "GitHub took too long to respond. Try again in a moment." };
    }
    return { ok: false, error: "Trail could not reach GitHub. Try again in a moment." };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Import the signed-in builder's own public GitHub repos as draft build posts.
 * Returns drafts only — nothing is published until the builder edits and
 * confirms each one (so the quality gate still forces real context).
 */
export async function importMyGithubRepos(): Promise<GithubProfileImportResult> {
  if (!process.env.BETTER_AUTH_SECRET || !process.env.DATABASE_URL) {
    return { ok: false, error: "Importing is unavailable until Trail auth is configured." };
  }

  const { auth } = await import("@/lib/auth");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { ok: false, error: "Sign in to import your GitHub repos." };
  }

  const { limitAction } = await import("@/lib/rate-limit");
  const limit = await limitAction("githubImport", session.user.id);
  if (!limit.ok) {
    return { ok: false, error: "Too many imports in a row. Wait a moment and try again." };
  }

  const { db, schema } = await import("@/db/client");
  const { and, eq } = await import("drizzle-orm");
  const account = await db.query.account.findFirst({
    where: and(eq(schema.account.userId, session.user.id), eq(schema.account.providerId, "github")),
    columns: { accessToken: true },
  });
  const token = account?.accessToken;
  if (!token) {
    return {
      ok: false,
      error: "Reconnect GitHub to import your repos (no GitHub token on file).",
    };
  }

  const who = await githubTokenFetch<{ login?: unknown }>("/user", token);
  if (!who.ok) return who;
  const login = text(who.data.login);
  if (!login) {
    return { ok: false, error: "Trail could not read your GitHub identity. Try again." };
  }

  // public_repo scope returns public repos only, so private work never leaks in.
  const reposResult = await githubTokenFetch<GithubViewerRepoPayload[]>(
    "/user/repos?affiliation=owner&sort=pushed&direction=desc&per_page=40",
    token,
  );
  if (!reposResult.ok) return reposResult;

  const drafts: GithubRepoDraft[] = (Array.isArray(reposResult.data) ? reposResult.data : [])
    .filter(
      (repo) =>
        repo.private !== true &&
        repo.fork !== true &&
        repo.archived !== true &&
        Boolean(text(repo.full_name) ?? text(repo.name)),
    )
    .slice(0, 30)
    .map((repo) => {
      const repoName = text(repo.name) ?? "repo";
      const repoFullName = text(repo.full_name) ?? `${login}/${repoName}`;
      const description = text(repo.description);
      const url = text(repo.html_url) ?? `https://github.com/${repoFullName}`;
      // Neutral scaffold — intentionally does NOT claim authorship and is short
      // enough that the quality gate still requires the builder to add context.
      const summary = description ? `${description}\n\n` : "";
      return {
        key: `repo:${repoFullName}`,
        kind: "repo",
        repoFullName,
        subtitle: repoFullName,
        title: truncate(repoName, 120),
        summary: truncate(summary, 1200),
        stack: stackFromRepo(repo),
        githubUrl: url,
        description,
        pushedAt: text(repo.pushed_at),
      } satisfies GithubRepoDraft;
    });

  return { ok: true, login, drafts };
}

type GithubSearchPrItem = {
  title?: unknown;
  html_url?: unknown;
  body?: unknown;
  number?: unknown;
  closed_at?: unknown;
  pull_request?: { merged_at?: unknown } | null;
};

/** Parse "owner/repo" + number from a PR html_url (…/owner/repo/pull/N). */
function repoFromPrUrl(url: string): { repoFullName: string; number: number | null } | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 4 || parts[2] !== "pull") return null;
    const number = Number(parts[3]);
    return {
      repoFullName: `${parts[0]}/${parts[1]}`,
      number: Number.isInteger(number) ? number : null,
    };
  } catch {
    return null;
  }
}

/**
 * Import the builder's recent merged pull requests as draft "shipment" posts —
 * the high-signal unit Trail is built around ("I shipped this"). Each draft
 * links to the merged PR as proof. Drafts only; publishing still runs the
 * quality gate. Public PRs only (private needs a scope we never request).
 */
export async function importMyGithubShipments(): Promise<GithubProfileImportResult> {
  if (!process.env.BETTER_AUTH_SECRET || !process.env.DATABASE_URL) {
    return { ok: false, error: "Importing is unavailable until Trail auth is configured." };
  }

  const { auth } = await import("@/lib/auth");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { ok: false, error: "Sign in to import your shipments." };
  }

  const { limitAction } = await import("@/lib/rate-limit");
  const limit = await limitAction("githubImport", session.user.id);
  if (!limit.ok) {
    return { ok: false, error: "Too many imports in a row. Wait a moment and try again." };
  }

  const { db, schema } = await import("@/db/client");
  const { and, eq } = await import("drizzle-orm");
  const account = await db.query.account.findFirst({
    where: and(eq(schema.account.userId, session.user.id), eq(schema.account.providerId, "github")),
    columns: { accessToken: true },
  });
  const token = account?.accessToken;
  if (!token) {
    return { ok: false, error: "Reconnect GitHub to import your shipments (no GitHub token)." };
  }

  const who = await githubTokenFetch<{ login?: unknown }>("/user", token);
  if (!who.ok) return who;
  const login = text(who.data.login);
  if (!login) {
    return { ok: false, error: "Trail could not read your GitHub identity. Try again." };
  }

  const query = encodeURIComponent(`type:pr is:merged author:${login}`);
  const searchResult = await githubTokenFetch<{ items?: GithubSearchPrItem[] }>(
    `/search/issues?q=${query}&sort=updated&order=desc&per_page=30`,
    token,
  );
  if (!searchResult.ok) return searchResult;

  const items = Array.isArray(searchResult.data.items) ? searchResult.data.items : [];
  const drafts: GithubRepoDraft[] = [];
  for (const item of items) {
    const url = text(item.html_url);
    if (!url) continue;
    const parsed = repoFromPrUrl(url);
    if (!parsed) continue;
    const prTitle = text(item.title) ?? `PR #${parsed.number ?? ""}`.trim();
    const bodyLead = firstParagraph(item.body);
    const summary = bodyLead ? `${bodyLead}\n\n` : "";
    drafts.push({
      key: `pr:${url}`,
      kind: "shipment",
      repoFullName: parsed.repoFullName,
      subtitle: parsed.number
        ? `${parsed.repoFullName} #${parsed.number} · merged`
        : `${parsed.repoFullName} · merged`,
      title: truncate(prTitle, 120),
      summary: truncate(summary, 1200),
      stack: [],
      githubUrl: url,
      description: bodyLead,
      pushedAt: text(item.closed_at),
    });
  }

  return { ok: true, login, drafts };
}

/**
 * Publish one imported repo or merged PR as a build post. Wraps
 * createBuildPostFromFeed with (1) idempotency — per-PR for shipments, per-repo
 * for repo backfills, so re-clicking/re-importing never duplicates and same-repo
 * PRs don't collide — and (2) an explicit provenance proof note.
 */
export async function publishImportedBuildPost(
  input: BuildPostInput,
): Promise<import("@/app/feed/actions").FeedPublishResult> {
  if (!process.env.BETTER_AUTH_SECRET || !process.env.DATABASE_URL) {
    return { ok: false, error: "Posting is unavailable until Trail auth is configured." };
  }

  const { auth } = await import("@/lib/auth");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { ok: false, error: "Sign in to publish a build." };
  }

  const { extractGithubLinkage } = await import("@/lib/github-url");
  const linkage = extractGithubLinkage(input.githubUrl);

  if (linkage.linkedRepo) {
    const { db, schema } = await import("@/db/client");
    const { and, eq, isNotNull, isNull } = await import("drizzle-orm");
    // A PR post is unique by its PR URL; a repo backfill post is unique by repo
    // (and must not collide with PR posts of the same repo).
    const dedupeFilter = linkage.linkedPrUrl
      ? eq(schema.trailSession.linkedPrUrl, linkage.linkedPrUrl)
      : and(
          eq(schema.trailSession.linkedRepo, linkage.linkedRepo),
          isNull(schema.trailSession.linkedPrUrl),
        );
    const existing = await db.query.trailSession.findFirst({
      where: and(
        eq(schema.trailSession.userId, session.user.id),
        eq(schema.trailSession.postKind, "manual_build"),
        isNotNull(schema.trailSession.sharedAt),
        dedupeFilter,
      ),
      columns: { slug: true },
    });
    if (existing) {
      const viewer = await db.query.user.findFirst({
        where: eq(schema.user.id, session.user.id),
        columns: { handle: true },
      });
      if (viewer?.handle) {
        const href = `/u/${viewer.handle}/${existing.slug}`;
        return {
          ok: false,
          error: linkage.linkedPrUrl
            ? "You already posted this PR."
            : "You already posted this repo.",
          actionHref: href,
          actionLabel: "Open post",
        };
      }
    }
  }

  const { createBuildPostFromFeed } = await import("@/app/feed/actions");
  const proofNote = input.proofNote?.trim()
    ? input.proofNote
    : "Imported from public GitHub metadata.";
  return createBuildPostFromFeed({ ...input, proofNote });
}
