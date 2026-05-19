"use server";

import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";

const TOKEN_RE = /^[a-f0-9]{32,64}$/i;

// Called by the success page (server component) to attach the freshly-issued
// session cookie + user handle onto the pending cli_token row. The CLI is
// polling /api/cli-auth/poll and will consume + delete the row.
export async function completeCliAuth(
  token: string,
): Promise<{ ok: true; userHandle: string } | { ok: false; error: string }> {
  if (!TOKEN_RE.test(token)) return { ok: false, error: "invalid token" };

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "not authenticated" };

  const userRow = await db.query.user.findFirst({
    where: eq(schema.user.id, session.user.id),
  });
  if (!userRow?.handle) return { ok: false, error: "user has no handle" };

  const jar = await cookies();
  const cookieEntry =
    jar.get("better-auth.session_token") ??
    jar.get("__Secure-better-auth.session_token");
  if (!cookieEntry?.value) return { ok: false, error: "session cookie missing" };
  const cookieName = jar.get("__Secure-better-auth.session_token")
    ? "__Secure-better-auth.session_token"
    : "better-auth.session_token";
  const cookieHeader = `${cookieName}=${cookieEntry.value}`;

  const row = await db.query.cliToken.findFirst({
    where: eq(schema.cliToken.id, token),
  });
  if (!row) return { ok: false, error: "token not found" };
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(schema.cliToken).where(eq(schema.cliToken.id, token));
    return { ok: false, error: "token expired" };
  }

  await db
    .update(schema.cliToken)
    .set({
      cookieValue: cookieHeader,
      userHandle: userRow.handle,
      status: "ready",
    })
    .where(eq(schema.cliToken.id, token));

  return { ok: true, userHandle: userRow.handle };
}
