import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_RE = /^[a-f0-9]{32,64}$/i;

// Long-poll-ish endpoint hit by the CLI every ~2s during `trail login`.
// Returns:
//   202 {status:'pending'} — row exists, browser hasn't completed OAuth yet
//   200 {status:'ready', cookie, userHandle} — single-use; row is deleted
//   410 {error:'unknown'} — token not in DB (never created, or expired/consumed)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "invalid token" }, { status: 400 });
  }

  const row = await db.query.cliToken.findFirst({
    where: eq(schema.cliToken.id, token),
  });
  if (!row) {
    return NextResponse.json({ error: "unknown" }, { status: 410 });
  }
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(schema.cliToken).where(eq(schema.cliToken.id, token));
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }
  if (row.status !== "ready" || !row.cookieValue || !row.userHandle) {
    return NextResponse.json({ status: "pending" }, { status: 202 });
  }

  // Single-use: consume the row before returning.
  const cookie = row.cookieValue;
  const userHandle = row.userHandle;
  await db.delete(schema.cliToken).where(eq(schema.cliToken.id, token));
  return NextResponse.json({ status: "ready", cookie, userHandle });
}
