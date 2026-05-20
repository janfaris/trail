export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { eq, and, sql } from "drizzle-orm";
import { headers } from "next/headers";

// Add or remove a session from a playlist. Curator only.
// POST   { sessionSlug, note? }   → append session at next position
// DELETE { sessionSlug }          → remove session

async function loadPlaylistAndAuth(
  req: NextRequest,
  slug: string,
): Promise<
  | { ok: true; playlistId: string; userId: string }
  | { ok: false; response: NextResponse }
> {
  const sess = await auth.api.getSession({ headers: await headers() });
  if (!sess?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  const p = await db.query.playlist.findFirst({
    where: eq(schema.playlist.slug, slug),
  });
  if (!p) {
    return { ok: false, response: NextResponse.json({ error: "not found" }, { status: 404 }) };
  }
  if (p.curatorId !== sess.user.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, playlistId: p.id, userId: sess.user.id };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const authResult = await loadPlaylistAndAuth(req, slug);
  if (!authResult.ok) return authResult.response;

  let body: { sessionSlug?: string; note?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.sessionSlug) {
    return NextResponse.json({ error: "sessionSlug required" }, { status: 400 });
  }

  const sessRow = await db.query.trailSession.findFirst({
    where: eq(schema.trailSession.slug, body.sessionSlug),
  });
  if (!sessRow) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  const posRows = await db
    .select({ max: sql<number>`COALESCE(MAX(${schema.playlistItem.position}), 0)::int` })
    .from(schema.playlistItem)
    .where(eq(schema.playlistItem.playlistId, authResult.playlistId));
  const nextPos = (posRows[0]?.max ?? 0) + 1;

  try {
    await db.insert(schema.playlistItem).values({
      id: crypto.randomUUID(),
      playlistId: authResult.playlistId,
      sessionId: sessRow.id,
      position: nextPos,
      note: body.note?.slice(0, 200) ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: "session already in playlist" },
      { status: 409 },
    );
  }
  await db
    .update(schema.playlist)
    .set({ updatedAt: new Date() })
    .where(eq(schema.playlist.id, authResult.playlistId));

  return NextResponse.json({ ok: true, position: nextPos });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const authResult = await loadPlaylistAndAuth(req, slug);
  if (!authResult.ok) return authResult.response;

  let body: { sessionSlug?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.sessionSlug) {
    return NextResponse.json({ error: "sessionSlug required" }, { status: 400 });
  }

  const sessRow = await db.query.trailSession.findFirst({
    where: eq(schema.trailSession.slug, body.sessionSlug),
  });
  if (!sessRow) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  await db
    .delete(schema.playlistItem)
    .where(
      and(
        eq(schema.playlistItem.playlistId, authResult.playlistId),
        eq(schema.playlistItem.sessionId, sessRow.id),
      ),
    );
  return NextResponse.json({ ok: true });
}
