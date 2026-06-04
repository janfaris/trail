"use server";

import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";
import { canFollow, toggleDecision } from "@/lib/follow";
import { promoteSessionToPublicReceipt } from "@/lib/public-receipt-publishing";
import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

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
  if (row.visibility === "redacted" || row.redactedAt !== null) {
    return { ok: false, error: "redacted sessions cannot be featured" };
  }

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

export async function setSavedReceipt(sessionId: string, saved: boolean) {
  const u = await requireUser();

  if (!saved) {
    await db
      .delete(schema.savedReceipt)
      .where(
        and(eq(schema.savedReceipt.userId, u.id), eq(schema.savedReceipt.sessionId, sessionId)),
      );
    revalidatePath("/saved");
    revalidatePath("/feed");
    revalidatePath("/discover");
    return { ok: true, saved: false };
  }

  const rows = await db
    .select({
      id: schema.trailSession.id,
      slug: schema.trailSession.slug,
      authorHandle: schema.user.handle,
    })
    .from(schema.trailSession)
    .innerJoin(schema.user, eq(schema.trailSession.userId, schema.user.id))
    .where(
      and(
        eq(schema.trailSession.id, sessionId),
        eq(schema.trailSession.visibility, "public"),
        isNotNull(schema.trailSession.sharedAt),
        isNull(schema.trailSession.redactedAt),
        isNotNull(schema.user.handle),
      ),
    )
    .limit(1);

  const receipt = rows[0];
  if (!receipt) {
    return { ok: false, saved: false, error: "receipt is not public" };
  }

  await db
    .insert(schema.savedReceipt)
    .values({ id: crypto.randomUUID(), userId: u.id, sessionId })
    .onConflictDoNothing({
      target: [schema.savedReceipt.userId, schema.savedReceipt.sessionId],
    });

  revalidatePath("/saved");
  revalidatePath("/feed");
  revalidatePath("/discover");
  revalidatePath(`/u/${receipt.authorHandle}/${receipt.slug}`);
  return { ok: true, saved: true };
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

async function ownedMutableSessionIds(userId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: schema.trailSession.id })
    .from(schema.trailSession)
    .where(
      and(
        eq(schema.trailSession.userId, userId),
        inArray(schema.trailSession.id, ids),
        ne(schema.trailSession.visibility, "redacted"),
        isNull(schema.trailSession.redactedAt),
      ),
    );
  return rows.map((r) => r.id);
}

export async function bulkSetVisibility(ids: string[], visibility: Visibility) {
  const u = await requireUser();
  if (!["public", "private", "pending"].includes(visibility)) {
    return { ok: false, error: "invalid visibility" };
  }
  const owned = await ownedMutableSessionIds(u.id, ids);
  if (owned.length === 0) return { ok: true, updated: 0 };

  if (visibility === "public") {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) return { ok: false, error: "database unavailable" };

    const currentRows = await db
      .select({
        id: schema.trailSession.id,
        visibility: schema.trailSession.visibility,
        sharedAt: schema.trailSession.sharedAt,
      })
      .from(schema.trailSession)
      .where(inArray(schema.trailSession.id, owned));
    let updated = currentRows.filter(
      (row) => row.visibility === "public" && row.sharedAt != null,
    ).length;
    for (const row of currentRows) {
      if (row.visibility === "public" && row.sharedAt != null) continue;
      const result = await promoteSessionToPublicReceipt({
        databaseUrl,
        userId: u.id,
        sessionId: row.id,
      });
      if (result.published) updated += 1;
    }

    const me = await db.query.user.findFirst({ where: eq(schema.user.id, u.id) });
    if (me?.handle) {
      revalidatePath(`/u/${me.handle}`);
      revalidatePath(`/u/${me.handle}/interview`);
      revalidatePath("/dashboard");
      revalidatePath("/feed");
    }

    if (updated < currentRows.length) {
      return {
        ok: true,
        updated,
        error:
          "Some selected sessions could not be published because they need a generated receipt, review, or quota.",
      };
    }
    return { ok: true, updated };
  }

  await db
    .update(schema.trailSession)
    .set({ visibility })
    .where(inArray(schema.trailSession.id, owned));
  const me = await db.query.user.findFirst({ where: eq(schema.user.id, u.id) });
  if (me?.handle) {
    revalidatePath(`/u/${me.handle}`);
    revalidatePath(`/u/${me.handle}/interview`);
    revalidatePath("/dashboard");
    revalidatePath("/feed");
  }
  return { ok: true, updated: owned.length };
}

export async function bulkSetOutcome(ids: string[], outcome: Outcome) {
  const u = await requireUser();
  if (outcome !== null && !["shipped", "abandoned", "rabbithole", "unknown"].includes(outcome)) {
    return { ok: false, error: "invalid outcome" };
  }
  const owned = await ownedMutableSessionIds(u.id, ids);
  if (owned.length === 0) return { ok: true, updated: 0 };
  await db
    .update(schema.trailSession)
    .set({ outcome })
    .where(inArray(schema.trailSession.id, owned));
  const me = await db.query.user.findFirst({ where: eq(schema.user.id, u.id) });
  if (me?.handle) {
    revalidatePath(`/u/${me.handle}/interview`);
    revalidatePath("/dashboard");
  }
  return { ok: true, updated: owned.length };
}

