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
