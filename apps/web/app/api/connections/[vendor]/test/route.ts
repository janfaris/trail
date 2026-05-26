export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { decryptVendorKey } from "@/lib/crypto/vendor-keys";
import {
  fetchAnthropicOrgUsage,
  AnthropicUsageError,
  fetchOpenAIOrgUsage,
  OpenAIUsageError,
  fetchCopilotMetrics,
  CopilotMetricsError,
} from "@trail/parsers";

// POST /api/connections/:vendor/test — round-trip the stored credential
// against the vendor's API and update sync_status / sync_error_message based
// on the outcome. Always returns 200 (the failure cases are part of normal
// product flow, not server errors); the JSON body carries { ok, error?, ... }.
//
// IMPORTANT (preserves bd13bac): on success this route MUST NOT advance
// `lastSyncedAt`. The sync worker uses that timestamp as its fetch cursor
// (default backfill = watermark ?? lookback). Touching it on Test would kill
// the initial backfill window. Only the worker itself bumps lastSyncedAt.

const VENDORS = ["anthropic", "openai", "cursor", "copilot"] as const;
type Vendor = (typeof VENDORS)[number];

function isVendor(v: string): v is Vendor {
  return (VENDORS as readonly string[]).includes(v);
}

type TestFailure = {
  ok: false;
  error: "invalid_api_key" | "rate_limited" | "unknown_error" | "org_required";
  syncStatus: "auth_error" | "rate_limited";
  message?: string;
};
type TestSuccess = { ok: true; rows?: number; note?: string };
type TestOutcome = TestSuccess | TestFailure;

// Map a vendor HTTP status to our canonical { syncStatus, error } shape. 404
// for vendors that key off an org slug (Copilot) is treated as auth_error so
// the cron doesn't loop forever — bad-org config is operator action, not a
// transient retry.
function classifyHttpStatus(
  status: number,
  treat404AsAuthError: boolean,
): TestFailure {
  if (status === 401 || status === 403) {
    return { ok: false, error: "invalid_api_key", syncStatus: "auth_error" };
  }
  if (status === 429) {
    return { ok: false, error: "rate_limited", syncStatus: "rate_limited" };
  }
  if (status === 404 && treat404AsAuthError) {
    return { ok: false, error: "invalid_api_key", syncStatus: "auth_error" };
  }
  return { ok: false, error: "unknown_error", syncStatus: "auth_error" };
}

async function testAnthropic(plaintextKey: string): Promise<TestOutcome> {
  const startingAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
  try {
    const rows = await fetchAnthropicOrgUsage({
      apiKey: plaintextKey,
      startingAt,
    });
    return { ok: true, rows: rows.length };
  } catch (err) {
    if (err instanceof AnthropicUsageError) {
      return classifyHttpStatus(err.status, false);
    }
    return { ok: false, error: "unknown_error", syncStatus: "auth_error" };
  }
}

async function testOpenAI(plaintextKey: string): Promise<TestOutcome> {
  const startingAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
  try {
    const rows = await fetchOpenAIOrgUsage({
      apiKey: plaintextKey,
      startingAt,
      endingAt: new Date(),
      bucketWidth: "1d",
    });
    return { ok: true, rows: rows.length };
  } catch (err) {
    if (err instanceof OpenAIUsageError) {
      return classifyHttpStatus(err.status, false);
    }
    return { ok: false, error: "unknown_error", syncStatus: "auth_error" };
  }
}

async function testCopilot(
  plaintextKey: string,
  workspaceId: string | null,
): Promise<TestOutcome> {
  // GitHub Copilot Metrics is an org-scoped endpoint. Without an org slug
  // we can't even build the URL — surface a deterministic config error so
  // the UI can prompt the operator to add a workspace.
  const org = workspaceId?.trim() ?? "";
  if (!org) {
    return {
      ok: false,
      error: "org_required",
      syncStatus: "auth_error",
      message: "GitHub Copilot Metrics requires an org slug in workspaceId.",
    };
  }
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  try {
    const rows = await fetchCopilotMetrics({
      token: plaintextKey,
      org,
      since,
      until: new Date(),
    });
    return { ok: true, rows: rows.length };
  } catch (err) {
    if (err instanceof CopilotMetricsError) {
      // Treat 404 as auth_error (bad org slug or no access) — see worker
      // notes for the same rationale.
      return classifyHttpStatus(err.status, true);
    }
    return { ok: false, error: "unknown_error", syncStatus: "auth_error" };
  }
}

