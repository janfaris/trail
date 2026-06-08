export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";
import { Octokit } from "@octokit/rest";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

// GET /api/github/repos — list the signed-in user's repos for the kit picker.
// Uses their stored GitHub OAuth token (read scope) so nothing runs locally.
export async function GET() {
  const sess = await auth.api.getSession({ headers: await headers() });
  if (!sess?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const account = await db.query.account.findFirst({
    where: and(eq(schema.account.userId, sess.user.id), eq(schema.account.providerId, "github")),
    columns: { accessToken: true },
  });
  if (!account?.accessToken) {
    return NextResponse.json({ error: "github_not_connected" }, { status: 400 });
  }

  try {
    const gh = new Octokit({ auth: account.accessToken });
    const { data } = await gh.repos.listForAuthenticatedUser({
      sort: "updated",
      per_page: 100,
      affiliation: "owner,collaborator",
    });
    const repos = data.map((r) => ({
      fullName: r.full_name,
      private: r.private,
      description: r.description,
      language: r.language,
      updatedAt: r.updated_at,
      pushedAt: r.pushed_at,
    }));
    return NextResponse.json({ repos });
  } catch {
    return NextResponse.json({ error: "github_read_failed" }, { status: 502 });
  }
}
