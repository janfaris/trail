import { NextRequest, NextResponse } from "next/server";
import { isNull } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { generateRecipe } from "@/lib/recipe-gen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Idempotent backfill: regenerate recipe cards for every session that
// doesn't have one yet. Best-effort per row — failures are logged and
// skipped so one bad session can't block the rest.
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
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 500);

  const rows = await db
    .select({ id: schema.trailSession.id })
    .from(schema.trailSession)
    .where(isNull(schema.trailSession.recipeGeneratedAt))
    .limit(limit);

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const r of rows) {
    try {
      await generateRecipe(r.id);
      results.push({ id: r.id, ok: true });
    } catch (e) {
      results.push({ id: r.id, ok: false, error: String(e instanceof Error ? e.message : e) });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({ ok: true, total: rows.length, succeeded: okCount, results });
}