export async function bulkDeleteSessions(ids: string[]) {
  const u = await requireUser();
  const owned = await ownedSessionIds(u.id, ids);
  if (owned.length === 0) return { ok: true, deleted: 0 };
  // Drizzle schema declares ON DELETE CASCADE for event/reaction/etc. → the
  // session delete sweeps children. We assert ownership above so a malicious
  // caller can't nuke another user's rows via inArray.
  await db.delete(schema.trailSession).where(inArray(schema.trailSession.id, owned));
  const me = await db.query.user.findFirst({ where: eq(schema.user.id, u.id) });
  if (me?.handle) {
    revalidatePath(`/u/${me.handle}`);
    revalidatePath(`/u/${me.handle}/interview`);
    revalidatePath("/dashboard");
  }
  return { ok: true, deleted: owned.length };
}

export async function deleteOwnPost(
  sessionId: string,
): Promise<{ ok: true; handle: string | null } | { ok: false; error: string }> {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return { ok: false, error: "Sign in to delete this post." };
  }

  const owned = await ownedSessionIds(user.id, [sessionId]);
  if (owned.length === 0) {
    return { ok: false, error: "You can only delete your own posts." };
  }

  // ON DELETE CASCADE on child tables (events, reactions, comments, links,
  // tags, …) sweeps related rows. Ownership is asserted above.
  await db.delete(schema.trailSession).where(inArray(schema.trailSession.id, owned));

  const me = await db.query.user.findFirst({ where: eq(schema.user.id, user.id) });
  if (me?.handle) {
    revalidatePath(`/u/${me.handle}`);
    revalidatePath(`/u/${me.handle}/interview`);
    revalidatePath("/dashboard");
    revalidatePath("/feed");
  }
  return { ok: true, handle: me?.handle ?? null };
}

export async function saveProfile(formData: FormData) {
  const u = await requireUser();
  const bio = (formData.get("bio") ?? "").toString().trim().slice(0, 160) || null;
  const location = (formData.get("location") ?? "").toString().trim().slice(0, 80) || null;
  const currentlyBuilding =
    (formData.get("currentlyBuilding") ?? "").toString().trim().slice(0, 140) || null;
  const xHandle = (formData.get("xHandle") ?? "").toString().trim().replace(/^@/, "") || null;
  const githubHandle =
    (formData.get("githubHandle") ?? "").toString().trim().replace(/^@/, "") || null;
  let linkedinHandle = (formData.get("linkedinHandle") ?? "").toString().trim();
  linkedinHandle = linkedinHandle
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, "")
    .replace(/\/+$/, "");
  if (linkedinHandle && !/^[a-zA-Z0-9_-]{3,100}$/.test(linkedinHandle)) {
    throw new Error(
      "LinkedIn handle must be 3-100 chars, alphanumeric + hyphens/underscores only.",
    );
  }
  const linkedinHandleValue = linkedinHandle || null;
  let website = (formData.get("website") ?? "").toString().trim() || null;
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  // Checkboxes only submit when checked — absence in formData = unchecked.
  const spendAuditOptIn = formData.get("spendAuditOptIn") === "on";

  await db
    .update(schema.user)
    .set({
      bio,
      location,
      currentlyBuilding,
      xHandle,
      githubHandle,
      linkedinHandle: linkedinHandleValue,
      website,
      spendAuditOptIn,
    })
    .where(eq(schema.user.id, u.id));

  const me = await db.query.user.findFirst({ where: eq(schema.user.id, u.id) });
  if (me?.handle) {
    revalidatePath(`/u/${me.handle}`);
    redirect(`/u/${me.handle}`);
  }
  redirect("/");
}

// ──────────────────────────────────────────────────────────────────────────
// Social graph — follow/unfollow another user. Idempotent: a unique index on
// (followerId, followingId) plus onConflictDoNothing means double-clicks and
// races never throw. Returns a structured result so the client can refresh
// without surfacing noisy errors for expected cases (self-follow, anon, etc.).
// ──────────────────────────────────────────────────────────────────────────
export async function toggleFollow(followingId: string) {
  let me: Awaited<ReturnType<typeof requireUser>>;
  try {
    me = await requireUser();
  } catch {
    // Expired/anon session: return a structured result instead of throwing so
    // the client can revert cleanly without hitting an error boundary.
    return { ok: false as const, error: "unauthorized" };
  }
  if (!canFollow(me.id, followingId)) {
    return { ok: false as const, error: "cannot follow this user" };
  }

  const target = await db.query.user.findFirst({
    where: eq(schema.user.id, followingId),
  });
  if (!target) return { ok: false as const, error: "user not found" };
  // Public profiles are handle-based, so disallow following handle-less users —
  // they'd produce broken /u/<handle> links in the feed.
  if (!target.handle) return { ok: false as const, error: "user not followable" };

  const existing = await db.query.follow.findFirst({
    where: and(eq(schema.follow.followerId, me.id), eq(schema.follow.followingId, followingId)),
  });

  const decision = toggleDecision(Boolean(existing));
  if (decision === "removed") {
    await db
      .delete(schema.follow)
      .where(and(eq(schema.follow.followerId, me.id), eq(schema.follow.followingId, followingId)));
  } else {
    await db
      .insert(schema.follow)
      .values({
        id: crypto.randomUUID(),
        followerId: me.id,
        followingId,
      })
      .onConflictDoNothing({
        target: [schema.follow.followerId, schema.follow.followingId],
      });
    await db
      .insert(schema.notification)
      .values({
        id: crypto.randomUUID(),
        userId: followingId,
        actorId: me.id,
        type: "follow",
      })
      .onConflictDoNothing();
  }

  if (target.handle) revalidatePath(`/u/${target.handle}`);
  const meRow = await db.query.user.findFirst({
    where: eq(schema.user.id, me.id),
  });
  if (meRow?.handle) revalidatePath(`/u/${meRow.handle}`);
  revalidatePath("/feed");

  return { ok: true as const, following: decision === "added" };
}
