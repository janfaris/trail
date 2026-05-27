// POST /api/spend/audit
//
// Pro-only. Body: { windowDays: 7 | 30 | 365 }. Gates:
//   1. authed
//   2. user.plan === 'pro'
//   3. user.spendAuditOptIn === true (consent for prompt text -> LLM)
//   4. monthly cap: < 10 audits in trailing 30 days
// Then calls runSpendAudit which itself enforces the daily cache + 1/day
// rate via the unique (user, window, bucket) constraint.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";
import {
  getMonthlyAuditCount,
  runSpendAudit,
  SpendAuditError,
  type AuditResult,
} from "@/lib/spend/audit";

const BodySchema = z.object({
  windowDays: z.union([z.literal(7), z.literal(30), z.literal(365)]),
});

const MONTHLY_CAP = 10;

function errStatus(code: SpendAuditError["code"]): number {
  switch (code) {
    case "no_data":
      return 422;
    case "no_llm_configured":
      return 503;
    case "invalid_llm_response":
      return 502;
    case "anonymize_failed":
      return 422;
    case "monthly_cap_exceeded":
      return 429;
  }
}

export async function POST(req: NextRequest) {
  let sess: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    sess = await auth.api.getSession({ headers: await headers() });
  } catch {
    sess = null;
  }
  if (!sess?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { windowDays } = parsed.data;

  const userRow = await db.query.user.findFirst({
    where: eq(schema.user.id, sess.user.id),
    columns: { id: true, plan: true, spendAuditOptIn: true },
  });
  if (!userRow) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (userRow.plan !== "pro") {
    return NextResponse.json({ error: "pro_required" }, { status: 403 });
  }
  if (userRow.spendAuditOptIn !== true) {
    return NextResponse.json({ error: "opt_in_required" }, { status: 412 });
  }

  const monthly = await getMonthlyAuditCount(userRow.id);
  if (monthly >= MONTHLY_CAP) {
    return NextResponse.json(
      { error: "monthly_cap_exceeded", limit: MONTHLY_CAP },
      { status: 429 },
    );
  }

  let result: AuditResult;
  try {
    result = await runSpendAudit(userRow.id, windowDays);
  } catch (err) {
    if (err instanceof SpendAuditError) {
      return NextResponse.json(
        { error: err.code, details: err.details },
        { status: errStatus(err.code) },
      );
    }
    console.error("[spend-audit] unexpected error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, result });
}
