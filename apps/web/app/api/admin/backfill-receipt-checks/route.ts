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
  const { generateReceiptAiReview } = await import("@/lib/receipt-ai-review");
  const { and, desc, eq, isNotNull, isNull } = await import("drizzle-orm");

  const rows = await db
    .select({
      id: schema.trailSession.id,
      slug: schema.trailSession.slug,
    })
    .from(schema.trailSession)
    .where(
      and(
        eq(schema.trailSession.visibility, "public"),
        isNotNull(schema.trailSession.sharedAt),
        isNotNull(schema.trailSession.receiptGeneratedAt),
        isNull(schema.trailSession.redactedAt),
        isNull(schema.trailSession.receiptAiReviewGeneratedAt),
      ),
    )
    .orderBy(desc(schema.trailSession.sharedAt))
    .limit(limit);

  if (!apply) {
    return NextResponse.json({
      ok: true,
      apply: false,
      total: rows.length,
      rows: rows.map((row) => ({ id: row.id, slug: row.slug })),
    });
  }

  const results: Array<{ id: string; slug: string; ok: boolean; error?: string }> = [];
  for (const row of rows) {
    const result = await generateReceiptAiReview(row.id);
    results.push({
      id: row.id,
      slug: row.slug,
      ok: result.ok,
      error: result.ok ? undefined : (result.message ?? result.reason),
    });
  }

  const succeeded = results.filter((result) => result.ok).length;
  return NextResponse.json({ ok: true, apply: true, total: rows.length, succeeded, results });
}
