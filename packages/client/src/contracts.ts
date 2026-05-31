import { z } from "zod";

// Single source of truth for the upload endpoint's response contract.
// CLI consumes this directly. Web's route handler imports this to type its NextResponse.json().

export const UploadSessionResponse = z.object({
  url: z.string().url(),
  slug: z.string().min(1),
  // receiptStatus mirrors trail_session.receipt_status — one of
  // 'shipped' | 'draft' | 'unverified'. Optional because legacy/older
  // servers may not populate it (receipt generation is best-effort).
  receiptStatus: z.enum(["shipped", "draft", "unverified"]).optional(),
  // Final persisted visibility of the published session. The CLI uses this
  // to avoid over-promising "badge is live" on private/pending receipts.
  visibility: z.enum(["public", "private", "pending"]).optional(),
  // Human-readable reasons the session was held in pending review (entropy /
  // sensitive-content gates). Empty/absent when published directly.
  pendingReviewReasons: z.array(z.string()).optional(),
  // Present when the client asked to publish but the server saved the upload
  // as a private draft instead.
  publishBlockedReason: z.enum(["quota_or_state", "receipt_failed"]).optional(),
  // The uploader's public profile URL (/u/<handle>). Lets the CLI point users
  // at their Verified Builder badge after a share. Optional for older servers.
  profileUrl: z.string().url().optional(),
});
export type UploadSessionResponse = z.infer<typeof UploadSessionResponse>;

export const UploadSessionError = z.object({
  error: z.string(),
  issues: z.unknown().optional(),
});
export type UploadSessionError = z.infer<typeof UploadSessionError>;
