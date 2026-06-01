import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const apply = url.searchParams.get("apply") === "true";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "10") || 10, 1), 50);

  const { db, schema } = await import("@/db/client");
  const { generateSessionLessons } = await import("@/lib/session-lessons");
  const { and, desc, eq, isNotNull, isNull, sql } = await import("drizzle-orm");

  const rows = await db
    .select({
      id: schema.trailSession.id,
      slug: schema.trailSession.slug,
      title: schema.trailSession.title,
    })
    .from(schema.trailSession)
    .innerJoin(schema.user, eq(schema.trailSession.userId, schema.user.id))
    .where(
      and(
        eq(schema.trailSession.visibility, "public"),
        isNotNull(schema.trailSession.sharedAt),
        isNull(schema.trailSession.redactedAt),
        isNotNull(schema.user.handle),
        sql`not exists (
          select 1
          from session_lesson sl
          where sl.session_id = ${schema.trailSession.id}
        )`,
      ),
    )
    .orderBy(desc(schema.trailSession.sharedAt))
    .limit(limit);

  if (!apply) {
    return NextResponse.json({
      ok: true,
      apply: false,
      total: rows.length,
      rows: rows.map((row) => ({ id: row.id, slug: row.slug, title: row.title })),
    });
  }

  const results: Array<{
    id: string;
    slug: string;
    ok: boolean;
    lessons?: number;
    error?: string;
  }> = [];

  for (const row of rows) {
    const result = await generateSessionLessons(row.id);
    results.push({
      id: row.id,
      slug: row.slug,
      ok: result.ok,
      lessons: result.ok ? result.lessons.length : undefined,
      error: result.ok ? undefined : (result.message ?? result.reason),
    });
  }

  const succeeded = results.filter((result) => result.ok).length;
  const lessons = results.reduce((sum, result) => sum + (result.lessons ?? 0), 0);
  return NextResponse.json({
    ok: true,
    apply: true,
    total: rows.length,
    succeeded,
    lessons,
    results,
  });
}
