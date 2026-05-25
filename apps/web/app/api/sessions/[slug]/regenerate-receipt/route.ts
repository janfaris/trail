export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { generateReceipt } from "@/lib/receipt-generator";

/**
 * POST /api/sessions/:slug/regenerate-receipt
 * Owner-only. Forces a fresh receipt regeneration (LLM + verification).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const sess = await auth.api.getSession({ headers: await headers() });
  if (!sess?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const row = await db.query.trailSession.findFirst({
    where: eq(schema.trailSession.slug, slug),
    columns: { id: true, userId: true },
  });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.userId !== sess.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await generateReceipt(row.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason, message: result.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    status: result.status,
    warnings: result.warnings,
  });
}
