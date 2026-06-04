"use server";

import { extractGithubLinkage } from "@/lib/github-url";
import { parseXPostUrl } from "@/lib/x-url";
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

export type BuildPostInput = {
  title: string;
  summary: string;
  tools: string;
  stack: string;
  githubUrl: string;
  xUrl: string;
  demoUrl: string;
  question: string;
  community: string;
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

function cleanCsv(value: string, maxItems: number, maxLength: number): string[] {
  return value
    .split(/[,\n]/)
    .map((part) => cleanText(part, maxLength))
    .filter((part): part is string => Boolean(part))
    .filter(
      (part, index, list) =>
        list.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === index,
    )
    .slice(0, maxItems);
}

function cleanUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 52)
    .replace(/-+$/g, "");
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 6);
  return `${slug || "build"}-${suffix}`;
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
    if (!sessionRow.sharedAt) {
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
            "That receipt could not be shared because it needs review, a generated receipt, or quota.",
          actionHref: "/dashboard",
          actionLabel: "Open dashboard",
        };
      }
      revalidatePath("/feed");
      revalidatePath(`/u/${viewer.handle}`);
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

export async function createBuildPostFromFeed(input: BuildPostInput): Promise<FeedPublishResult> {
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) {
    return {
      ok: false,
      error: "Posting is unavailable until Trail auth and database are configured.",
    };
  }

  const { auth } = await import("@/lib/auth");
  const sessionInfo = await auth.api.getSession({ headers: await headers() });
  if (!sessionInfo?.user?.id) {
    return {
      ok: false,
      error: "Sign in with GitHub before posting a build.",
      actionHref: "/api/auth/sign-in/github?callbackURL=%2Fcreate",
      actionLabel: "Sign in",
    };
  }

  const title = cleanText(input.title, 120);
  const summary = cleanSummary(input.summary, 1200);
  if (!title || !summary) {
    return { ok: false, error: "Add a title and a short summary before publishing." };
  }

  const githubUrl = cleanUrl(input.githubUrl);
  const parsedXUrl = parseXPostUrl(input.xUrl);
  if (input.xUrl.trim() && !parsedXUrl) {
    return { ok: false, error: "Paste a public X or Twitter status URL." };
  }
  const xUrl = parsedXUrl?.normalizedUrl ?? null;
  const demoUrl = cleanUrl(input.demoUrl);
  const question = cleanSummary(input.question, 260);
  const community = input.community === "puerto-rico" ? "puerto-rico" : null;
  const tools = cleanCsv(input.tools, 8, 32);
  const stack = cleanCsv(input.stack, 10, 32);
  const github = extractGithubLinkage(githubUrl);
  const primaryTool = tools[0]?.toLowerCase().replace(/\s+/g, "-") || "manual";
  const now = new Date();
  const sessionId = crypto.randomUUID();
  const slug = slugifyTitle(title);

  const { db, schema } = await import("@/db/client");
  const { extractSessionTags } = await import("@/lib/tags");
  const viewer = await db.query.user.findFirst({
    where: eq(schema.user.id, sessionInfo.user.id),
    columns: { id: true, handle: true },
  });

  if (!viewer) return { ok: false, error: "Your Trail profile could not be found." };
  if (!viewer.handle) {
    return {
      ok: false,
      error: "Add your public Trail handle before posting builds to the feed.",
      actionHref: "/settings",
      actionLabel: "Edit profile",
    };
  }

  await db.insert(schema.trailSession).values({
    id: sessionId,
    userId: viewer.id,
    slug,
    tool: primaryTool,
    postKind: "manual_build",
    repo: github.linkedRepo,
    summary,
    title,
    eventCount: 0,
    startedAt: now,
    endedAt: now,
    sharedAt: now,
    visibility: "public",
    toolsUsed: tools.length > 0 ? tools : null,
    frameworks: stack.length > 0 ? stack : null,
    taskType: "shipped",
    outcome: "shipped",
    linkedPrUrl: github.linkedPrUrl,
    linkedCommitSha: github.linkedCommitSha,
    linkedRepo: github.linkedRepo,
    receiptTldr: question ? `${summary}\n\nQuestion for the community: ${question}` : summary,
    recipeTldr: summary,
  });

  const links = [
    githubUrl
      ? { id: crypto.randomUUID(), sessionId, kind: "github", url: githubUrl, label: "GitHub" }
      : null,
    xUrl
      ? { id: crypto.randomUUID(), sessionId, kind: "x", url: xUrl, label: "X / Twitter" }
      : null,
    demoUrl
      ? { id: crypto.randomUUID(), sessionId, kind: "demo", url: demoUrl, label: "Demo" }
      : null,
  ].filter((link): link is NonNullable<typeof link> => Boolean(link));
  if (links.length > 0) {
    await db.insert(schema.buildPostLink).values(links);
  }

  const tags = extractSessionTags({
    tool: primaryTool,
    toolsUsed: tools,
    frameworks: stack,
    models: null,
  });
  const tagRows = tags.map((tag) => ({
    id: crypto.randomUUID(),
    sessionId,
    tag: tag.tag,
    label: tag.label,
    kind: tag.kind,
    confidence: tag.confidence.toFixed(3),
    source: tag.source,
  }));
  if (community === "puerto-rico") {
    tagRows.push({
      id: crypto.randomUUID(),
      sessionId,
      tag: "puerto-rico",
      label: "Puerto Rico",
      kind: "community",
      confidence: "1.000",
      source: "heuristic",
    });
  }
  if (tagRows.length > 0) {
    await db.insert(schema.sessionTag).values(tagRows).onConflictDoNothing();
  }

  const href = `/u/${viewer.handle}/${slug}`;
  revalidatePath("/feed");
  revalidatePath("/create");
  revalidatePath("/puerto-rico");
  revalidatePath(`/u/${viewer.handle}`);
  revalidatePath(href);

  return {
    ok: true,
    href,
    shareUrl: `${PUBLIC_APP_URL}${href}`,
    title,
  };
}
