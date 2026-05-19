import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_RE = /^[a-f0-9]{32,64}$/i;
const TTL_MINUTES = 10;

// Called by the CLI at the start of `trail login` to register the device
// token it just generated. The web /cli-auth page is then a pure consumer
// of pre-existing tokens (so a bare GET with an unknown token can render
// "invalid request" instead of side-effectfully creating rows).
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const token =
    typeof body === "object" && body !== null && "token" in body
      ? String((body as { token: unknown }).token ?? "")
      : "";
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "invalid token" }, { status: 400 });
  }

  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);
  await db
    .insert(schema.cliToken)
    .values({ id: token, status: "pending", expiresAt })
    .onConflictDoNothing({ target: schema.cliToken.id });

  // Opportunistic GC of expired rows.
  await db.execute(sql`DELETE FROM cli_token WHERE expires_at < now()`);

  return NextResponse.json({ ok: true, expiresAt: expiresAt.toISOString() });
}
