-- Trending discovery feed, materialized by a daily Vercel Cron job.
-- Adds shared_at to trail_session (backfilled from created_at — all existing
-- DB rows are by definition shared, since the CLI only uploads on `trail share`).
-- Future "unshare" can NULL shared_at to drop a session from the feed.
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "shared_at" timestamptz;--> statement-breakpoint
UPDATE "trail_session" SET "shared_at" = "created_at" WHERE "shared_at" IS NULL;--> statement-breakpoint

-- trail_session.slug is unique per-user today; tighten it globally so it can
-- be the FK target for discover_feed.slug.
CREATE UNIQUE INDEX IF NOT EXISTS "trail_session_slug_unique" ON "trail_session" ("slug");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "discover_feed" (
  "slug" text PRIMARY KEY REFERENCES "trail_session"("slug") ON DELETE CASCADE,
  "rank" integer NOT NULL,
  "score" numeric(10,4) NOT NULL,
  "refreshed_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discover_feed_rank_idx" ON "discover_feed" ("rank" ASC);
