ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "receipt_outcome" text;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "receipt_tldr" text;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "receipt_decision_summary" jsonb;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "receipt_changed_files" jsonb;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "receipt_verification" jsonb;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "receipt_validator_warnings" jsonb;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "receipt_generated_at" timestamp;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "receipt_status" text;
