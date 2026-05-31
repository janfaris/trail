"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

export type FeedComposerOutcome = "shipped" | "abandoned" | "rabbithole" | "unknown" | null;

export type FeedPublishInput = {
  sessionId: string;
  title: string;
  summary: string;
  outcome: FeedComposerOutcome;
};

export type FeedPublishResult =
  | {
      ok: true;
      href: string;
      shareUrl: string;
      title: string;
    }
  | {
      ok: false;
      error: string;
      actionHref?: string;
      actionLabel?: string;
    };

const OUTCOMES = new Set(["shipped", "abandoned", "rabbithole", "unknown"]);
const PUBLIC_APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://gettrail.vercel.app").replace(
  /\/$/,
  "",
);

function cleanText(value: string, maxLength: number): string | null {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

function cleanSummary(value: string, maxLength: number): string | null {
  const cleaned = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

export async function publishSessionFromFeed(input: FeedPublishInput): Promise<FeedPublishResult> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !process.env.BETTER_AUTH_SECRET) {
    return {
      ok: false,
      error: "Publishing is unavailable until Trail auth and database are configured.",
    };
  }

  const { auth } = await import("@/lib/auth");
  const sessionInfo = await auth.api.getSession({ headers: await headers() });
  if (!sessionInfo?.user?.id) {
    return {
      ok: false,
      error: "Sign in with GitHub before publishing a receipt.",
      actionHref: "/api/auth/sign-in/github?callbackURL=%2Ffeed",
      actionLabel: "Sign in",
    };
  }

  const { db, schema } = await import("@/db/client");
  const [sessionRow, viewer] = await Promise.all([
    db.query.trailSession.findFirst({
      where: and(
        eq(schema.trailSession.id, input.sessionId),
        eq(schema.trailSession.userId, sessionInfo.user.id),
      ),
      columns: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        userId: true,
        visibility: true,
        pendingReviewReasons: true,
        redactedAt: true,
        eventCount: true,
        endedAt: true,
        receiptGeneratedAt: true,
        sharedAt: true,
      },
    }),
    db.query.user.findFirst({
      where: eq(schema.user.id, sessionInfo.user.id),
      columns: { id: true, handle: true, plan: true },
    }),
  ]);

  if (!sessionRow || !viewer) {
    return { ok: false, error: "That draft could not be found under your account." };
  }

  if (!viewer.handle) {
    return {
      ok: false,
      error: "Add your public Trail handle before publishing receipts to the social feed.",
      actionHref: "/settings",
      actionLabel: "Edit profile",
    };
  }

  if (sessionRow.visibility === "public") {
    if (!sessionRow.receiptGeneratedAt) {
      return {
        ok: false,
        error: "Generate the receipt preview from the dashboard before sharing it to the feed.",
        actionHref: "/dashboard",
        actionLabel: "Open dashboard",
      };
    }
    const href = `/u/${viewer.handle}/${sessionRow.slug}`;
    return {
      ok: true,
      href,
      shareUrl: `${PUBLIC_APP_URL}${href}`,
      title: sessionRow.title ?? sessionRow.slug,
    };
  }

  if (sessionRow.visibility === "pending" || sessionRow.pendingReviewReasons?.length) {
    return {
      ok: false,
      error:
        "This receipt is still in safety review. Open the dashboard to review redaction flags first.",
      actionHref: "/dashboard",
      actionLabel: "Review draft",
    };
  }

  if (sessionRow.visibility === "redacted" || sessionRow.redactedAt) {
    return { ok: false, error: "Redacted sessions cannot be republished from the feed." };
  }

  if (!sessionRow.endedAt) {
    return { ok: false, error: "Only completed sessions can become public receipts." };
  }

  if (sessionRow.eventCount <= 0) {
    return { ok: false, error: "This session has no recorded events yet." };
  }

  if (!sessionRow.receiptGeneratedAt) {
    return {
      ok: false,
      error: "Generate the receipt preview from the dashboard before publishing it to the feed.",
      actionHref: "/dashboard",
      actionLabel: "Open dashboard",
    };
  }

  const { checkPaywall } = await import("@/lib/paywall");
  const paywall = await checkPaywall(viewer.id, { visibility: "public" });
  if (!paywall.allowed) {
    return {
      ok: false,
      error: `Free workspaces can publish ${paywall.limit} public receipts. Upgrade to publish more.`,
      actionHref: "/pricing",
      actionLabel: "Upgrade",
    };
  }

  const title = cleanText(input.title, 120) ?? sessionRow.title ?? sessionRow.slug;
  const summary = cleanSummary(input.summary, 700) ?? sessionRow.summary;
  const outcome =
    input.outcome && OUTCOMES.has(input.outcome)
      ? input.outcome
      : input.outcome === null
        ? null
        : "unknown";

  const { promoteSessionToPublicReceipt } = await import("@/lib/public-receipt-publishing");
  const published = await promoteSessionToPublicReceipt({
    databaseUrl,
    userId: viewer.id,
    sessionId: sessionRow.id,
    title,
    summary,
    outcome,
  });
  if (!published.published) {
    return {
      ok: false,
      error:
        "This draft changed or your public receipt limit was reached before Trail could publish it. Refresh and try again.",
    };
  }

  const href = `/u/${published.handle}/${published.slug}`;
  revalidatePath("/feed");
  revalidatePath("/dashboard");
  revalidatePath(`/u/${published.handle}`);
  revalidatePath(`/u/${published.handle}/interview`);
  revalidatePath(href);

  return {
    ok: true,
    href,
    shareUrl: `${PUBLIC_APP_URL}${href}`,
    title,
  };
}
