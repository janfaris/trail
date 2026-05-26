export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { decryptVendorKey } from "@/lib/crypto/vendor-keys";
import { fetchAnthropicOrgUsage, AnthropicUsageError } from "@trail/parsers";

// POST /api/connections/:vendor/test — round-trip the stored credential
// against the vendor's API and update sync_status / sync_error_message based
// on the outcome. Always returns 200 (the failure cases are part of normal
// product flow, not server errors); the JSON body carries { ok, error?, ... }.

const VENDORS = ["anthropic", "openai", "cursor", "copilot"] as const;
type Vendor = (typeof VENDORS)[number];

function isVendor(v: string): v is Vendor {
  return (VENDORS as readonly string[]).includes(v);
}

type AnthropicTestOutcome =
  | { ok: true; rows: number }
  | {
      ok: false;
      error: "invalid_api_key" | "rate_limited" | "unknown_error";
      syncStatus: "auth_error" | "rate_limited";
    };

async function testAnthropic(plaintextKey: string): Promise<AnthropicTestOutcome> {
  const startingAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
  try {
    const rows = await fetchAnthropicOrgUsage({
      apiKey: plaintextKey,
      startingAt,
    });
    return { ok: true, rows: rows.length };
  } catch (err) {
    if (err instanceof AnthropicUsageError) {
      if (err.status === 401 || err.status === 403) {
        return { ok: false, error: "invalid_api_key", syncStatus: "auth_error" };
      }
      if (err.status === 429) {
        return { ok: false, error: "rate_limited", syncStatus: "rate_limited" };
      }
      // Non-2xx that isn't auth/rate-limit. Bucket as auth_error so the
      // poller stops retrying until a human investigates.
      return { ok: false, error: "unknown_error", syncStatus: "auth_error" };
    }
    // Network error, decryption failure, etc. Never surface details.
    return { ok: false, error: "unknown_error", syncStatus: "auth_error" };
  }
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

  if (vendor !== "anthropic") {
    // No live verification path yet. Mark pending so the future poller
    // implementation can pick it up without manual intervention.
    await db
      .update(schema.vendorConnection)
      .set({
        syncStatus: "pending",
        syncErrorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.vendorConnection.id, conn.id));
    return NextResponse.json({
      ok: false,
      error: "not_yet_implemented",
      vendor,
    });
  }

  // Decrypt directly into the call site; do NOT bind to a variable name
  // that might leak via console traces or stack frames.
  const outcome = await testAnthropic(await decryptVendorKey(conn.apiKeyEnc));

  if (outcome.ok) {
    // NOTE: do NOT advance the sync watermark here. The sync worker uses
    // that timestamp as its fetch cursor (default backfill = watermark ??
    // 30 days ago). Touching it on Test would kill the initial backfill.
    await db
      .update(schema.vendorConnection)
      .set({
        syncStatus: "ok",
        syncErrorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.vendorConnection.id, conn.id));
    return NextResponse.json({ ok: true, rows: outcome.rows });
  }

  await db
    .update(schema.vendorConnection)
    .set({
      syncStatus: outcome.syncStatus,
      syncErrorMessage: outcome.error,
      updatedAt: new Date(),
    })
    .where(eq(schema.vendorConnection.id, conn.id));

  return NextResponse.json({ ok: false, error: outcome.error });
}
