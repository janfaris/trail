ALTER TABLE "trail_session" DROP COLUMN IF EXISTS "embedding";
--> statement-breakpoint
ALTER TABLE "trail_session" ADD COLUMN "embedding" vector(1536);
--> statement-breakpoint
CREATE INDEX "trail_session_embedding_idx" ON "trail_session" USING hnsw ("embedding" vector_cosine_ops);
