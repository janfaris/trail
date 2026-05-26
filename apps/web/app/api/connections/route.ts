export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";

// GET /api/connections — list the signed-in user's vendor connections.
// Never returns api_key_enc; that column is encrypted-at-rest and meant to
// stay server-side. Sort is on vendor for stable rendering across reloads.
export async function GET(req: NextRequest) {
  const sess = await auth.api.getSession({ headers: req.headers });
  if (!sess?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      id: schema.vendorConnection.id,
      vendor: schema.vendorConnection.vendor,
      workspaceId: schema.vendorConnection.workspaceId,
      lastSyncedAt: schema.vendorConnection.lastSyncedAt,
      syncStatus: schema.vendorConnection.syncStatus,
      syncErrorMessage: schema.vendorConnection.syncErrorMessage,
      createdAt: schema.vendorConnection.createdAt,
      updatedAt: schema.vendorConnection.updatedAt,
    })
    .from(schema.vendorConnection)
    .where(eq(schema.vendorConnection.userId, sess.user.id))
    .orderBy(schema.vendorConnection.vendor);

  return NextResponse.json({ connections: rows });
}
