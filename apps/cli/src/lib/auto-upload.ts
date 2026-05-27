// Auto-upload pipeline used by the daemon.
//
// Triggered after a session is ingested into local SQLite. We:
//   1. Bail if config.autoUpload is false (default).
//   2. Bail if we already uploaded this session (share_slug IS NOT NULL).
//   3. Bail if no git commit context — we can't attribute the cost.
//   4. Bail if the commit isn't reachable from origin/main yet (still on
//      a feature branch). A 5-min re-poll loop in record.ts re-attempts
//      these sessions periodically — see `rescanPendingUploads`.
//   5. Run anonymize() + entropy guard. If suspects found, we DO NOT
//      auto-upload — that path requires explicit human review via
//      `trail share --allow-suspects`. Auto-upload sticks to clean
//      sessions only.
//   6. Upload via @trail/client and persist the returned slug back to
//      local DB.
//
// Log lines go to stdout (which under launchd ends up in
// ~/.trail/daemon.log) so users can see what auto-uploaded and what was
// skipped + why.

import chalk from "chalk";
import { execFileSync } from "node:child_process";
import { db } from "../db.js";
import { loadAuth } from "./auth-storage.js";
import { loadConfig } from "./config.js";
import { detectGitContextForCwd } from "../git-context.js";
import { createTrailClient, DEFAULT_TRAIL_API_URL } from "@trail/client";
import { anonymize } from "@trail/anonymize";
import type { Session } from "@trail/schema";

interface AutoUploadDecision {
  kind: "uploaded" | "skipped";
  reason?: string;
  slug?: string;
}

/**
 * Run a quick `git merge-base --is-ancestor <sha> origin/main` check. If
 * the commit is reachable from the default branch, this exits 0; any
 * other exit code (or thrown error) means "not yet shipped" and we
 * should defer. We try `origin/main`, then `origin/master`, then any
 * configured `--default` ref so older repos work.
 */
function isCommitShipped(repoCwd: string, sha: string): boolean {
  const refs = ["origin/main", "origin/master", "origin/HEAD"];
  for (const ref of refs) {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", sha, ref], {
        cwd: repoCwd,
        stdio: "pipe",
      });
      return true;
    } catch {
      // not reachable from this ref, try next
    }
  }
  return false;
}

interface LocalSessionRow {
  id: string;
  user: string;
  tool: string;
  share_slug: string | null;
  source_path: string | null;
}

interface LocalEventRow {
  at: string;
  kind: string;
  payload: string;
}

