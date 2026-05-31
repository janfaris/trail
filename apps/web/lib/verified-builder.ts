// Verified Builder — the 90-day proof-of-work credential.
//
// A "Verified Builder" has shipped real work that is backed by a commit
// receipt. The badge is a PUBLIC credential: it must read identically for
// every viewer (anon, stranger, owner-self), so eligibility is computed
// ONLY from public sessions. Private work — even if shipped + committed —
// never contributes to a publicly visible claim.
//
// A session counts as "verified-shipped" when either:
//   1. (future ideal) the receipt cron confirmed the linked commit is
//      reachable from the default branch: receiptStatus==='shipped' AND
//      receiptVerifiedAt is set; or
//   2. (populated proxy) the session outcome is 'shipped' AND a real commit
//      SHA is attached (linkedCommitSha).
// Rule (1) auto-upgrades the badge once receipt verification is live; rule
// (2) grounds it in today's data, where a real commit is the strongest
// populated proof.

export interface VerifiableSession {
  visibility: string;
  outcome: string | null;
  linkedCommitSha: string | null;
  receiptStatus: string | null;
  receiptVerifiedAt: Date | string | null;
}

export interface VerifiedBuilderStatus {
  verified: boolean;
  /** Count of public verified-shipped sessions backing the credential. */
  verifiedShippedCount: number;
  /** Minimum verified-shipped sessions required for the badge. */
  threshold: number;
}

/** Default: a single commit-backed shipped session earns the badge. */
export const VERIFIED_BUILDER_THRESHOLD = 1;

function hasCommitReceipt(sha: string | null): boolean {
  return typeof sha === "string" && sha.trim() !== "";
}

/**
 * True when a single public session qualifies as verified-shipped. Non-public
 * sessions never qualify, keeping the badge a strictly public claim.
 */
export function isVerifiedShippedSession(s: VerifiableSession): boolean {
  if (s.visibility !== "public") return false;
  // Rule 1 — receipt cron verified the commit on the default branch.
  if (s.receiptStatus === "shipped" && s.receiptVerifiedAt != null) return true;
  // Rule 2 — LLM-extracted shipped outcome backed by a real commit SHA.
  if (s.outcome === "shipped" && hasCommitReceipt(s.linkedCommitSha)) return true;
  return false;
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
