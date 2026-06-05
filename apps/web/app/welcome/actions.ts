"use server";

import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";
import { normalizeHandle, validateHandle } from "@/lib/handle";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

export type OnboardingResult = { ok: true; handle: string } | { ok: false; error: string };

/**
 * Finalize a builder's first-run: claim a public handle and mark onboarding
 * complete. Existing handles are grandfathered — if the submitted value matches
 * the current handle (ignoring case/format drift), we only stamp onboardedAt and
 * never mutate the public /u/<handle> URL.
 */
export async function completeOnboarding(formData: FormData): Promise<OnboardingResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return { ok: false, error: "Sign in to finish setting up your profile." };
  }
  const userId = session.user.id;

  const me = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { id: true, handle: true, onboardedAt: true },
  });
  if (!me) return { ok: false, error: "Your Trail profile could not be found." };

  const rawHandle = (formData.get("handle") ?? "").toString();

  // Grandfather: keep the existing handle if the user submitted the same one
  // (or left it unchanged). Just mark onboarding complete.
  if (me.handle && normalizeHandle(rawHandle) === normalizeHandle(me.handle)) {
    if (!me.onboardedAt) {
      await db
        .update(schema.user)
        .set({ onboardedAt: new Date() })
        .where(eq(schema.user.id, userId));
    }
    revalidatePath(`/u/${me.handle}`);
    return { ok: true, handle: me.handle };
  }

  const validated = validateHandle(rawHandle);
  if (!validated.ok) return { ok: false, error: validated.error };
  const handle = validated.handle;

  // Case-insensitive uniqueness check excluding self.
  const taken = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(and(sql`lower(${schema.user.handle}) = ${handle}`, ne(schema.user.id, userId)))
    .limit(1);
  if (taken.length > 0) {
    return { ok: false, error: "That handle is already taken. Pick another." };
  }

  try {
    await db
      .update(schema.user)
      .set({ handle, onboardedAt: new Date() })
      .where(eq(schema.user.id, userId));
  } catch {
    // Unique-index backstop: two users claiming the same handle concurrently.
    return { ok: false, error: "That handle was just taken. Pick another." };
  }

  revalidatePath("/feed");
  revalidatePath(`/u/${handle}`);
  return { ok: true, handle };
}
