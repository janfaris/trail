import { Octokit } from "@octokit/rest";
import {
  type MatchedKitFiles,
  gradeReproducibility,
  matchKitFiles,
  parseStack,
  redactSecrets,
} from "./kit-matchers";
import type { KitRuleFile, KitStackManifest, Reproducibility } from "./kit-types";

// Server-side Build Kit assembly. Reads a repo's agent-rules + stack files via
// the user's stored GitHub OAuth token (zero local install) and turns them into
// a persistable kit. Mirrors the Octokit usage in lib/github-verify.ts.

const MAX_RULE_FILES = 8;
const MAX_FILE_BYTES = 64 * 1024; // skip anything larger; rules/manifests are small

export interface AssembledKit {
  sourceRepo: string;
  defaultBranch: string;
  sourceCommitSha: string | null;
  isPrivateRepo: boolean;
  title: string;
  summary: string | null;
  rulesFiles: KitRuleFile[];
  stackManifest: KitStackManifest | null;
  reproducibility: Reproducibility;
}

export type AssembleResult =
  | { ok: true; kit: AssembledKit }
  | { ok: false; error: string; status?: number };

function parseRepoFullName(repo: string): { owner: string; name: string } | null {
  const [owner, name] = repo
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .split("/");
  if (!owner || !name) return null;
  return { owner, name: name.replace(/\.git$/, "") };
}

/** Decode a getContent file response body, or null when not a readable file. */
function decodeContent(data: unknown): string | null {
  if (
    data &&
    typeof data === "object" &&
    "type" in data &&
    (data as { type?: string }).type === "file" &&
    "content" in data &&
    typeof (data as { content?: unknown }).content === "string"
  ) {
    const { content, size } = data as { content: string; size?: number };
    if (typeof size === "number" && size > MAX_FILE_BYTES) return null;
    return Buffer.from(content, "base64").toString("utf8");
  }
  return null;
}

/**
 * Assemble a Build Kit from a GitHub repo. `token` is the session owner's OAuth
 * token (read scope). Never throws — returns a structured result so callers can
 * surface a clean error.
 */
export async function assembleKitFromRepo(
  token: string,
  repoFullName: string,
  opts?: { pastedPrompts?: string[]; orderedPrompts?: string[] },
): Promise<AssembleResult> {
  const parsed = parseRepoFullName(repoFullName);
  if (!parsed) return { ok: false, error: "Enter a repo as owner/name." };
  const { owner, name } = parsed;

  const gh = new Octokit({ auth: token });

  let repoData: Awaited<ReturnType<typeof gh.repos.get>>["data"];
  try {
    repoData = (await gh.repos.get({ owner, repo: name })).data;
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) return { ok: false, error: "Repo not found or not accessible.", status };
    return { ok: false, error: "Could not read that repo.", status };
  }

  const defaultBranch = repoData.default_branch;
  let matched: MatchedKitFiles = { rules: [], manifests: [], configs: [] };
  let headSha: string | null = null;

  try {
    const branch = await gh.repos.getBranch({ owner, repo: name, branch: defaultBranch });
    headSha = branch.data.commit?.sha ?? null;
    const treeSha = branch.data.commit?.commit?.tree?.sha ?? defaultBranch;
    const tree = await gh.git.getTree({ owner, repo: name, tree_sha: treeSha, recursive: "1" });
    const paths = tree.data.tree
      .filter((node) => node.type === "blob" && typeof node.path === "string")
      .map((node) => node.path as string);
    matched = matchKitFiles(paths);
  } catch {
    // Tree read failed (empty repo, huge repo). Fall through with no files —
    // the kit can still carry pasted prompts and be graded prompts-only.
  }

  // Read rule files (capped) + the preferred manifest, redacting as we go.
  const ruleFiles: KitRuleFile[] = [];
  for (const path of matched.rules.slice(0, MAX_RULE_FILES)) {
    const body = await readFile(gh, owner, name, path);
    if (body) ruleFiles.push({ path, body: redactSecrets(body) });
  }
  // Capture .env.example among configs (never a real .env — matchers exclude it).
  for (const path of matched.configs) {
    if (ruleFiles.length >= MAX_RULE_FILES) break;
    if (!/\.env\.example$/i.test(path)) continue;
    const body = await readFile(gh, owner, name, path);
    if (body) ruleFiles.push({ path, body: redactSecrets(body) });
  }

  let stackManifest: KitStackManifest | null = null;
  const primaryManifest = matched.manifests[0];
  if (primaryManifest === "package.json") {
    const body = await readFile(gh, owner, name, primaryManifest);
    if (body) stackManifest = parseStack(body);
  } else if (primaryManifest) {
    // Non-JS manifest: we don't deep-parse yet, but record its presence so the
    // kit still grades as having a stack.
    stackManifest = {
      packageManager: null,
      frameworks: [],
      dependencies: [primaryManifest],
      language: repoData.language ?? null,
    };
  }

  const orderedPrompts = (opts?.orderedPrompts ?? opts?.pastedPrompts ?? [])
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 12);

  const hasRules = ruleFiles.some((f) => !/\.env\.example$/i.test(f.path));
  const hasStack = stackManifest != null;
  const reproducibility = gradeReproducibility({
    hasRules,
    hasStack,
    hasPrompts: orderedPrompts.length > 0,
    // Verified requires a public repo; we don't run commit ancestry here yet, so
    // the strongest grade capture can earn is "partial" until a shipped commit
    // is bound. Public + rules + stack still reads as a strong, reusable kit.
    shippedPublicCommit: false,
  });

  return {
    ok: true,
    kit: {
      sourceRepo: `${owner}/${name}`,
      defaultBranch,
      sourceCommitSha: headSha,
      isPrivateRepo: Boolean(repoData.private),
      title: repoData.name,
      summary: repoData.description ?? null,
      rulesFiles: ruleFiles,
      stackManifest,
      reproducibility,
    },
  };
}

async function readFile(
  gh: Octokit,
  owner: string,
  repo: string,
  path: string,
): Promise<string | null> {
  try {
    const res = await gh.repos.getContent({ owner, repo, path });
    return decodeContent(res.data);
  } catch {
    return null;
  }
}
