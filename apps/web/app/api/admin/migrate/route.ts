import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Idempotent one-shot migration runner. Applies pending migrations inline
// because local DATABASE_URL is unavailable to operators. Safe to call
// repeatedly — every statement uses IF NOT EXISTS.

const STATEMENTS: { name: string; sql: string }[] = [
  {
    name: "cli_token",
    sql: `
      CREATE TABLE IF NOT EXISTS "cli_token" (
        "id" text PRIMARY KEY,
        "cookie_value" text,
        "user_handle" text,
        "status" text NOT NULL DEFAULT 'pending',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL
      )
    `,
  },
  {
    name: "user.linkedin_handle",
    sql: `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS linkedin_handle text`,
  },
  {
    name: "trail_session.languages",
    sql: `ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS languages JSONB`,
  },
  {
    name: "trail_session.duration_seconds",
    sql: `ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS duration_seconds INTEGER`,
  },
  {
    name: "trail_session.tool_call_counts",
    sql: `ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS tool_call_counts JSONB`,
  },
  {
    name: "trail_session.distinct_files",
    sql: `ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS distinct_files INTEGER`,
  },
  {
    name: "trail_session.prompt_count",
    sql: `ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS prompt_count INTEGER`,
  },
  {
    name: "trail_session.failed_tool_calls",
    sql: `ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS failed_tool_calls INTEGER`,
  },
  { name: "trail_session.recipe_tldr", sql: `ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS recipe_tldr text` },
  { name: "trail_session.recipe_outcome", sql: `ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS recipe_outcome text` },
  { name: "trail_session.recipe_key_prompt_idxs", sql: `ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS recipe_key_prompt_idxs jsonb` },
  { name: "trail_session.recipe_highlight_idxs", sql: `ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS recipe_highlight_idxs jsonb` },
  { name: "trail_session.recipe_generated_at", sql: `ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS recipe_generated_at timestamp` },
  // Phase 0 trust — visibility gate + pending-review reasons + retro-redaction timestamp.
  { name: "trail_session.visibility", sql: `ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public'` },
  { name: "trail_session.pending_review_reasons", sql: `ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS pending_review_reasons jsonb` },
  { name: "trail_session.redacted_at", sql: `ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS redacted_at timestamp` },
  { name: "trail_session_visibility_idx", sql: `CREATE INDEX IF NOT EXISTS trail_session_visibility_idx ON trail_session (visibility)` },
  // Phase 1 — taxonomy
  { name: "trail_session.tools_used", sql: `ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS tools_used jsonb` },
  { name: "trail_session.frameworks", sql: `ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS frameworks jsonb` },
  { name: "trail_session.task_type", sql: `ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS task_type text` },
  { name: "trail_session.models", sql: `ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS models jsonb` },
  { name: "trail_session.outcome", sql: `ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS outcome text` },
  { name: "trail_session_task_type_idx", sql: `CREATE INDEX IF NOT EXISTS trail_session_task_type_idx ON trail_session (task_type)` },
  { name: "trail_session_outcome_idx", sql: `CREATE INDEX IF NOT EXISTS trail_session_outcome_idx ON trail_session (outcome)` },
  // Phase 1 — reactions on sessions
  {
    name: "session_reaction",
    sql: `
      CREATE TABLE IF NOT EXISTS "session_reaction" (
        "id" text PRIMARY KEY,
        "session_id" text NOT NULL REFERENCES "trail_session"("id") ON DELETE CASCADE,
        "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "kind" text NOT NULL,
        "note" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        UNIQUE("session_id", "user_id", "kind")
      )
    `,
  },
  {
    name: "session_reaction_session_idx",
    sql: `CREATE INDEX IF NOT EXISTS session_reaction_session_idx ON session_reaction (session_id, kind)`,
  },
  // Phase 1.7 — curated playlists
  {
    name: "playlist",
    sql: `
      CREATE TABLE IF NOT EXISTS "playlist" (
        "id" text PRIMARY KEY,
        "slug" text NOT NULL UNIQUE,
        "title" text NOT NULL,
        "description" text,
        "curator_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "is_official" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `,
  },
  {
    name: "playlist_item",
    sql: `
      CREATE TABLE IF NOT EXISTS "playlist_item" (
        "id" text PRIMARY KEY,
        "playlist_id" text NOT NULL REFERENCES "playlist"("id") ON DELETE CASCADE,
        "session_id" text NOT NULL REFERENCES "trail_session"("id") ON DELETE CASCADE,
        "position" integer NOT NULL,
        "note" text,
        UNIQUE("playlist_id", "session_id")
      )
    `,
  },
  {
    name: "playlist_item_playlist_idx",
    sql: `CREATE INDEX IF NOT EXISTS playlist_item_playlist_idx ON playlist_item (playlist_id, position)`,
  },
  // Phase 2 — GitHub PR/commit linkage
  { name: "trail_session.linked_pr_url", sql: `ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS linked_pr_url text` },
  { name: "trail_session.linked_commit_sha", sql: `ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS linked_commit_sha text` },
  { name: "trail_session.linked_repo", sql: `ALTER TABLE trail_session ADD COLUMN IF NOT EXISTS linked_repo text` },
  { name: "trail_session_linked_pr_idx", sql: `CREATE INDEX IF NOT EXISTS trail_session_linked_pr_idx ON trail_session (linked_pr_url) WHERE linked_pr_url IS NOT NULL` },
];

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json(
      { error: "DATABASE_URL not set" },
      { status: 500 },
    );
  }
  const sql = neon(databaseUrl);
  const applied: string[] = [];
  for (const s of STATEMENTS) {
    await sql(s.sql);
    applied.push(s.name);
  }
  return NextResponse.json({ ok: true, applied });
}
