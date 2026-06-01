export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

// Retroactive redaction endpoint. Owner-only. Two modes:
//   1) substring  — replace literal substring across all events.data text fields.
//   2) eventIdx   — wipe a single event entirely (data → {kind, at, text:"<redacted>"}).
// In both cases we bump `redactedAt` so search / OG cache can invalidate.
//
// Visibility is preserved (a public session stays public after a redaction).
// Use the separate "set visibility" flow for hide/show.

type Body = { substring: string; replacement?: string } | { eventIdx: number };

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sess = await auth.api.getSession({ headers: await headers() });
  if (!sess?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const row = await db.query.trailSession.findFirst({
    where: eq(schema.trailSession.slug, slug),
  });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.userId !== sess.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  let applied = 0;

  if ("eventIdx" in body) {
    const idx = body.eventIdx;
    const existing = await db.query.event.findFirst({
      where: and(eq(schema.event.sessionId, row.id), eq(schema.event.idx, idx)),
    });
    if (!existing) {
      return NextResponse.json({ error: "event not found" }, { status: 404 });
    }
    await db
      .update(schema.event)
      .set({
        data: {
          kind: (existing.data as { kind?: string }).kind ?? "completion",
          at: (existing.data as { at?: string }).at ?? existing.at.toISOString(),
          text: "<redacted:by-owner>",
        },
      })
      .where(eq(schema.event.id, existing.id));
    applied = 1;
  } else if (
    "substring" in body &&
    typeof body.substring === "string" &&
    body.substring.length >= 3
  ) {
    const replacement = body.replacement ?? "<redacted>";
    const events = await db.select().from(schema.event).where(eq(schema.event.sessionId, row.id));
    for (const e of events) {
      const serialized = JSON.stringify(e.data);
      if (!serialized.includes(body.substring)) continue;
      // String replace on the serialized JSON, then re-parse. Safe because
      // the substring path is owner-supplied and we already cloned via JSON.
      const updated = serialized.split(body.substring).join(replacement);
      try {
        const parsed = JSON.parse(updated);
        await db.update(schema.event).set({ data: parsed }).where(eq(schema.event.id, e.id));
        applied += 1;
      } catch (err) {
        // If parsing the rewritten JSON fails (substring crossed a string
        // boundary), fall back to wiping the event entirely — safer to
        // over-redact than to leave the secret in.
        await db
          .update(schema.event)
          .set({
            data: {
              kind: (e.data as { kind?: string }).kind ?? "completion",
              at: e.at.toISOString(),
              text: "<redacted:by-owner>",
            },
          })
          .where(eq(schema.event.id, e.id));
        applied += 1;
        console.error("[redact] fallback wipe for event", e.id, (err as Error).message);
      }
    }
  } else {
    return NextResponse.json(
      { error: "specify {substring} (>=3 chars) or {eventIdx}" },
      { status: 400 },
    );
  }

  await db
    .update(schema.trailSession)
    .set({
      redactedAt: new Date(),
      receiptAiReview: null,
      receiptAiReviewGeneratedAt: null,
      receiptAiReviewModel: null,
      receiptAiReviewError: "cleared-after-redaction",
    })
    .where(eq(schema.trailSession.id, row.id));

  // Owner page + public page both need invalidation.
  const userRow = await db.query.user.findFirst({
    where: eq(schema.user.id, row.userId),
  });
  if (userRow?.handle) {
    revalidatePath(`/u/${userRow.handle}/${slug}`);
    revalidatePath(`/u/${userRow.handle}`);
  }
  revalidatePath("/discover");

  return NextResponse.json({ ok: true, applied });
}
