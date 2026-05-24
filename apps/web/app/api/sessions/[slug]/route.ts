export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { eq, and, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

// DELETE /api/sessions/:slug — owner-only single-session delete.
// Cascades through events/reactions via FK ON DELETE CASCADE.
export async function DELETE(
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
  });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.userId !== sess.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await db.delete(schema.trailSession).where(eq(schema.trailSession.id, row.id));

  const me = await db.query.user.findFirst({
    where: eq(schema.user.id, sess.user.id),
  });
  if (me?.handle) {
    revalidatePath(`/u/${me.handle}`);
    revalidatePath(`/u/${me.handle}/interview`);
    revalidatePath(`/dashboard`);
  }

  return NextResponse.json({ ok: true, deleted: 1 });
}
