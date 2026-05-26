/**
 * POST /api/recap/cost-pulse/[sessionId]
 *
 * Owner-only. Materializes a Cost-Pulse Recap for the given trailSession if
 * (and only if) the session has session_cost_attribution rows. If the session
 * has no cost data attached yet, returns 400 { error: 'no_cost_data' } so the
 * caller can surface that to the user and prompt them to connect a vendor or
 * re-run the attribution engine.
 *
 * Idempotent — returns the existing recap if one already exists.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { generateCostPulseRecap } from "@/lib/recap/generate-cost-pulse";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  // BetterAuth can throw on preview branches where the origin isn't on the
  // trustedOrigins list (see /settings/connections). Defensive try/catch.
  let sess: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    sess = await auth.api.getSession({ headers: await headers() });
  } catch {
    sess = null;
  }
  if (!sess?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await generateCostPulseRecap(sessionId, sess.user.id);
  if (!result.ok) {
    const status =
      result.reason === "session-not-found"
        ? 404
        : result.reason === "not-owner"
          ? 403
          : result.reason === "no-cost-data"
            ? 400
            : 500;
    return NextResponse.json(
      { error: result.reason, message: result.message },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    recapId: result.recapId,
    slug: result.slug,
    created: result.created,
    shippedPrCount: result.shippedPrCount,
    totalCostUsd: result.totalCostUsd,
    url: `/r/${result.slug}`,
  });
}
