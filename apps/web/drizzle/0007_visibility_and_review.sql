-- Phase 0 trust: visibility + pending review + retroactive redaction
-- Default 'public' preserves current behavior for existing rows.

ALTER TABLE "trail_session"
  ADD COLUMN IF NOT EXISTS "visibility" text NOT NULL DEFAULT 'public';

ALTER TABLE "trail_session"
  ADD COLUMN IF NOT EXISTS "pending_review_reasons" jsonb;

ALTER TABLE "trail_session"
  ADD COLUMN IF NOT EXISTS "redacted_at" timestamp;

-- Useful for /discover and /u/[user] to exclude hidden rows cheaply.
CREATE INDEX IF NOT EXISTS "trail_session_visibility_idx"
  ON "trail_session" ("visibility");
