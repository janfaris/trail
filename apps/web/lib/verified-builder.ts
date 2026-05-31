// Verified Builder — the 90-day proof-of-work credential.
//
// A "Verified Builder" has shipped real work that GitHub independently
// confirmed. The badge is a PUBLIC credential: it must read identically for
// every viewer (anon, stranger, owner-self), so eligibility is computed ONLY
// from public sessions. Private work — even if shipped + committed — never
// contributes to a publicly visible claim.
//
// A session counts as "verified-shipped" ONLY when the receipt verifier
// confirmed the linked commit: receiptStatus==='shipped' AND receiptVerifiedAt
// is set. That verification (see lib/github-verify.ts) requires the commit to
// be merged to a PUBLIC default branch AND bound to the owner's GitHub identity
// — so the badge can't be forged by linking someone else's commit or an
// unverifiable private repo.
//
// NOTE: a bare LLM/heuristic `outcome === 'shipped'` plus a linkedCommitSha is
// deliberately NOT sufficient: `outcome` is model-extracted (or a >=20-events
// heuristic) and a SHA can point at any public commit, so that pair is
// forgeable. `outcome`/`linkedCommitSha` remain on the interface only so
// callers can pass full session rows; they are intentionally ignored here.

export interface VerifiableSession {
  visibility: string;
  sharedAt: Date | string | null;
  receiptStatus: string | null;
  receiptVerifiedAt: Date | string | null;
  /** Ignored — see module note. Optional so callers can pass full rows. */
  outcome?: string | null;
  /** Ignored — see module note. Optional so callers can pass full rows. */
  linkedCommitSha?: string | null;
}

export interface VerifiedBuilderStatus {
  verified: boolean;
  /** Count of public verified-shipped sessions backing the credential. */
  verifiedShippedCount: number;
  /** Minimum verified-shipped sessions required for the badge. */
  threshold: number;
}

/** Default: a single verified-shipped session earns the badge. */
export const VERIFIED_BUILDER_THRESHOLD = 1;

/**
 * True when a single explicitly shared public session qualifies as verified-
 * shipped. Non-public or unshared sessions never qualify, keeping the badge a
 * strictly public claim. The only path is GitHub-confirmed verification
 * (receiptStatus 'shipped' + receiptVerifiedAt set).
 */
export function isVerifiedShippedSession(s: VerifiableSession): boolean {
  if (s.visibility !== "public") return false;
  if (s.sharedAt == null) return false;
  return s.receiptStatus === "shipped" && s.receiptVerifiedAt != null;
}

/**
 * Compute Verified Builder eligibility from a user's sessions. Pass every
 * session the page loaded (public + private on self-view is fine — the helper
 * filters to public internally so the result is viewer-independent).
 */
export function computeVerifiedBuilder(
  sessions: readonly VerifiableSession[],
  threshold: number = VERIFIED_BUILDER_THRESHOLD,
): VerifiedBuilderStatus {
  const verifiedShippedCount = sessions.reduce(
    (n, s) => (isVerifiedShippedSession(s) ? n + 1 : n),
    0,
  );
  return {
    verified: verifiedShippedCount >= threshold,
    verifiedShippedCount,
    threshold,
  };
}
