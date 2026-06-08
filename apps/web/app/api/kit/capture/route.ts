export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";
import { captureAndPersistKit } from "@/lib/kit-capture";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

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

  const result = await captureAndPersistKit({
    token: account.accessToken,
    userId: sess.user.id,
    repo,
    sessionId: linkedSessionId,
    prompts: pastedPrompts,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ id: result.id, reproducibility: result.reproducibility });
}
