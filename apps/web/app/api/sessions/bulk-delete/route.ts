export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { eq, and, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

// POST /api/sessions/bulk-delete — owner-only bulk delete by id array.
// Body: { ids: string[] }. Returns { ok, deleted }. Non-owned ids silently
// dropped (we filter against userId before issuing the delete).
export async function POST(req: NextRequest) {
  const sess = await auth.api.getSession({ headers: await headers() });
  if (!sess?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { ids?: unknown };
  try {
    body = (await req.json()) as { ids?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (
    !Array.isArray(body.ids) ||
    body.ids.length === 0 ||
    !body.ids.every((x) => typeof x === "string")
  ) {
    return NextResponse.json(
      { error: "ids must be a non-empty string[]" },
      { status: 400 },
    );
  }
  const ids = body.ids as string[];

  const owned = await db
    .select({ id: schema.trailSession.id })
    .from(schema.trailSession)
    .where(
      and(
        eq(schema.trailSession.userId, sess.user.id),
        inArray(schema.trailSession.id, ids),
      ),
    );
  if (owned.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  await db
    .delete(schema.trailSession)
    .where(
      inArray(
        schema.trailSession.id,
        owned.map((r) => r.id),
      ),
    );

  const me = await db.query.user.findFirst({
    where: eq(schema.user.id, sess.user.id),
  });
  if (me?.handle) {
    revalidatePath(`/u/${me.handle}`);
    revalidatePath(`/u/${me.handle}/interview`);
    revalidatePath(`/dashboard`);
  }

  return NextResponse.json({ ok: true, deleted: owned.length });
}
