// Task 7 — Stripe paywall enforcement.
//
// Rules:
//   - free plan: at most 3 PUBLIC receipts. private is pro-only.
//   - pro plan:  unlimited public + private.
//
// "Public receipt" = a trail_session with visibility='public', a generated
// receipt, and shared_at set. Visibility alone is not enough because legacy and
// staged rows can be default-public before the owner intentionally shares them.
import { and, count, eq, isNotNull } from "drizzle-orm";

export type PaywallCheck =
  | { allowed: true }
  | {
      allowed: false;
      reason: "paywall_public_limit" | "paywall_private_pro_only";
      publicCount: number;
      limit: number;
    };

export const FREE_PUBLIC_RECEIPT_LIMIT = 3;

export async function checkPaywall(
  userId: string,
  opts: { visibility: string },
): Promise<PaywallCheck> {
  const { db, schema } = await import("@/db/client");

  const userRow = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { plan: true },
  });
  const plan = userRow?.plan ?? "free";
  if (plan === "pro") return { allowed: true };

  // free plan
  if (opts.visibility === "private") {
    return {
      allowed: false,
      reason: "paywall_private_pro_only",
      publicCount: 0,
      limit: FREE_PUBLIC_RECEIPT_LIMIT,
    };
  }
  if (opts.visibility !== "public") {
    // pending / redacted etc. — not counted against the limit.
    return { allowed: true };
  }
  const [{ value }] = await db
    .select({ value: count() })
    .from(schema.trailSession)
    .where(
      and(
        eq(schema.trailSession.userId, userId),
        eq(schema.trailSession.postKind, "agent_session"),
        eq(schema.trailSession.visibility, "public"),
        isNotNull(schema.trailSession.sharedAt),
        isNotNull(schema.trailSession.receiptGeneratedAt),
      ),
    );
  if (value >= FREE_PUBLIC_RECEIPT_LIMIT) {
    return {
      allowed: false,
      reason: "paywall_public_limit",
      publicCount: value,
      limit: FREE_PUBLIC_RECEIPT_LIMIT,
    };
  }
  return { allowed: true };
}
