CREATE TABLE "cli_token" (
	"id" text PRIMARY KEY NOT NULL,
	"cookie_value" text,
	"user_handle" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discover_feed" (
	"slug" text PRIMARY KEY NOT NULL,
	"rank" integer NOT NULL,
	"score" numeric(10, 4) NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlist" (
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
CREATE TABLE "playlist_item" (
	"id" text PRIMARY KEY NOT NULL,
	"playlist_id" text NOT NULL,
	"session_id" text NOT NULL,
	"position" integer NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "session_reaction" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "is_featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "shared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "ai_explanation" text;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "ai_explanation_generated_at" timestamp;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "recipe_tldr" text;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "recipe_outcome" text;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "recipe_key_prompt_idxs" jsonb;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "recipe_highlight_idxs" jsonb;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "recipe_generated_at" timestamp;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "languages" jsonb;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "tool_call_counts" jsonb;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "distinct_files" integer;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "prompt_count" integer;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "failed_tool_calls" integer;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "visibility" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "pending_review_reasons" jsonb;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "redacted_at" timestamp;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "tools_used" jsonb;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "frameworks" jsonb;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "task_type" text;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "models" jsonb;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "linked_pr_url" text;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "linked_commit_sha" text;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "linked_repo" text;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "receipt_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "receipt_verified_sha" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "x_handle" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "github_handle" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "linkedin_handle" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "discover_feed" ADD CONSTRAINT "discover_feed_slug_trail_session_slug_fk" FOREIGN KEY ("slug") REFERENCES "public"."trail_session"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist" ADD CONSTRAINT "playlist_curator_id_user_id_fk" FOREIGN KEY ("curator_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_item" ADD CONSTRAINT "playlist_item_playlist_id_playlist_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_item" ADD CONSTRAINT "playlist_item_session_id_trail_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."trail_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_reaction" ADD CONSTRAINT "session_reaction_session_id_trail_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."trail_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_reaction" ADD CONSTRAINT "session_reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discover_feed_rank_idx" ON "discover_feed" USING btree ("rank");--> statement-breakpoint
CREATE INDEX "playlist_item_playlist_idx" ON "playlist_item" USING btree ("playlist_id","position");--> statement-breakpoint
CREATE INDEX "session_reaction_session_idx" ON "session_reaction" USING btree ("session_id","kind");