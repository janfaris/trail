"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
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

// ──────────────────────────────────────────────────────────────────────────
// Bulk session management — drives /dashboard. Owners can flip visibility
// and outcome on many sessions at once instead of running `trail share`
// one ID at a time. All actions assert ownership server-side.
// ──────────────────────────────────────────────────────────────────────────

type Visibility = "public" | "private" | "pending";
type Outcome = "shipped" | "abandoned" | "rabbithole" | "unknown" | null;

async function ownedSessionIds(userId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: schema.trailSession.id })
    .from(schema.trailSession)
    .where(and(eq(schema.trailSession.userId, userId), inArray(schema.trailSession.id, ids)));
  return rows.map((r) => r.id);
}

export async function bulkSetVisibility(ids: string[], visibility: Visibility) {
  const u = await requireUser();
  if (!["public", "private", "pending"].includes(visibility)) {
    return { ok: false, error: "invalid visibility" };
  }
  const owned = await ownedSessionIds(u.id, ids);
  if (owned.length === 0) return { ok: true, updated: 0 };
  await db
    .update(schema.trailSession)
    .set({ visibility })
    .where(inArray(schema.trailSession.id, owned));
  const me = await db.query.user.findFirst({ where: eq(schema.user.id, u.id) });
  if (me?.handle) {
    revalidatePath(`/u/${me.handle}`);
    revalidatePath(`/u/${me.handle}/interview`);
    revalidatePath(`/dashboard`);
  }
  return { ok: true, updated: owned.length };
}

export async function bulkSetOutcome(ids: string[], outcome: Outcome) {
  const u = await requireUser();
  if (outcome !== null && !["shipped", "abandoned", "rabbithole", "unknown"].includes(outcome)) {
    return { ok: false, error: "invalid outcome" };
  }
  const owned = await ownedSessionIds(u.id, ids);
  if (owned.length === 0) return { ok: true, updated: 0 };
  await db
    .update(schema.trailSession)
    .set({ outcome })
    .where(inArray(schema.trailSession.id, owned));
  const me = await db.query.user.findFirst({ where: eq(schema.user.id, u.id) });
  if (me?.handle) {
    revalidatePath(`/u/${me.handle}/interview`);
    revalidatePath(`/dashboard`);
  }
  return { ok: true, updated: owned.length };
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
