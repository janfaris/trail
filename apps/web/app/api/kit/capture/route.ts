export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";
import { assembleKitFromRepo } from "@/lib/kit-assembler";
import { redactSecrets } from "@/lib/kit-matchers";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const MAX_PROMPT_CHARS = 4000;
const MAX_PROMPTS_TOTAL_CHARS = 24_000;

/** Redact + cap user-pasted prompts before they are persisted and shown. */
function sanitizePrompts(raw: string[]): string[] {
  const out: string[] = [];
  let total = 0;
  for (const p of raw) {
    const cleaned = redactSecrets(p.trim()).slice(0, MAX_PROMPT_CHARS);
    if (!cleaned) continue;
    if (total + cleaned.length > MAX_PROMPTS_TOTAL_CHARS) break;
    total += cleaned.length;
    out.push(cleaned);
    if (out.length >= 12) break;
  }
  return out;
}

// POST /api/kit/capture — assemble a Build Kit from a GitHub repo and persist it.
// Body: { repo: "owner/name", sessionId?: string, prompts?: string[] }
export async function POST(req: Request) {
  const sess = await auth.api.getSession({ headers: await headers() });
  if (!sess?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { repo?: unknown; sessionId?: unknown; prompts?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const repo = typeof body.repo === "string" ? body.repo.trim() : "";
  if (!repo) return NextResponse.json({ error: "repo_required" }, { status: 400 });
  const pastedPrompts = Array.isArray(body.prompts)
    ? body.prompts.filter((p): p is string => typeof p === "string")
    : [];

  const account = await db.query.account.findFirst({
    where: and(eq(schema.account.userId, sess.user.id), eq(schema.account.providerId, "github")),
    columns: { accessToken: true },
  });
  if (!account?.accessToken) {
    return NextResponse.json({ error: "github_not_connected" }, { status: 400 });
  }

  const result = await assembleKitFromRepo(account.accessToken, repo, { pastedPrompts });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }
  const kit = result.kit;
  const safePrompts = sanitizePrompts(pastedPrompts);

  // Only link a session the caller actually owns; otherwise leave it unlinked.
  let linkedSessionId: string | null = null;
  if (typeof body.sessionId === "string" && body.sessionId) {
    const owned = await db.query.trailSession.findFirst({
      where: and(
        eq(schema.trailSession.id, body.sessionId),
        eq(schema.trailSession.userId, sess.user.id),
      ),
      columns: { id: true },
    });
    linkedSessionId = owned?.id ?? null;
  }

  const id = crypto.randomUUID();
  try {
    await db.insert(schema.buildKit).values({
      id,
      userId: sess.user.id,
      sessionId: linkedSessionId,
      sourceRepo: kit.sourceRepo,
      sourceCommitSha: kit.sourceCommitSha,
      defaultBranch: kit.defaultBranch,
      isPrivateRepo: kit.isPrivateRepo,
      title: kit.title,
      summary: kit.summary,
      rulesFiles: kit.rulesFiles,
      stackManifest: kit.stackManifest ?? null,
      orderedPrompts: safePrompts,
      reproducibility: kit.reproducibility,
      // Privacy boundary: a kit derived from a PRIVATE repo must not be public —
      // its rules/stack could leak internal architecture even after redaction.
      visibility: kit.isPrivateRepo ? "private" : "public",
    });
  } catch (err) {
    // Most likely the build_kit table hasn't been pushed yet (db:push). Surface
    // a clear, non-500 signal so the UI can explain instead of crashing.
    console.error("kit capture insert failed", err);
    return NextResponse.json({ error: "kit_storage_unavailable" }, { status: 503 });
  }

  return NextResponse.json({ id, reproducibility: kit.reproducibility });
}
