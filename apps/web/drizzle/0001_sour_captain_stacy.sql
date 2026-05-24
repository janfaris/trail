CREATE TABLE IF NOT EXISTS "cli_token" (
	"id" text PRIMARY KEY NOT NULL,
	"cookie_value" text,
	"user_handle" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discover_feed" (
	"slug" text PRIMARY KEY NOT NULL,
	"rank" integer NOT NULL,
	"score" numeric(10, 4) NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "playlist" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"curator_id" text NOT NULL,
	"is_official" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playlist_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "playlist_item" (
	"id" text PRIMARY KEY NOT NULL,
	"playlist_id" text NOT NULL,
	"session_id" text NOT NULL,
	"position" integer NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_reaction" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "is_featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "shared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "ai_explanation" text;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "ai_explanation_generated_at" timestamp;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "recipe_tldr" text;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "recipe_outcome" text;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "recipe_key_prompt_idxs" jsonb;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "recipe_highlight_idxs" jsonb;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "recipe_generated_at" timestamp;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "languages" jsonb;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "tool_call_counts" jsonb;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "distinct_files" integer;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "prompt_count" integer;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "failed_tool_calls" integer;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "visibility" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "pending_review_reasons" jsonb;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "redacted_at" timestamp;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "tools_used" jsonb;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "frameworks" jsonb;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "task_type" text;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "models" jsonb;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "outcome" text;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "linked_pr_url" text;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "linked_commit_sha" text;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "linked_repo" text;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "receipt_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "receipt_verified_sha" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "bio" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "x_handle" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "github_handle" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "linkedin_handle" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "website" text;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "discover_feed" ADD CONSTRAINT "discover_feed_slug_trail_session_slug_fk" FOREIGN KEY ("slug") REFERENCES "public"."trail_session"("slug") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "playlist" ADD CONSTRAINT "playlist_curator_id_user_id_fk" FOREIGN KEY ("curator_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "playlist_item" ADD CONSTRAINT "playlist_item_playlist_id_playlist_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlist"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "playlist_item" ADD CONSTRAINT "playlist_item_session_id_trail_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."trail_session"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "session_reaction" ADD CONSTRAINT "session_reaction_session_id_trail_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."trail_session"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "session_reaction" ADD CONSTRAINT "session_reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discover_feed_rank_idx" ON "discover_feed" USING btree ("rank");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "playlist_item_playlist_idx" ON "playlist_item" USING btree ("playlist_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_reaction_session_idx" ON "session_reaction" USING btree ("session_id","kind");
