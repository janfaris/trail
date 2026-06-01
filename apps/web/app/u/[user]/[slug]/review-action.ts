"use server";

import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";
import { generateReceiptAiReview } from "@/lib/receipt-ai-review";
import type { ReceiptAiReview } from "@/lib/receipt-ai-review-types";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

export type ReceiptAiReviewResult =
  | { ok: true; review: ReceiptAiReview; cached: boolean }
  | { ok: false; error: string };

export async function requestReceiptAiReview(
  sessionId: string,
  pathToRevalidate: string,
): Promise<ReceiptAiReviewResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "unauthorized" };

  const row = await db.query.trailSession.findFirst({
    where: eq(schema.trailSession.id, sessionId),
  });
  if (!row) return { ok: false, error: "not found" };
  if (row.userId !== session.user.id) return { ok: false, error: "owner only" };
  if (row.visibility === "redacted" || row.redactedAt) {
    return { ok: false, error: "redacted sessions cannot be checked" };
  }
  if (row.receiptAiReview) {
    return { ok: true, review: row.receiptAiReview, cached: true };
  }

  const result = await generateReceiptAiReview(sessionId);
  if (!result.ok) {
    return { ok: false, error: result.message ?? result.reason };
  }

  revalidatePath(pathToRevalidate);
  return { ok: true, review: result.review, cached: false };
}
