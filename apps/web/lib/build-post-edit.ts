// Twitter-style time-limited edit for manual build/quote posts.
//
// A post is editable only by its owner, only while it's publicly published, and
// only for a short window after publishing — then it locks forever. The window
// is DERIVED from the publish timestamp (no stored deadline/edit-count for v1),
// and `trail_session.edited_at` records the last edit for the public indicator.

// 30 minutes after publishing. Long enough to fix typos and tighten the take,
// short enough that public posts stay trustworthy proof-of-work.
export const MANUAL_POST_EDIT_WINDOW_MS = 30 * 60 * 1000;

/** When the edit window closes for a post published at `publishedAt`. */
export function buildPostEditDeadline(publishedAt: Date): Date {
  return new Date(publishedAt.getTime() + MANUAL_POST_EDIT_WINDOW_MS);
}

/**
 * Whether a manual post published at `publishedAt` is still inside its edit
 * window. Unpublished posts (`publishedAt == null`) are never editable here.
 */
export function canEditManualPost(publishedAt: Date | null, now: Date = new Date()): boolean {
  if (!publishedAt) return false;
  return now.getTime() <= buildPostEditDeadline(publishedAt).getTime();
}

/**
 * Infer whether a manual post is a "quote" (lighter quality floor) from its
 * proof-link kinds. Quotes attach the quoted X post as their only proof; once a
 * GitHub or demo link is present we treat it as an original build post.
 */
export function detectManualPostKind(linkKinds: string[]): "build" | "quote" {
  const kinds = new Set(linkKinds.map((kind) => kind.toLowerCase()));
  const hasX = kinds.has("x") || kinds.has("twitter");
  const hasBuildProof = kinds.has("github") || kinds.has("demo");
  return hasX && !hasBuildProof ? "quote" : "build";
}
