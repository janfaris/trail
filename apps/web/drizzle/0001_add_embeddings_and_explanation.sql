-- pgvector embedding for semantic search + AI explanation cache.
-- Requires: CREATE EXTENSION vector (apply via apps/web/scripts/enable-pgvector.mjs).
-- Note: text-embedding-3-large = 3072 dims. pgvector ivfflat/hnsw indexes cap
-- at 2000 dims, so no index — sequential scan is fine while N is small.
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "embedding" vector(3072);--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "ai_explanation" text;--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN IF NOT EXISTS "ai_explanation_generated_at" timestamp;
