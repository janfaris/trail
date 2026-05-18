import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { Session as SessionSchema } from "@trail/schema";
import { type UploadSessionResponse } from "@trail/client";
import { anonymize } from "@trail/anonymize";
import { deriveTitle } from "@/lib/derive-title";
import { eq } from "drizzle-orm";

function genSlug() {
  return Math.random().toString(36).slice(2, 10);
}

function genId() {
  return crypto.randomUUID();
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = SessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid session", issues: parsed.error.issues }, { status: 400 });
  }
  // Defense-in-depth: even if the CLI forgot to scrub, we scrub server-side too.
  const { session: s } = anonymize(parsed.data);

  const userRow = await db.query.user.findFirst({ where: eq(schema.user.id, session.user.id) });
  if (!userRow?.handle) {
    return NextResponse.json({ error: "user has no handle" }, { status: 400 });
  }

  const slug = s.shareSlug || genSlug();
  const sessionId = genId();

  await db.insert(schema.trailSession).values({
    id: sessionId,
    userId: session.user.id,
    slug,
    tool: s.tool,
    repo: s.repo,
    summary: s.summary,
    title: deriveTitle(
      s.events.find((e) => e.kind === "prompt")?.text,
      s.id.slice(0, 8),
    ),
    eventCount: s.events.length,
    startedAt: new Date(s.startedAt),
    endedAt: s.endedAt ? new Date(s.endedAt) : null,
  });

  if (s.events.length > 0) {
    await db.insert(schema.event).values(
      s.events.map((e, i) => ({
        id: genId(),
        sessionId,
        idx: i,
        kind: e.kind,
        at: new Date(e.at),
        data: e as unknown as Record<string, unknown>,
      })),
    );
  }

  const baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  const response: UploadSessionResponse = {
    url: `${baseUrl}/u/${userRow.handle}/${slug}`,
    slug,
  };
  return NextResponse.json(response);
}
