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
  // It's httpOnly, but server actions can read it via next/headers cookies().
  const jar = await cookies();
  const cookieEntry = jar.get("better-auth.session_token");
  if (!cookieEntry?.value) {
    return { ok: false, error: "session cookie missing" };
  }

  const cookieHeader = `better-auth.session_token=${cookieEntry.value}`;
  return { ok: true, cookie: cookieHeader, userHandle: userRow.handle };
}