async function testCursor(plaintextKey: string): Promise<TestOutcome> {
  // Cursor has no remote API we can validate a personal key against; the
  // CLI/menubar uploader does the actual sync. All we can verify here is
  // that the ciphertext round-trips — decryption already happened by the
  // time we get here, so reaching this function means storage is healthy.
  if (!plaintextKey || plaintextKey.length < 1) {
    return { ok: false, error: "unknown_error", syncStatus: "auth_error" };
  }
  return {
    ok: true,
    note: "cursor sync happens via local CLI; no remote API to validate",
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ vendor: string }> },
) {
  const { vendor: rawVendor } = await params;

  const sess = await auth.api.getSession({ headers: req.headers });
  if (!sess?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isVendor(rawVendor)) {
    return NextResponse.json(
      { error: "unsupported vendor", supported: VENDORS },
      { status: 400 },
    );
  }
  const vendor: Vendor = rawVendor;

  const rows = await db
    .select({
      id: schema.vendorConnection.id,
      apiKeyEnc: schema.vendorConnection.apiKeyEnc,
      workspaceId: schema.vendorConnection.workspaceId,
    })
    .from(schema.vendorConnection)
    .where(
      and(
        eq(schema.vendorConnection.userId, sess.user.id),
        eq(schema.vendorConnection.vendor, vendor),
      ),
    )
    .limit(1);

  const conn = rows[0];
  if (!conn) {
    return NextResponse.json({ error: "connection not found" }, { status: 404 });
  }

  // Decrypt once. Failure here is a corrupted-ciphertext / rotated-key
  // problem, not a vendor-side issue — still respond 200 with a stable
  // error code (route contract: never 500 from /test).
  let plaintextKey: string;
  try {
    plaintextKey = await decryptVendorKey(conn.apiKeyEnc);
  } catch {
    await db
      .update(schema.vendorConnection)
      .set({
        syncStatus: "error",
        syncErrorMessage: "decrypt_failed",
        updatedAt: new Date(),
      })
      .where(eq(schema.vendorConnection.id, conn.id));
    return NextResponse.json({ ok: false, error: "decrypt_failed" });
  }

  let outcome: TestOutcome;
  switch (vendor) {
    case "anthropic":
      outcome = await testAnthropic(plaintextKey);
      break;
    case "openai":
      outcome = await testOpenAI(plaintextKey);
      break;
    case "copilot":
      outcome = await testCopilot(plaintextKey, conn.workspaceId);
      break;
    case "cursor":
      outcome = await testCursor(plaintextKey);
      break;
  }

  if (outcome.ok) {
    // NOTE: do NOT advance the sync watermark here. The sync worker uses
    // that timestamp as its fetch cursor (default backfill = watermark ??
    // lookback days). Touching it on Test would kill the initial backfill.
    await db
      .update(schema.vendorConnection)
      .set({
        syncStatus: "ok",
        syncErrorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.vendorConnection.id, conn.id));
    const body: Record<string, unknown> = { ok: true };
    if (typeof outcome.rows === "number") body.rows = outcome.rows;
    if (outcome.note) body.note = outcome.note;
    return NextResponse.json(body);
  }

  await db
    .update(schema.vendorConnection)
    .set({
      syncStatus: outcome.syncStatus,
      syncErrorMessage: outcome.error,
      updatedAt: new Date(),
    })
    .where(eq(schema.vendorConnection.id, conn.id));

  const body: Record<string, unknown> = { ok: false, error: outcome.error };
  if (outcome.message) body.message = outcome.message;
  return NextResponse.json(body);
}
