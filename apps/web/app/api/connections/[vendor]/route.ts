export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { encryptVendorKey } from "@/lib/crypto/vendor-keys";

// Task 2.3 — BYOK vendor key intake. POST stores the encrypted key + marks
// the connection 'pending' for the background sync poller to pick up. DELETE
// drops the connection. The plaintext apiKey is never logged, never echoed
// back, and only lives in a short-lived const before being handed to
// encryptVendorKey().

const VENDORS = ["anthropic", "openai", "cursor", "copilot"] as const;
type Vendor = (typeof VENDORS)[number];

const PREFIX_HINTS: Record<Vendor, { prefixes: string[] | null; hint: string }> = {
  anthropic: {
    prefixes: ["sk-ant-", "sk-"],
    hint: "Anthropic admin keys typically start with 'sk-ant-'.",
  },
  openai: {
    prefixes: ["sk-"],
    hint: "OpenAI API keys typically start with 'sk-'.",
  },
  copilot: {
    prefixes: ["ghp_", "github_pat_"],
    hint: "Copilot keys use a GitHub personal-access-token prefix ('ghp_' or 'github_pat_').",
  },
  cursor: { prefixes: null, hint: "" },
};

const PostBodySchema = z.object({
  apiKey: z.string().min(8),
  workspaceId: z.string().optional(),
});

function isVendor(v: string): v is Vendor {
  return (VENDORS as readonly string[]).includes(v);
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

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = PostBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { apiKey, workspaceId } = parsed.data;

  // Prefix sanity check. We intentionally only check format — never echo the
  // key back in the error response.
  const { prefixes, hint } = PREFIX_HINTS[vendor];
  if (prefixes && !prefixes.some((p) => apiKey.startsWith(p))) {
    return NextResponse.json(
      { error: "invalid key format", code: "invalid_key_format", hint },
      { status: 400 },
    );
  }

  const ciphertext = await encryptVendorKey(apiKey);

  const id = crypto.randomUUID();
  const inserted = await db
    .insert(schema.vendorConnection)
    .values({
      id,
      userId: sess.user.id,
      vendor,
      apiKeyEnc: ciphertext,
      workspaceId: workspaceId ?? null,
      syncStatus: "pending",
      syncErrorMessage: null,
    })
    .onConflictDoUpdate({
      target: [schema.vendorConnection.userId, schema.vendorConnection.vendor],
      set: {
        apiKeyEnc: ciphertext,
        workspaceId: workspaceId ?? null,
        syncStatus: "pending",
        syncErrorMessage: null,
        updatedAt: new Date(),
      },
    })
    .returning({ id: schema.vendorConnection.id });

  const rowId = inserted[0]?.id ?? id;
  return NextResponse.json({ id: rowId, vendor, syncStatus: "pending" });
}

export async function DELETE(
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

  const removed = await db
    .delete(schema.vendorConnection)
    .where(
      and(
        eq(schema.vendorConnection.userId, sess.user.id),
        eq(schema.vendorConnection.vendor, rawVendor),
      ),
    )
    .returning({ id: schema.vendorConnection.id });

  return NextResponse.json({ ok: true, removed: removed.length });
}
