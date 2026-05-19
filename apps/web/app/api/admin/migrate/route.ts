import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TEMPORARY one-shot migration runner. Applies the 0004_cli_token migration
// inline because local DATABASE_URL is unavailable to operators. Delete this
// file in a follow-up cleanup commit after the migration has been applied.

const MIGRATION_SQL = `
  CREATE TABLE IF NOT EXISTS "cli_token" (
    "id" text PRIMARY KEY,
    "cookie_value" text,
    "user_handle" text,
    "status" text NOT NULL DEFAULT 'pending',
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "expires_at" timestamptz NOT NULL
  )
`;

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
  await sql(MIGRATION_SQL);
  return NextResponse.json({ ok: true, applied: "cli_token" });
}
