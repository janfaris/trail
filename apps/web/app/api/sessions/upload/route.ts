import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { Session as SessionSchema } from "@trail/schema";
import { type UploadSessionResponse } from "@trail/client";
import { anonymize } from "@trail/anonymize";
import { deriveTitle } from "@/lib/derive-title";
import { generateSessionMeta } from "@/lib/openai";
import { generateSessionEmbedding, toVectorLiteral } from "@/lib/embeddings";
import { extractLanguages, computeDurationSeconds } from "@/lib/session-metrics";
import { eq, sql } from "drizzle-orm";

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

  const firstPrompt = s.events.find((e) => e.kind === "prompt")?.text;
  const heuristicTitle = deriveTitle(firstPrompt, s.id.slice(0, 8));

  // Best-effort AI title + summary. Failures fall back silently to heuristic.
  const prompts = s.events
    .filter((e): e is typeof e & { text: string } => e.kind === "prompt" && typeof e.text === "string")
    .slice(0, 3)
    .map((e) => e.text);
  const lastEventKinds = s.events.slice(-3).map((e) => e.kind);
  const ai = prompts.length > 0 ? await generateSessionMeta(prompts, lastEventKinds) : null;

  // Best-effort metrics. Bad data shouldn't block upload.
  let languages: Record<string, number> | null = null;
  let durationSeconds: number | null = null;
  try {
    const ev = s.events as Array<{ kind: string; payload?: unknown; at: string | Date }>;
    languages = extractLanguages(ev);
    durationSeconds = computeDurationSeconds(
      new Date(s.startedAt),
      s.endedAt ? new Date(s.endedAt) : null,
      ev,
    );
  } catch (err) {
    console.error("[upload] metrics failed:", (err as Error).message);
  }

  await db.insert(schema.trailSession).values({
    id: sessionId,
    userId: session.user.id,
    slug,
    tool: s.tool,
    repo: s.repo,
    summary: ai?.summary ?? s.summary,
    title: ai?.title ?? heuristicTitle,
    eventCount: s.events.length,
    startedAt: new Date(s.startedAt),
    endedAt: s.endedAt ? new Date(s.endedAt) : null,
    languages: languages && Object.keys(languages).length > 0 ? languages : null,
    durationSeconds,
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

  // Best-effort embedding. Failure is non-fatal (search just won't index this one).
  try {
    const finalTitle = ai?.title ?? heuristicTitle;
    const finalSummary = ai?.summary ?? s.summary ?? "";
    const embedding = await generateSessionEmbedding(finalTitle, finalSummary, prompts);
    if (embedding) {
      const lit = toVectorLiteral(embedding);
      await db
        .update(schema.trailSession)
        .set({ embedding: sql`${lit}::vector` })
        .where(eq(schema.trailSession.id, sessionId));
    }
  } catch (err) {
    console.error("[upload] embedding failed:", (err as Error).message);
  }

  const baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  const response: UploadSessionResponse = {
    url: `${baseUrl}/u/${userRow.handle}/${slug}`,
    slug,
  };
  return NextResponse.json(response);
}
