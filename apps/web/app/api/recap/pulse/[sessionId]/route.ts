/**
 * POST /api/recap/pulse/[sessionId]
 *
 * Owner-only. Materializes a Pulse Recap for the given trailSession.
 * Idempotent — returns the existing recap if one already exists.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { generatePulseRecap } from "@/lib/recap/generate-pulse";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const sess = await auth.api.getSession({ headers: await headers() });
  if (!sess?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await generatePulseRecap(sessionId, sess.user.id);
  if (!result.ok) {
    const status =
      result.reason === "session-not-found"
        ? 404
        : result.reason === "not-owner"
          ? 403
          : 500;
    return NextResponse.json({ error: result.reason, message: result.message }, { status });
  }

  return NextResponse.json({
    ok: true,
    recapId: result.recapId,
    slug: result.slug,
    created: result.created,
    url: `/r/${result.slug}`,
  });
}