function loadSessionFromDb(id: string): {
  session: Session;
  alreadyShared: boolean;
} | null {
  const row = db
    .prepare(
      `SELECT id, user, tool, started_at, ended_at, repo, share_slug, source_path
       FROM sessions WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string;
        user: string;
        tool: string;
        started_at: string;
        ended_at: string | null;
        repo: string | null;
        share_slug: string | null;
        source_path: string | null;
      }
    | undefined;
  if (!row) return null;

  const events = (
    db
      .prepare(
        `SELECT at, kind, payload FROM events WHERE session_id = ? ORDER BY id ASC`,
      )
      .all(id) as LocalEventRow[]
  ).map((e) => JSON.parse(e.payload));

  const session: Session = {
    id: row.id,
    user: row.user,
    tool: row.tool as Session["tool"],
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    repo: row.repo ?? undefined,
    events,
  };

  return { session, alreadyShared: row.share_slug !== null };
}

export async function maybeAutoUpload(
  sessionId: string,
  sourcePath: string | null,
): Promise<AutoUploadDecision> {
  const cfg = loadConfig();
  if (!cfg.autoUpload) {
    return { kind: "skipped", reason: "autoUpload disabled" };
  }

  const auth = loadAuth();
  if (!auth) {
    return {
      kind: "skipped",
      reason: "not logged in — run `trail login`",
    };
  }

  const loaded = loadSessionFromDb(sessionId);
  if (!loaded) return { kind: "skipped", reason: "session not in local DB" };
  if (loaded.alreadyShared) {
    return { kind: "skipped", reason: "already uploaded" };
  }

  // Use the source-file's repo as the reachability check root. Sessions
  // captured outside a git repo (e.g. ad-hoc Claude Code shells) won't
  // have a sourcePath in a repo and will fail this check — that's the
  // right behavior. The user explicitly shares those via `trail share`.
  const git = detectGitContextForCwd(sourcePath ?? process.cwd());
  if (!git.commitSha || !git.repo) {
    return {
      kind: "skipped",
      reason: "no git context (session not tied to a commit)",
    };
  }

  if (!isCommitShipped(git.cwd ?? process.cwd(), git.commitSha)) {
    return {
      kind: "skipped",
      reason: `commit ${git.commitSha.slice(0, 7)} not yet on origin/main — will re-check`,
    };
  }

  // Apply the same scrub + entropy guard `trail share` uses. Default
  // scope: keep diffs + tool args (mirrors `trail share` flag defaults).
  // We don't pass --allow-suspects: auto-upload refuses risky sessions.
  const { session: scrubbed, report } = anonymize(loaded.session);
  if (report.suspects.length > 0) {
    return {
      kind: "skipped",
      reason: `entropy guard found ${report.suspects.length} suspect(s) — review with \`trail share ${sessionId.slice(0, 8)}\``,
    };
  }

  const baseUrl = process.env.TRAIL_API_URL || DEFAULT_TRAIL_API_URL;
  const linkHeaders: Record<string, string> = {
    "x-trail-linked-repo": git.repo,
    "x-trail-linked-commit": git.commitSha,
  };
  if (git.repoUrl) {
    linkHeaders["x-trail-linked-commit-url"] =
      `${git.repoUrl}/commit/${git.commitSha}`;
  }
  const client = createTrailClient({
    baseUrl,
    getAuthCookie: () => auth.cookie,
    extraHeaders: linkHeaders,
  });

  const result = await client.uploadSession(scrubbed);
  if (!result.ok) {
    return {
      kind: "skipped",
      reason: `upload failed: ${result.error.kind}${result.error.kind === "free_tier_session_cap" ? " (upgrade at gettrail.vercel.app/pricing)" : ""}`,
    };
  }

  db.prepare(`UPDATE sessions SET share_slug = ? WHERE id = ?`).run(
    result.value.slug,
    sessionId,
  );

  return { kind: "uploaded", slug: result.value.slug };
}

/**
 * Log helper that mirrors the daemon's existing `chalk.green("ingested")`
 * style. Lives here so record.ts only has to call us, not format the
 * line itself.
 */
export function logDecision(sessionId: string, d: AutoUploadDecision): void {
  if (d.kind === "uploaded") {
    console.log(
      chalk.green("✓ auto-uploaded"),
      sessionId.slice(0, 12),
      chalk.dim(`→ /${d.slug}`),
    );
  } else {
    // Keep skip lines quiet by default — they fire on every ingest when
    // autoUpload is off. Suppress the "autoUpload disabled" reason
    // entirely; surface the others so users can see what's blocked.
    if (d.reason === "autoUpload disabled" || d.reason === "already uploaded") return;
    console.log(
      chalk.gray("· auto-upload skipped"),
      sessionId.slice(0, 12),
      chalk.dim(d.reason ?? ""),
    );
  }
}

/**
 * Re-scan local DB for sessions that didn't upload last time (e.g. their
 * commit wasn't on main yet) and re-attempt. Called on a 5-min interval
 * by the daemon's main loop.
 */
export async function rescanPendingUploads(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.autoUpload) return;

  const rows = db
    .prepare(
      `SELECT id, source_path FROM sessions
       WHERE share_slug IS NULL
       ORDER BY started_at DESC
       LIMIT 50`,
    )
    .all() as Array<{ id: string; source_path: string | null }>;

  for (const r of rows) {
    try {
      const d = await maybeAutoUpload(r.id, r.source_path);
      // Quiet rescan: only log uploads + the upload failures from rescan.
      // Skipped-for-still-on-feature-branch is the steady state of the
      // queue and would spam the log every 5 min.
      if (d.kind === "uploaded") {
        logDecision(r.id, d);
      } else if (d.reason && d.reason.startsWith("upload failed")) {
        logDecision(r.id, d);
      }
    } catch (err) {
      // Don't let one bad row kill the rescan loop.
      console.error(
        chalk.red("auto-upload rescan error"),
        r.id.slice(0, 12),
        (err as Error).message,
      );
    }
  }
}
