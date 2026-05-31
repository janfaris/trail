// GET /api/receipt/<id>/image.png — deterministic thermal-receipt PNG.
//
// <id> matches either:
//   - trailSession.id (full id), or
//   - trailSession.slug (since slugs are unique-per-user but commonly used
//     as the public "short id" in URLs). We try id first, then slug.
//
// Caching: response is content-addressed by session id + updatedAt. The
// renderer is deterministic, so we serve `public, max-age=31536000,
// immutable` and rely on the cache-busting query string when callers want
// a fresh render after a receipt regeneration.

export const runtime = "nodejs";

import { db, schema } from "@/db/client";
import { renderReceiptPng } from "@/lib/receipt-image";
import { eq, or } from "drizzle-orm";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const sessionRow = await db.query.trailSession.findFirst({
    where: or(eq(schema.trailSession.id, id), eq(schema.trailSession.slug, id)),
  });
  if (!sessionRow || sessionRow.visibility !== "public" || !sessionRow.sharedAt) {
    return new Response("Not found", { status: 404 });
  }

  const owner = await db.query.user.findFirst({
    where: eq(schema.user.id, sessionRow.userId),
  });
  if (!owner) return new Response("Not found", { status: 404 });

  // Derive status: trust receiptStatus (set by verifyShipped), else
  // outcome === "shipped" → shipped, else "draft" / "unverified".
  const status: "shipped" | "draft" | "unverified" =
    sessionRow.receiptStatus === "shipped" || sessionRow.outcome === "shipped"
      ? "shipped"
      : sessionRow.receiptStatus === "draft"
        ? "draft"
        : "unverified";

  const png = await renderReceiptPng({
    handle: owner.handle ?? "user",
    slug: sessionRow.slug,
    shortId: sessionRow.id.slice(0, 7),
    tool: sessionRow.tool,
    // Use the date portion only — stable across renders.
    date: new Date(sessionRow.startedAt).toISOString().slice(0, 10),
    tldr: sessionRow.receiptTldr ?? sessionRow.recipeTldr ?? sessionRow.summary ?? "",
    commitSha: sessionRow.linkedCommitSha ?? sessionRow.receiptVerifiedSha ?? null,
    changedFiles: sessionRow.receiptChangedFiles ?? [],
    redactionCount: (sessionRow.receiptValidatorWarnings ?? []).length,
    status,
  });

  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
