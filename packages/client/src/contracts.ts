import { z } from "zod";

// Single source of truth for the upload endpoint's response contract.
// CLI consumes this directly. Web's route handler imports this to type its NextResponse.json().

export const UploadSessionResponse = z.object({
  url: z.string().url(),
  slug: z.string().min(1),
});
export type UploadSessionResponse = z.infer<typeof UploadSessionResponse>;

export const UploadSessionError = z.object({
  error: z.string(),
  issues: z.unknown().optional(),
});
export type UploadSessionError = z.infer<typeof UploadSessionError>;
