"use server";

import { cookies, headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";

// TODO(v0.2): replace this with a proper CLI token system (cli_tokens table,
// short-lived bearer tokens scoped to upload only). For now we forward the raw
// session cookie because the user explicitly initiated `trail login` and we
// want to ship the share flow without inventing a new auth surface.
export async function getCliAuthPayload(): Promise<
  | { ok: true; cookie: string; userHandle: string }
  | { ok: false; error: string }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { ok: false, error: "not authenticated" };
  }

  const userRow = await db.query.user.findFirst({
    where: eq(schema.user.id, session.user.id),
  });
  if (!userRow?.handle) {
    return { ok: false, error: "user has no handle" };
  }

  // better-auth's default session cookie is `better-auth.session_token`.
  // On HTTPS in production, better-auth automatically prefixes it with
  // `__Secure-` per the cookie spec, so we must check both names.
  const jar = await cookies();
  const cookieEntry =
    jar.get("better-auth.session_token") ??
    jar.get("__Secure-better-auth.session_token");
  if (!cookieEntry?.value) {
    return { ok: false, error: "session cookie missing" };
  }

  // Forward under the exact name we found it (so the CLI's subsequent
  // requests use whichever name the server is actually setting).
  const cookieName = jar.get("__Secure-better-auth.session_token")
    ? "__Secure-better-auth.session_token"
    : "better-auth.session_token";
  const cookieHeader = `${cookieName}=${cookieEntry.value}`;
  return { ok: true, cookie: cookieHeader, userHandle: userRow.handle };
}
