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
ALTER TABLE "user" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "x_handle" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "github_handle" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "linkedin_handle" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "discover_feed" ADD CONSTRAINT "discover_feed_slug_trail_session_slug_fk" FOREIGN KEY ("slug") REFERENCES "public"."trail_session"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discover_feed_rank_idx" ON "discover_feed" USING btree ("rank");