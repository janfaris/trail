export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";
import { captureAndPersistKit } from "@/lib/kit-capture";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const MAX_REPOS_PER_BATCH = 8;

type BulkResult = {
  repo: string;
  id?: string;
  reproducibility?: string;
  skipped?: boolean;
  error?: string;
};

// POST /api/kit/capture/bulk — turn several repos into Build Kits in one pass
// (seeding). Body: { repos: string[] }. Idempotent: a repo that already has a
// kit for this user is skipped, not duplicated. Runs sequentially with a small
// cap so it stays inside the function time budget.
export async function POST(req: Request) {
  const sess = await auth.api.getSession({ headers: await headers() });
  if (!sess?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { repos?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const repos = Array.isArray(body.repos)
    ? Array.from(
        new Set(
          body.repos
            .filter((r): r is string => typeof r === "string")
            .map((r) => r.trim())
            .filter(Boolean),
        ),
      ).slice(0, MAX_REPOS_PER_BATCH)
    : [];
  if (repos.length === 0) {
    return NextResponse.json({ error: "repos_required" }, { status: 400 });
  }

  const account = await db.query.account.findFirst({
    where: and(eq(schema.account.userId, sess.user.id), eq(schema.account.providerId, "github")),
    columns: { accessToken: true },
  });
  if (!account?.accessToken) {
    return NextResponse.json({ error: "github_not_connected" }, { status: 400 });
  }

  const results: BulkResult[] = [];
  for (const repo of repos) {
    const res = await captureAndPersistKit({
      token: account.accessToken,
      userId: sess.user.id,
      repo,
      skipIfExists: true,
    });
    results.push(
      res.ok
        ? { repo, id: res.id, reproducibility: res.reproducibility, skipped: res.skipped }
        : { repo, error: res.error },
    );
  }

  const created = results.filter((r) => r.id && !r.skipped).length;
  return NextResponse.json({ results, created });
}
