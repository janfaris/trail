export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";
import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const VALID_TARGETS = new Set([
  "cursor",
  "claude",
  "codex",
  "windsurf",
  "trail-cli",
  "download",
  "copy",
]);

// POST /api/kit/:id/reuse — record that a builder stole this kit into a tool.
// Body: { target: string }. Idempotent per (kit, user, target) so the
// denormalized reuse_count never inflates on repeat clicks.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sess = await auth.api.getSession({ headers: await headers() });
  if (!sess?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { target?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const target = typeof body.target === "string" ? body.target : "";
  if (!VALID_TARGETS.has(target)) {
    return NextResponse.json({ error: "invalid_target" }, { status: 400 });
  }

  try {
    // Authorize: the kit must be visible to the caller (public, or their own).
    // Returning 404 for both missing and unauthorized avoids leaking existence
    // of private kits.
    const [kit] = await db
      .select({ userId: schema.buildKit.userId, visibility: schema.buildKit.visibility })
      .from(schema.buildKit)
      .where(eq(schema.buildKit.id, id))
      .limit(1);
    if (!kit || (kit.visibility !== "public" && kit.userId !== sess.user.id)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const inserted = await db
      .insert(schema.kitReuse)
      .values({ id: crypto.randomUUID(), kitId: id, userId: sess.user.id, target })
      .onConflictDoNothing({
        target: [schema.kitReuse.kitId, schema.kitReuse.userId, schema.kitReuse.target],
      })
      .returning({ id: schema.kitReuse.id });

    // Recompute the denormalized counter from the source of truth so it self-heals
    // (no drift if a prior increment ever failed) and is race-free.
    if (inserted.length > 0) {
      await db
        .update(schema.buildKit)
        .set({
          reuseCount: sql`(select count(*)::int from ${schema.kitReuse} where ${schema.kitReuse.kitId} = ${id})`,
        })
        .where(eq(schema.buildKit.id, id));
    }

    const [row] = await db
      .select({ reuseCount: schema.buildKit.reuseCount })
      .from(schema.buildKit)
      .where(eq(schema.buildKit.id, id))
      .limit(1);

    return NextResponse.json({ recorded: inserted.length > 0, reuseCount: row?.reuseCount ?? 0 });
  } catch (err) {
    console.error("kit reuse failed", err);
    return NextResponse.json({ error: "kit_storage_unavailable" }, { status: 503 });
  }
}
