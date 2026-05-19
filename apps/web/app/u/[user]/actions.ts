"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";

const MAX_FEATURED = 3;

export async function dismissIntro() {
  const jar = await cookies();
  jar.set("trail_seen_intro", "1", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}

async function requireUser() {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s?.user) throw new Error("unauthorized");
  return s.user;
}

export async function toggleFeatured(sessionId: string) {
  const u = await requireUser();
  const row = await db.query.trailSession.findFirst({
    where: and(eq(schema.trailSession.id, sessionId), eq(schema.trailSession.userId, u.id)),
  });
  if (!row) throw new Error("not found");

  if (!row.isFeatured) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.trailSession)
      .where(and(eq(schema.trailSession.userId, u.id), eq(schema.trailSession.isFeatured, true)));
    if (count >= MAX_FEATURED) {
      return { ok: false, error: `max ${MAX_FEATURED} featured sessions` };
    }
  }

  await db
    .update(schema.trailSession)
    .set({ isFeatured: !row.isFeatured })
    .where(eq(schema.trailSession.id, sessionId));

  const me = await db.query.user.findFirst({ where: eq(schema.user.id, u.id) });
  if (me?.handle) revalidatePath(`/u/${me.handle}`);
  return { ok: true };
}

export async function saveProfile(formData: FormData) {
  const u = await requireUser();
  const bio = (formData.get("bio") ?? "").toString().slice(0, 160) || null;
  const xHandle = ((formData.get("xHandle") ?? "").toString().trim().replace(/^@/, "")) || null;
  const githubHandle = ((formData.get("githubHandle") ?? "").toString().trim().replace(/^@/, "")) || null;
  let linkedinHandle = (formData.get("linkedinHandle") ?? "").toString().trim();
  linkedinHandle = linkedinHandle.replace(/^@/, "").replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, "").replace(/\/+$/, "");
  if (linkedinHandle && !/^[a-zA-Z0-9_-]{3,100}$/.test(linkedinHandle)) {
    throw new Error("LinkedIn handle must be 3-100 chars, alphanumeric + hyphens/underscores only.");
  }
  const linkedinHandleValue = linkedinHandle || null;
  let website = (formData.get("website") ?? "").toString().trim() || null;
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;

  await db
    .update(schema.user)
    .set({ bio, xHandle, githubHandle, linkedinHandle: linkedinHandleValue, website })
    .where(eq(schema.user.id, u.id));

  const me = await db.query.user.findFirst({ where: eq(schema.user.id, u.id) });
  if (me?.handle) {
    revalidatePath(`/u/${me.handle}`);
    redirect(`/u/${me.handle}`);
  }
  redirect("/");
}
