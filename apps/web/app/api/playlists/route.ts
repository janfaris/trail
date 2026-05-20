export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { eq, max, asc } from "drizzle-orm";
import { headers } from "next/headers";

// Phase 1.7 — playlist CRUD.
// POST /api/playlists                    create (auth required)
// POST /api/playlists/[slug]/items       add session (curator only)
// (slug actions handled in nested routes)

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function GET() {
  const rows = await db
    .select()
    .from(schema.playlist)
    .orderBy(asc(schema.playlist.createdAt))
    .limit(100);
  return NextResponse.json({ playlists: rows });
}

export async function POST(req: NextRequest) {
  const sess = await auth.api.getSession({ headers: await headers() });
  if (!sess?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { title?: string; description?: string; slug?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.title || body.title.length < 3) {
    return NextResponse.json({ error: "title required (≥3 chars)" }, { status: 400 });
  }

  // Generate unique slug.
  let baseSlug = body.slug ? slugify(body.slug) : slugify(body.title);
  if (!baseSlug) baseSlug = "playlist";
  let slug = baseSlug;
  let suffix = 0;
  while (true) {
    const existing = await db.query.playlist.findFirst({
      where: eq(schema.playlist.slug, slug),
    });
    if (!existing) break;
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
    if (suffix > 30) {
      return NextResponse.json({ error: "couldn't allocate slug" }, { status: 500 });
    }
  }

  const id = crypto.randomUUID();
  await db.insert(schema.playlist).values({
    id,
    slug,
    title: body.title.slice(0, 120),
    description: body.description?.slice(0, 500) ?? null,
    curatorId: sess.user.id,
    isOfficial: false,
  });

  return NextResponse.json({ id, slug, url: `/p/${slug}` });
}
