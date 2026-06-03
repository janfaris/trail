import { CopyButton } from "@/components/copy-button";
import { FollowButton } from "@/components/follow-button";
import { ReactionBar, type ReactionKind } from "@/components/reaction-bar";
import { RelativeTime } from "@/components/relative-time";
import { SaveReceiptButton } from "@/components/save-receipt-button";
import { SiteNav } from "@/components/site-nav";
import { ToolIcon } from "@/components/tool-icon";
import { Avatar } from "@/components/ui/avatar";
import { UseLessonButton } from "@/components/use-lesson-button";
import { type BuilderReputation, computeBuilderReputation } from "@/lib/builder-reputation";
import { type RankableSession, normalizeFeedView, rankFeed } from "@/lib/follow";
import { type RadarCategory, radarCategoryLabel } from "@/lib/radar-sources";
import { formatDuration } from "@/lib/session-metrics";
import { githubAvatar, shareUrl, tweetIntent } from "@/lib/share";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { FeedComposer, type FeedComposerDraft, type FeedComposerViewer } from "./feed-composer";

export const dynamic = "force-dynamic";

const FEED_LIMIT = 80;
const FOLLOWING_SIGN_IN_HREF = signInHref("/feed?view=following");
const PUBLIC_APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://gettrail.vercel.app").replace(
  /\/$/,
  "",
);

const discoveryLinks = [
  {
    href: "/radar",
    label: "AI Radar",
    detail: "Track fresh model, tool, benchmark, and leak signals that need proof receipts.",
  },
  {
    href: "/tools",
    label: "AI tools",
    detail: "See what people are shipping with Claude Code, Codex, Cursor, and more.",
  },
  {
    href: "/frameworks",
    label: "Frameworks",
    detail: "Browse receipts by the stack behind the work.",
  },
  {
    href: "/install",
    label: "Install Trail",
    detail: "Record local agent sessions and publish the receipts worth sharing.",
  },
];

const onboardingSteps = [
  {
    n: "01",
    label: "Read",
    title: "Browse openly",
    body: "The Everyone feed is public: no account needed to read sessions, costs, models, and merged work.",
  },
  {
    n: "02",
    label: "Follow",
    title: "Sign in to follow",
    body: "GitHub sign-in unlocks follow buttons, reactions, and your personal Following feed.",
    href: FOLLOWING_SIGN_IN_HREF,
    cta: "Sign in",
  },
  {
    n: "03",
    label: "Publish",
    title: "Install and share",
    body: "Run Trail locally, keep using your AI tools, then publish the sessions worth turning into proof.",
    href: "/install",
    cta: "Install",
  },
];

function TrailLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: ReactNode;
}) {
  if (href.startsWith("/api/")) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

function formatToolName(tool: string): string {
  return tool
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function signInHref(callbackURL: string): string {
  return `/api/auth/sign-in/github?callbackURL=${encodeURIComponent(callbackURL)}`;
}

function profileHref(row: BaseFeedRow): string {
  return `/u/${row.handle ?? "anon"}`;
}

function receiptHref(row: BaseFeedRow): string {
  return `${profileHref(row)}/${row.slug}`;
}

function publicReceiptUrl(row: BaseFeedRow): string {
  return shareUrl(row.handle ?? "anon", row.slug, PUBLIC_APP_URL);
}

function avatarSrc(row: BaseFeedRow): string | null {
  return row.image ?? (row.handle ? githubAvatar(row.handle) : null);
}

function commentAvatarSrc(comment: FeedCommentPreview): string | null {
  return comment.authorImage ?? (comment.authorHandle ? githubAvatar(comment.authorHandle) : null);
}

function formatUsd(raw: string | null): string | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return `$${value.toFixed(2)}`;
}

function shortList(values: string[] | null, count: number): string[] {
  if (!values) return [];
  return values.filter(Boolean).slice(0, count);
}

function stackChips(row: BaseFeedRow): string[] {
  const values = [
    formatToolName(row.tool),
    ...shortList(row.frameworks, 3),
    ...shortList(row.toolsUsed, 2).map(formatToolName),
  ];
  return Array.from(new Set(values)).slice(0, 5);
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase();
}

function rowInterestTags(row: BaseFeedRow): Array<{ key: string; label: string }> {
  const tags = [
    { key: normalizeTag(row.tool), label: formatToolName(row.tool) },
    ...(row.frameworks ?? []).map((tag) => ({ key: normalizeTag(tag), label: tag })),
    ...(row.toolsUsed ?? []).map((tag) => ({ key: normalizeTag(tag), label: formatToolName(tag) })),
  ];
  const seen = new Set<string>();
  return tags.filter((tag) => {
    if (!tag.key || seen.has(tag.key)) return false;
    seen.add(tag.key);
    return true;
  });
}

function matchedViewerStackLabels(row: BaseFeedRow, viewerTags: Set<string>): string[] {
  if (viewerTags.size === 0) return [];
  return rowInterestTags(row)
    .filter((tag) => viewerTags.has(tag.key))
    .map((tag) => tag.label)
    .slice(0, 2);
}

function timelineMetrics(row: BaseFeedRow): Array<{ label: string; value: string }> {
  const metrics = [{ label: "Events", value: `${row.eventCount} ev` }];
  const duration = formatDuration(row.durationSeconds);
  const cost = formatUsd(row.estimatedCostUsd);

  if (duration) metrics.push({ label: "Time", value: duration });
  if (row.promptCount) metrics.push({ label: "Prompts", value: `${row.promptCount}` });
  if (row.distinctFiles) metrics.push({ label: "Files", value: `${row.distinctFiles}` });
  if (row.failedToolCalls) metrics.push({ label: "Failed", value: `${row.failedToolCalls}` });
  if (cost) metrics.push({ label: "Cost", value: cost });

  return metrics.slice(0, 5);
}

function pluralize(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function reactionSummary(row: BaseFeedRow): string {
  if (row.positiveReactions === 0 && row.negativeReactions === 0) {
    return "Be first to react";
  }
  if (row.negativeReactions === 0) {
    return `${pluralize(row.positiveReactions, "builder")} says it worked`;
  }
  if (row.positiveReactions === 0) {
    return `${pluralize(row.negativeReactions, "tweak")} requested`;
  }
  return `${row.positiveReactions} worked / ${row.negativeReactions} needs tweak`;
}

function feedReason(row: FeedRow): string {
  if ("isFollowing" in row && row.isFollowing && row.handle)
    return `Because you follow @${row.handle}`;
  if (row.viewerStackMatches.length > 0) {
    return `Because you ship with ${row.viewerStackMatches.join(" + ")}`;
  }
  if (row.commentCount > 0 && row.positiveReactions + row.negativeReactions > 0) {
    return `${pluralize(row.commentCount, "reply", "replies")} and ${reactionSummary(row).toLowerCase()}`;
  }
  if (row.commentCount > 0)
    return `${pluralize(row.commentCount, "reply", "replies")} in the thread`;
  if (row.lessonCount > 0) return `${pluralize(row.lessonCount, "reusable lesson")} extracted`;
  if (row.positiveReactions + row.negativeReactions > 0) return reactionSummary(row);
  if (row.receiptStatus === "shipped" || row.outcome === "shipped") return "Fresh shipping proof";
  if (row.linkedRepo ?? row.repo) return `Proof from ${row.linkedRepo ?? row.repo}`;
  return "New builder receipt";
}

function receiptBadge(row: BaseFeedRow): string | null {
  if (row.receiptStatus === "shipped") return "Shipped";
  if (row.receiptStatus === "draft") return "Draft";
  if (row.outcome === "shipped") return "Marked shipped";
  if (row.taskType) return formatToolName(row.taskType);
  return null;
}

// /feed — open discovery by default. Everyone can browse public sessions; the
// following timeline is personalized and therefore remains signed-in only.
// Joins always key on trail_session.id / userId (slugs are unique only per-user,
// never globally) and filter to explicitly shared public receipts in SQL.

interface BaseFeedRow extends RankableSession {
  slug: string;
  title: string | null;
  summary: string | null;
  tool: string;
  eventCount: number;
  authorId: string;
  handle: string | null;
  name: string;
  image: string | null;
  bio: string | null;
  repo: string | null;
  linkedRepo: string | null;
  frameworks: string[] | null;
  toolsUsed: string[] | null;
  durationSeconds: number | null;
  distinctFiles: number | null;
  promptCount: number | null;
  failedToolCalls: number | null;
  estimatedCostUsd: string | null;
  receiptStatus: string | null;
  taskType: string | null;
  outcome: string | null;
  positiveReactions: number;
  negativeReactions: number;
  workedReactions: number;
  verifiedReactions: number;
  tweakReactions: number;
  brokenReactions: number;
  viewerReactions: ReactionKind[];
  viewerHasSaved: boolean;
  lessonCount: number;
  lessonPreviewTitle: string | null;
  lessonPreviewWhatToSteal: string | null;
  commentCount: number;
  commentPreviews: FeedCommentPreview[];
}

interface FeedRow extends BaseFeedRow {
  isFollowing: boolean;
  viewerStackMatches: string[];
}

type FeedRowWithoutStats = Omit<
  BaseFeedRow,
  | "positiveReactions"
  | "negativeReactions"
  | "workedReactions"
  | "verifiedReactions"
  | "tweakReactions"
  | "brokenReactions"
  | "viewerReactions"
  | "viewerHasSaved"
  | "lessonCount"
  | "lessonPreviewTitle"
  | "lessonPreviewWhatToSteal"
  | "commentCount"
  | "commentPreviews"
>;

interface FeedCommentPreview {
  id: string;
  body: string;
  createdAt: Date | string;
  authorName: string;
  authorHandle: string | null;
  authorImage: string | null;
}

interface FeedStats {
  receipts: number;
  builders: number;
  shipped: number;
  reactions: number;
  comments: number;
}

interface BuilderRecommendation {
  id: string;
  handle: string;
  name: string;
  image: string | null;
  bio: string | null;
  receiptCount: number;
  shippedCount: number;
  reactionCount: number;
  followerCount: number;
  latestAt: Date | string | null;
  topTools: string[];
  isFollowing: boolean;
}

interface TrendingStack {
  kind: string;
  tag: string;
  label: string;
  receiptCount: number;
  builderCount: number;
}

interface FeedDiscovery {
  stats: FeedStats;
  builders: BuilderRecommendation[];
  stacks: TrendingStack[];
}

interface FeedRadarSignal {
  [key: string]: unknown;
  id: string;
  title: string;
  category: RadarCategory;
  sourceHandle: string;
  score: unknown;
  publishedAt: Date | string;
}

interface DailyBriefSummaryRaw {
  [key: string]: unknown;
  unreadNotifications: unknown;
  followingCount: unknown;
  followingReceipts: unknown;
  publicReceipts: unknown;
  verifiedShips: unknown;
  extractedLessons: unknown;
  lessonSaves: unknown;
  lessonReuses: unknown;
  reactions: unknown;
  comments: unknown;
  followers: unknown;
}

interface DailyBriefLessonRaw {
  [key: string]: unknown;
  id: string;
  title: string;
  whatToSteal: string;
  useWhen: string;
  promptPattern: string | null;
  transferabilityScore: unknown;
  reuseCount: unknown;
  usedByViewer: boolean | null;
  slug: string;
  handle: string;
  tool: string;
  sharedAt: Date | string | null;
}

interface DailyBriefLesson {
  id: string;
  title: string;
  whatToSteal: string;
  useWhen: string;
  promptPattern: string | null;
  transferabilityScore: number;
  reuseCount: number;
  usedByViewer: boolean;
  slug: string;
  handle: string;
  tool: string;
  sharedAt: Date | string | null;
}

interface DailyBuilderBriefData {
  draftCount: number;
  unreadNotifications: number;
  followingCount: number;
  followingReceipts: number;
  reputation: BuilderReputation;
  lessons: DailyBriefLesson[];
}

interface FeedPersonalization {
  followingCount: number;
  publicReceiptCount: number;
  usedLessonCount: number;
  unreadNotifications: number;
  topTags: string[];
}

interface FeedPersonalizationSummaryRaw {
  [key: string]: unknown;
  followingCount: unknown;
  publicReceiptCount: unknown;
  usedLessonCount: unknown;
  unreadNotifications: unknown;
}

interface FeedPersonalizationTagRaw {
  [key: string]: unknown;
  tag: string;
}

interface FeedStatsRaw {
  [key: string]: unknown;
  receipts: unknown;
  builders: unknown;
  shipped: unknown;
  reactions: unknown;
  comments: unknown;
}

interface BuilderRecommendationRaw {
  [key: string]: unknown;
  id: string;
  handle: string;
  name: string;
  image: string | null;
  bio: string | null;
  receiptCount: unknown;
  shippedCount: unknown;
  reactionCount: unknown;
  followerCount: unknown;
  latestAt: Date | string | null;
  topTools: string[] | null;
  isFollowing: boolean | null;
}

interface TrendingStackRaw {
  [key: string]: unknown;
  kind: string;
  tag: string;
  label: string | null;
  receiptCount: unknown;
  builderCount: unknown;
}

type FeedSearchParams = {
  view?: string | string[];
};

function rowsOf<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === "object" && "rows" in res) {
    const rows = (res as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}

function toCount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en", { notation: value >= 1000 ? "compact" : "standard" }).format(
    value,
  );
}

function stackHref(stack: TrendingStack): string {
  if (stack.kind === "framework") return `/frameworks/${stack.tag}`;
  if (stack.kind === "tool") return `/tools/${stack.tag}`;
  return "/tools";
}

async function loadViewer(): Promise<FeedComposerViewer | null> {
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) return null;

  try {
    const { auth } = await import("@/lib/auth");
    const sessionInfo = await auth.api.getSession({ headers: await headers() });
    if (!sessionInfo?.user?.id) return null;

    const { db, schema } = await import("@/db/client");
    const viewer = await db.query.user.findFirst({
      where: eq(schema.user.id, sessionInfo.user.id),
      columns: { id: true, name: true, handle: true, image: true },
    });

    return (
      viewer ?? {
        id: sessionInfo.user.id,
        name: sessionInfo.user.name ?? "Trail builder",
        handle: null,
        image: sessionInfo.user.image ?? null,
      }
    );
  } catch {
    // Public discovery should still render when auth is unavailable.
    return null;
  }
}

function normalizeComposerOutcome(value: string | null): FeedComposerDraft["outcome"] {
  if (
    value === "shipped" ||
    value === "abandoned" ||
    value === "rabbithole" ||
    value === "unknown"
  ) {
    return value;
  }
  return "shipped";
}

async function loadComposerDrafts(viewerId: string | null): Promise<FeedComposerDraft[]> {
  if (!viewerId) return [];

  const { db, schema } = await import("@/db/client");
  const drafts = await db.query.trailSession.findMany({
    where: and(
      eq(schema.trailSession.userId, viewerId),
      eq(schema.trailSession.visibility, "private"),
      isNull(schema.trailSession.redactedAt),
      isNotNull(schema.trailSession.receiptGeneratedAt),
    ),
    columns: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      tool: true,
      repo: true,
      linkedRepo: true,
      outcome: true,
      receiptStatus: true,
      eventCount: true,
      startedAt: true,
      endedAt: true,
      frameworks: true,
      toolsUsed: true,
      pendingReviewReasons: true,
    },
    orderBy: [
      desc(sql`coalesce(${schema.trailSession.endedAt}, ${schema.trailSession.startedAt})`),
      desc(schema.trailSession.id),
    ],
    limit: 6,
  });

  return drafts
    .filter((draft) => draft.endedAt && !draft.pendingReviewReasons?.length && draft.eventCount > 0)
    .map((draft) => ({
      id: draft.id,
      slug: draft.slug,
      title: draft.title,
      summary: draft.summary,
      tool: draft.tool,
      repo: draft.repo,
      linkedRepo: draft.linkedRepo,
      outcome: normalizeComposerOutcome(draft.outcome),
      receiptStatus: draft.receiptStatus,
      eventCount: draft.eventCount,
      startedAt: draft.startedAt.toISOString(),
      endedAt: draft.endedAt?.toISOString() ?? null,
      tags: Array.from(new Set([...(draft.frameworks ?? []), ...(draft.toolsUsed ?? [])])).slice(
        0,
        5,
      ),
    }));
}

async function loadViewerInterestTags(viewerId: string): Promise<string[]> {
  const { db } = await import("@/db/client");
  const rows = await db.execute<FeedPersonalizationTagRaw>(sql`
    SELECT tag
    FROM (
      SELECT ts.tool AS tag, count(*)::int AS weight
      FROM trail_session ts
      WHERE ts.user_id = ${viewerId}
        AND ts.tool IS NOT NULL
      GROUP BY ts.tool

      UNION ALL

      SELECT framework.value AS tag, count(*)::int AS weight
      FROM trail_session ts
      CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(ts.frameworks, '[]'::jsonb)) framework(value)
      WHERE ts.user_id = ${viewerId}
      GROUP BY framework.value

      UNION ALL

      SELECT tool.value AS tag, count(*)::int AS weight
      FROM trail_session ts
      CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(ts.tools_used, '[]'::jsonb)) tool(value)
      WHERE ts.user_id = ${viewerId}
      GROUP BY tool.value
    ) tags
    WHERE coalesce(nullif(tag, ''), '') <> ''
    GROUP BY tag
    ORDER BY sum(weight) DESC, tag ASC
    LIMIT 8
  `);

  return rowsOf<FeedPersonalizationTagRaw>(rows).map((row) => row.tag);
}

async function loadFeedPersonalization(viewerId: string | null): Promise<FeedPersonalization> {
  if (!viewerId) {
    return {
      followingCount: 0,
      publicReceiptCount: 0,
      usedLessonCount: 0,
      unreadNotifications: 0,
      topTags: [],
    };
  }

  const { db } = await import("@/db/client");
  const [summaryRes, topTags] = await Promise.all([
    db.execute<FeedPersonalizationSummaryRaw>(sql`
      SELECT
        (SELECT count(*)::int FROM "follow" f WHERE f.follower_id = ${viewerId})
          AS "followingCount",
        (
          SELECT count(*)::int
          FROM trail_session ts
          WHERE ts.user_id = ${viewerId}
            AND ts.visibility = 'public'
            AND ts.shared_at IS NOT NULL
            AND ts.redacted_at IS NULL
        ) AS "publicReceiptCount",
        (SELECT count(*)::int FROM lesson_reuse lr WHERE lr.user_id = ${viewerId})
          AS "usedLessonCount",
        (
          SELECT count(*)::int
          FROM notification n
          WHERE n.user_id = ${viewerId}
            AND n.read_at IS NULL
        ) AS "unreadNotifications"
    `),
    loadViewerInterestTags(viewerId),
  ]);
  const summary = rowsOf<FeedPersonalizationSummaryRaw>(summaryRes)[0];

  return {
    followingCount: toCount(summary?.followingCount),
    publicReceiptCount: toCount(summary?.publicReceiptCount),
    usedLessonCount: toCount(summary?.usedLessonCount),
    unreadNotifications: toCount(summary?.unreadNotifications),
    topTags,
  };
}

async function loadPublicFeed(viewerId: string | null): Promise<FeedRow[]> {
  const { db, schema } = await import("@/db/client");
  const rows = await db
    .select({
      id: schema.trailSession.id,
      slug: schema.trailSession.slug,
      title: schema.trailSession.title,
      summary: schema.trailSession.summary,
      tool: schema.trailSession.tool,
      eventCount: schema.trailSession.eventCount,
      startedAt: schema.trailSession.startedAt,
      sharedAt: schema.trailSession.sharedAt,
      visibility: schema.trailSession.visibility,
      authorId: schema.user.id,
      handle: schema.user.handle,
      name: schema.user.name,
      image: schema.user.image,
      bio: schema.user.bio,
      repo: schema.trailSession.repo,
      linkedRepo: schema.trailSession.linkedRepo,
      frameworks: schema.trailSession.frameworks,
      toolsUsed: schema.trailSession.toolsUsed,
      durationSeconds: schema.trailSession.durationSeconds,
      distinctFiles: schema.trailSession.distinctFiles,
      promptCount: schema.trailSession.promptCount,
      failedToolCalls: schema.trailSession.failedToolCalls,
      estimatedCostUsd: schema.trailSession.estimatedCostUsd,
      receiptStatus: schema.trailSession.receiptStatus,
      taskType: schema.trailSession.taskType,
      outcome: schema.trailSession.outcome,
    })
    .from(schema.trailSession)
    .innerJoin(schema.user, eq(schema.trailSession.userId, schema.user.id))
    .where(
      and(
        eq(schema.trailSession.visibility, "public"),
        isNotNull(schema.trailSession.sharedAt),
        isNull(schema.trailSession.redactedAt),
        isNotNull(schema.user.handle),
      ),
    )
    .orderBy(desc(schema.trailSession.sharedAt), desc(schema.trailSession.id))
    .limit(FEED_LIMIT);

  const ranked = await attachEngagementStats(rankFeed(rows), viewerId);
  if (!viewerId || ranked.length === 0) {
    return ranked.map((row) => ({ ...row, isFollowing: false, viewerStackMatches: [] }));
  }

  const authorIds = Array.from(
    new Set(ranked.map((row) => row.authorId).filter((authorId) => authorId !== viewerId)),
  );
  if (authorIds.length === 0) {
    const viewerTags = new Set((await loadViewerInterestTags(viewerId)).map(normalizeTag));
    return ranked.map((row) => ({
      ...row,
      isFollowing: false,
      viewerStackMatches: matchedViewerStackLabels(row, viewerTags),
    }));
  }

  const [followingRows, interestTags] = await Promise.all([
    db
      .select({ followingId: schema.follow.followingId })
      .from(schema.follow)
      .where(
        and(eq(schema.follow.followerId, viewerId), inArray(schema.follow.followingId, authorIds)),
      ),
    loadViewerInterestTags(viewerId),
  ]);
  const followingIds = new Set(followingRows.map((row) => row.followingId));
  const viewerTags = new Set(interestTags.map(normalizeTag));

  return ranked.map((row) => ({
    ...row,
    isFollowing: row.authorId !== viewerId && followingIds.has(row.authorId),
    viewerStackMatches: matchedViewerStackLabels(row, viewerTags),
  }));
}

async function loadFollowingFeed(viewerId: string): Promise<FeedRow[]> {
  const { db, schema } = await import("@/db/client");
  const rows = await db
    .select({
      id: schema.trailSession.id,
      slug: schema.trailSession.slug,
      title: schema.trailSession.title,
      summary: schema.trailSession.summary,
      tool: schema.trailSession.tool,
      eventCount: schema.trailSession.eventCount,
      startedAt: schema.trailSession.startedAt,
      sharedAt: schema.trailSession.sharedAt,
      visibility: schema.trailSession.visibility,
      authorId: schema.user.id,
      handle: schema.user.handle,
      name: schema.user.name,
      image: schema.user.image,
      bio: schema.user.bio,
      repo: schema.trailSession.repo,
      linkedRepo: schema.trailSession.linkedRepo,
      frameworks: schema.trailSession.frameworks,
      toolsUsed: schema.trailSession.toolsUsed,
      durationSeconds: schema.trailSession.durationSeconds,
      distinctFiles: schema.trailSession.distinctFiles,
      promptCount: schema.trailSession.promptCount,
      failedToolCalls: schema.trailSession.failedToolCalls,
      estimatedCostUsd: schema.trailSession.estimatedCostUsd,
      receiptStatus: schema.trailSession.receiptStatus,
      taskType: schema.trailSession.taskType,
      outcome: schema.trailSession.outcome,
    })
    .from(schema.follow)
    .innerJoin(schema.trailSession, eq(schema.follow.followingId, schema.trailSession.userId))
    .innerJoin(schema.user, eq(schema.trailSession.userId, schema.user.id))
    .where(
      and(
        eq(schema.follow.followerId, viewerId),
        eq(schema.trailSession.visibility, "public"),
        isNotNull(schema.trailSession.sharedAt),
        isNull(schema.trailSession.redactedAt),
        isNotNull(schema.user.handle),
      ),
    )
    .orderBy(desc(schema.trailSession.sharedAt), desc(schema.trailSession.id))
    .limit(FEED_LIMIT);

  // rankFeed re-applies the visibility filter + ordering so the tested helper
  // runs in prod and the page stays correct even if the query drifts.
  const [rankedRows, interestTags] = await Promise.all([
    attachEngagementStats(rankFeed(rows), viewerId),
    loadViewerInterestTags(viewerId),
  ]);
  const viewerTags = new Set(interestTags.map(normalizeTag));

  return rankedRows.map((row) => ({
    ...row,
    isFollowing: row.authorId !== viewerId,
    viewerStackMatches: matchedViewerStackLabels(row, viewerTags),
  }));
}

function toReactionKind(kind: string): ReactionKind | null {
  if (kind === "worked") return "worked";
  if (kind === "needs-tweak") return "needs-tweak";
  if (kind === "broken") return "broken";
  return null;
}

async function attachEngagementStats(
  rows: FeedRowWithoutStats[],
  viewerId: string | null,
): Promise<BaseFeedRow[]> {
  if (rows.length === 0) return [];

  const { db, schema } = await import("@/db/client");
  const sessionIds = rows.map((row) => row.id);
  const [statsRows, commentRows, commentPreviewRows, savedRows, lessonRows] = await Promise.all([
    db
      .select({
        sessionId: schema.sessionReaction.sessionId,
        kind: schema.sessionReaction.kind,
        reactionCount: sql<number>`count(*)::int`,
        viewerReacted: sql<boolean>`coalesce(bool_or(${schema.sessionReaction.userId} = ${viewerId}), false)`,
      })
      .from(schema.sessionReaction)
      .where(inArray(schema.sessionReaction.sessionId, sessionIds))
      .groupBy(schema.sessionReaction.sessionId, schema.sessionReaction.kind),
    db
      .select({
        sessionId: schema.sessionComment.sessionId,
        commentCount: sql<number>`count(*)::int`,
      })
      .from(schema.sessionComment)
      .where(
        and(
          inArray(schema.sessionComment.sessionId, sessionIds),
          isNull(schema.sessionComment.deletedAt),
        ),
      )
      .groupBy(schema.sessionComment.sessionId),
    db
      .select({
        sessionId: schema.sessionComment.sessionId,
        id: schema.sessionComment.id,
        body: schema.sessionComment.body,
        createdAt: schema.sessionComment.createdAt,
        authorName: schema.user.name,
        authorHandle: schema.user.handle,
        authorImage: schema.user.image,
      })
      .from(schema.sessionComment)
      .innerJoin(schema.user, eq(schema.sessionComment.userId, schema.user.id))
      .where(
        and(
          inArray(schema.sessionComment.sessionId, sessionIds),
          isNull(schema.sessionComment.deletedAt),
        ),
      )
      .orderBy(desc(schema.sessionComment.createdAt))
      .limit(sessionIds.length * 3),
    viewerId
      ? db
          .select({ sessionId: schema.savedReceipt.sessionId })
          .from(schema.savedReceipt)
          .where(
            and(
              eq(schema.savedReceipt.userId, viewerId),
              inArray(schema.savedReceipt.sessionId, sessionIds),
            ),
          )
      : Promise.resolve([]),
    db
      .select({
        sessionId: schema.sessionLesson.sessionId,
        title: schema.sessionLesson.title,
        whatToSteal: schema.sessionLesson.whatToSteal,
      })
      .from(schema.sessionLesson)
      .innerJoin(schema.trailSession, eq(schema.sessionLesson.sessionId, schema.trailSession.id))
      .where(
        and(
          inArray(schema.sessionLesson.sessionId, sessionIds),
          eq(schema.trailSession.visibility, "public"),
          isNotNull(schema.trailSession.sharedAt),
          isNull(schema.trailSession.redactedAt),
        ),
      )
      .orderBy(
        desc(schema.sessionLesson.transferabilityScore),
        asc(schema.sessionLesson.lessonIndex),
      ),
  ]);

  const statsBySession = new Map<
    string,
    {
      workedReactions: number;
      verifiedReactions: number;
      tweakReactions: number;
      brokenReactions: number;
      viewerReactions: Set<ReactionKind>;
    }
  >();

  for (const stat of statsRows) {
    const sessionStats = statsBySession.get(stat.sessionId) ?? {
      workedReactions: 0,
      verifiedReactions: 0,
      tweakReactions: 0,
      brokenReactions: 0,
      viewerReactions: new Set<ReactionKind>(),
    };
    const count = Number(stat.reactionCount) || 0;

    if (stat.kind === "worked") sessionStats.workedReactions += count;
    if (stat.kind === "worked-verified") sessionStats.verifiedReactions += count;
    if (stat.kind === "needs-tweak") sessionStats.tweakReactions += count;
    if (stat.kind === "broken") sessionStats.brokenReactions += count;

    const viewerReaction = toReactionKind(stat.kind);
    if (stat.viewerReacted && viewerReaction) sessionStats.viewerReactions.add(viewerReaction);
    statsBySession.set(stat.sessionId, sessionStats);
  }

  const commentsBySession = new Map(
    commentRows.map((row) => [row.sessionId, Number(row.commentCount) || 0]),
  );
  const savedSessionIds = new Set(savedRows.map((row) => row.sessionId));
  const lessonsBySession = new Map<
    string,
    { count: number; title: string | null; whatToSteal: string | null }
  >();
  for (const lesson of lessonRows) {
    const current = lessonsBySession.get(lesson.sessionId);
    lessonsBySession.set(lesson.sessionId, {
      count: (current?.count ?? 0) + 1,
      title: current?.title ?? lesson.title,
      whatToSteal: current?.whatToSteal ?? lesson.whatToSteal,
    });
  }
  const commentPreviewsBySession = new Map<string, FeedCommentPreview[]>();
  for (const comment of commentPreviewRows) {
    const previews = commentPreviewsBySession.get(comment.sessionId) ?? [];
    if (previews.length >= 2) continue;
    previews.push({
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt,
      authorName: comment.authorName,
      authorHandle: comment.authorHandle,
      authorImage: comment.authorImage,
    });
    commentPreviewsBySession.set(comment.sessionId, previews);
  }

  return rows.map((row) => ({
    ...row,
    positiveReactions:
      (statsBySession.get(row.id)?.workedReactions ?? 0) +
      (statsBySession.get(row.id)?.verifiedReactions ?? 0),
    negativeReactions:
      (statsBySession.get(row.id)?.tweakReactions ?? 0) +
      (statsBySession.get(row.id)?.brokenReactions ?? 0),
    workedReactions: statsBySession.get(row.id)?.workedReactions ?? 0,
    verifiedReactions: statsBySession.get(row.id)?.verifiedReactions ?? 0,
    tweakReactions: statsBySession.get(row.id)?.tweakReactions ?? 0,
    brokenReactions: statsBySession.get(row.id)?.brokenReactions ?? 0,
    viewerReactions: Array.from(statsBySession.get(row.id)?.viewerReactions ?? []),
    viewerHasSaved: savedSessionIds.has(row.id),
    lessonCount: lessonsBySession.get(row.id)?.count ?? 0,
    lessonPreviewTitle: lessonsBySession.get(row.id)?.title ?? null,
    lessonPreviewWhatToSteal: lessonsBySession.get(row.id)?.whatToSteal ?? null,
    commentCount: commentsBySession.get(row.id) ?? 0,
    commentPreviews: commentPreviewsBySession.get(row.id) ?? [],
  }));
}

async function loadFeedDiscovery(viewerId: string | null): Promise<FeedDiscovery> {
  const { db } = await import("@/db/client");

  const [statsRes, buildersRes, stacksRes] = await Promise.all([
    db.execute<FeedStatsRaw>(sql`
      SELECT
        count(DISTINCT ts.id) AS receipts,
        count(DISTINCT ts.user_id) AS builders,
        count(DISTINCT ts.id) FILTER (
          WHERE coalesce(ts.receipt_status, ts.outcome) = 'shipped'
        ) AS shipped,
        count(DISTINCT sr.id) AS reactions,
        count(DISTINCT sc.id) FILTER (WHERE sc.deleted_at IS NULL) AS comments
      FROM trail_session ts
      INNER JOIN "user" u ON u.id = ts.user_id
      LEFT JOIN session_reaction sr ON sr.session_id = ts.id
      LEFT JOIN session_comment sc ON sc.session_id = ts.id
      WHERE ts.visibility = 'public'
        AND ts.shared_at IS NOT NULL
        AND u.handle IS NOT NULL
    `),
    db.execute<BuilderRecommendationRaw>(sql`
      SELECT
        u.id,
        u.handle,
        coalesce(u.name, u.handle) AS name,
        u.image,
        u.bio,
        count(DISTINCT ts.id) AS "receiptCount",
        count(DISTINCT ts.id) FILTER (
          WHERE coalesce(ts.receipt_status, ts.outcome) = 'shipped'
        ) AS "shippedCount",
        count(DISTINCT sr.id) AS "reactionCount",
        count(DISTINCT follower.follower_id) AS "followerCount",
        max(coalesce(ts.shared_at, ts.started_at)) AS "latestAt",
        array_remove(array_agg(DISTINCT ts.tool), NULL) AS "topTools",
        coalesce(bool_or(viewer_follow.follower_id IS NOT NULL), false) AS "isFollowing"
      FROM "user" u
      INNER JOIN trail_session ts ON ts.user_id = u.id
      LEFT JOIN session_reaction sr ON sr.session_id = ts.id
      LEFT JOIN "follow" follower ON follower.following_id = u.id
      LEFT JOIN "follow" viewer_follow
        ON viewer_follow.following_id = u.id
       AND viewer_follow.follower_id = ${viewerId}
      WHERE ts.visibility = 'public'
        AND ts.shared_at IS NOT NULL
        AND u.handle IS NOT NULL
        AND (${viewerId}::text IS NULL OR u.id <> ${viewerId})
      GROUP BY u.id
      ORDER BY
        count(DISTINCT ts.id) FILTER (
          WHERE coalesce(ts.receipt_status, ts.outcome) = 'shipped'
        ) DESC,
        count(DISTINCT sr.id) DESC,
        max(coalesce(ts.shared_at, ts.started_at)) DESC
      LIMIT 5
    `),
    db.execute<TrendingStackRaw>(sql`
      SELECT
        st.kind,
        st.tag,
        max(st.label) AS label,
        count(DISTINCT ts.id) AS "receiptCount",
        count(DISTINCT ts.user_id) AS "builderCount"
      FROM session_tag st
      INNER JOIN trail_session ts ON ts.id = st.session_id
      INNER JOIN "user" u ON u.id = ts.user_id
      WHERE ts.visibility = 'public'
        AND ts.shared_at IS NOT NULL
        AND u.handle IS NOT NULL
        AND st.kind IN ('tool', 'framework', 'model')
      GROUP BY st.kind, st.tag
      ORDER BY
        count(DISTINCT ts.id) DESC,
        count(DISTINCT ts.user_id) DESC,
        max(coalesce(ts.shared_at, ts.started_at)) DESC
      LIMIT 8
    `),
  ]);

  const statsRow = rowsOf<FeedStatsRaw>(statsRes)[0];
  const stats: FeedStats = {
    receipts: toCount(statsRow?.receipts),
    builders: toCount(statsRow?.builders),
    shipped: toCount(statsRow?.shipped),
    reactions: toCount(statsRow?.reactions),
    comments: toCount(statsRow?.comments),
  };

  const builders = rowsOf<BuilderRecommendationRaw>(buildersRes).map((builder) => ({
    id: builder.id,
    handle: builder.handle,
    name: builder.name,
    image: builder.image,
    bio: builder.bio,
    receiptCount: toCount(builder.receiptCount),
    shippedCount: toCount(builder.shippedCount),
    reactionCount: toCount(builder.reactionCount),
    followerCount: toCount(builder.followerCount),
    latestAt: builder.latestAt,
    topTools: Array.isArray(builder.topTools) ? builder.topTools.filter(Boolean).slice(0, 3) : [],
    isFollowing: builder.isFollowing === true,
  }));

  const stacks = rowsOf<TrendingStackRaw>(stacksRes).map((stack) => ({
    kind: stack.kind,
    tag: stack.tag,
    label: stack.label ?? formatToolName(stack.tag),
    receiptCount: toCount(stack.receiptCount),
    builderCount: toCount(stack.builderCount),
  }));

  return { stats, builders, stacks };
}

async function loadFeedRadarSignals(): Promise<FeedRadarSignal[]> {
  if (!process.env.DATABASE_URL) return [];

  try {
    const { db } = await import("@/db/client");
    const rows = await db.execute<FeedRadarSignal>(sql`
      SELECT
        id,
        title,
        category,
        source_handle AS "sourceHandle",
        score,
        published_at AS "publishedAt"
      FROM radar_signal
      WHERE status <> 'dismissed'
      ORDER BY score DESC, published_at DESC
      LIMIT 3
    `);
    return rowsOf<FeedRadarSignal>(rows);
  } catch (error) {
    console.error("Failed to load feed radar signals", error);
    return [];
  }
}

async function loadDailyBuilderBrief(
  viewerId: string,
  draftCount: number,
): Promise<DailyBuilderBriefData> {
  const { db } = await import("@/db/client");

  const [summaryRes, lessonsRes] = await Promise.all([
    db.execute<DailyBriefSummaryRaw>(sql`
      SELECT
        (SELECT count(*)::int FROM notification n WHERE n.user_id = ${viewerId} AND n.read_at IS NULL)
          AS "unreadNotifications",
        (SELECT count(*)::int FROM "follow" f WHERE f.follower_id = ${viewerId}) AS "followingCount",
        (
          SELECT count(*)::int
          FROM trail_session ts
          JOIN "follow" f ON f.following_id = ts.user_id
          JOIN "user" u ON u.id = ts.user_id
          WHERE f.follower_id = ${viewerId}
            AND ts.visibility = 'public'
            AND ts.shared_at IS NOT NULL
            AND ts.redacted_at IS NULL
            AND u.handle IS NOT NULL
            AND ts.shared_at >= now() - interval '7 days'
        ) AS "followingReceipts",
        (
          SELECT count(*)::int
          FROM trail_session ts
          WHERE ts.user_id = ${viewerId}
            AND ts.visibility = 'public'
            AND ts.shared_at IS NOT NULL
            AND ts.redacted_at IS NULL
        ) AS "publicReceipts",
        (
          SELECT count(*)::int
          FROM trail_session ts
          WHERE ts.user_id = ${viewerId}
            AND ts.visibility = 'public'
            AND ts.shared_at IS NOT NULL
            AND ts.redacted_at IS NULL
            AND ts.receipt_status = 'shipped'
            AND ts.receipt_verified_at IS NOT NULL
        ) AS "verifiedShips",
        (
          SELECT count(*)::int
          FROM session_lesson sl
          JOIN trail_session ts ON ts.id = sl.session_id
          WHERE ts.user_id = ${viewerId}
            AND ts.visibility = 'public'
            AND ts.shared_at IS NOT NULL
            AND ts.redacted_at IS NULL
        ) AS "extractedLessons",
        (
          SELECT count(*)::int
          FROM saved_lesson saved
          JOIN session_lesson sl ON sl.id = saved.lesson_id
          JOIN trail_session ts ON ts.id = sl.session_id
          WHERE ts.user_id = ${viewerId}
            AND saved.user_id <> ${viewerId}
            AND ts.visibility = 'public'
            AND ts.shared_at IS NOT NULL
            AND ts.redacted_at IS NULL
        ) AS "lessonSaves",
        (
          SELECT count(*)::int
          FROM lesson_reuse used
          JOIN session_lesson sl ON sl.id = used.lesson_id
          JOIN trail_session ts ON ts.id = sl.session_id
          WHERE ts.user_id = ${viewerId}
            AND used.user_id <> ${viewerId}
            AND ts.visibility = 'public'
            AND ts.shared_at IS NOT NULL
            AND ts.redacted_at IS NULL
        ) AS "lessonReuses",
        (
          SELECT count(*)::int
          FROM session_reaction sr
          JOIN trail_session ts ON ts.id = sr.session_id
          WHERE ts.user_id = ${viewerId}
            AND ts.visibility = 'public'
            AND ts.shared_at IS NOT NULL
            AND ts.redacted_at IS NULL
        ) AS reactions,
        (
          SELECT count(*)::int
          FROM session_comment sc
          JOIN trail_session ts ON ts.id = sc.session_id
          WHERE ts.user_id = ${viewerId}
            AND sc.deleted_at IS NULL
            AND ts.visibility = 'public'
            AND ts.shared_at IS NOT NULL
            AND ts.redacted_at IS NULL
        ) AS comments,
        (SELECT count(*)::int FROM "follow" f WHERE f.following_id = ${viewerId}) AS followers
    `),
    db.execute<DailyBriefLessonRaw>(sql`
      WITH viewer_tags AS (
        SELECT lower(tag.value) AS tag
        FROM trail_session ts
        CROSS JOIN LATERAL jsonb_array_elements_text(
          coalesce(ts.frameworks, '[]'::jsonb) ||
          coalesce(ts.tools_used, '[]'::jsonb)
        ) tag(value)
        WHERE ts.user_id = ${viewerId}
        GROUP BY lower(tag.value)
      )
      SELECT
        sl.id,
        sl.title,
        sl.what_to_steal AS "whatToSteal",
        sl.use_when AS "useWhen",
        sl.prompt_pattern AS "promptPattern",
        sl.transferability_score AS "transferabilityScore",
        count(DISTINCT used.id)::int AS "reuseCount",
        coalesce(bool_or(viewer_used.user_id IS NOT NULL), false) AS "usedByViewer",
        ts.slug,
        u.handle,
        ts.tool,
        ts.shared_at AS "sharedAt"
      FROM session_lesson sl
      JOIN trail_session ts ON ts.id = sl.session_id
      JOIN "user" u ON u.id = ts.user_id
      LEFT JOIN lesson_reuse used ON used.lesson_id = sl.id
      LEFT JOIN lesson_reuse viewer_used
        ON viewer_used.lesson_id = sl.id
       AND viewer_used.user_id = ${viewerId}
      WHERE ts.user_id <> ${viewerId}
        AND ts.visibility = 'public'
        AND ts.shared_at IS NOT NULL
        AND ts.redacted_at IS NULL
        AND u.handle IS NOT NULL
      GROUP BY sl.id, ts.slug, u.handle, ts.tool, ts.shared_at
      ORDER BY
        CASE WHEN EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            coalesce(sl.stack, '[]'::jsonb) || coalesce(sl.tags, '[]'::jsonb)
          ) lesson_tag(tag)
          JOIN viewer_tags vt ON vt.tag = lower(lesson_tag.tag)
        ) THEN 0 ELSE 1 END,
        sl.transferability_score DESC,
        count(DISTINCT used.id) DESC,
        sl.generated_at DESC
      LIMIT 3
    `),
  ]);

  const summary = rowsOf<DailyBriefSummaryRaw>(summaryRes)[0];
  const reputation = computeBuilderReputation({
    publicReceipts: toCount(summary?.publicReceipts),
    verifiedShips: toCount(summary?.verifiedShips),
    extractedLessons: toCount(summary?.extractedLessons),
    lessonSaves: toCount(summary?.lessonSaves),
    lessonReuses: toCount(summary?.lessonReuses),
    reactions: toCount(summary?.reactions),
    comments: toCount(summary?.comments),
    followers: toCount(summary?.followers),
  });

  return {
    draftCount,
    unreadNotifications: toCount(summary?.unreadNotifications),
    followingCount: toCount(summary?.followingCount),
    followingReceipts: toCount(summary?.followingReceipts),
    reputation,
    lessons: rowsOf<DailyBriefLessonRaw>(lessonsRes).map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      whatToSteal: lesson.whatToSteal,
      useWhen: lesson.useWhen,
      promptPattern: lesson.promptPattern,
      transferabilityScore: toCount(lesson.transferabilityScore),
      reuseCount: toCount(lesson.reuseCount),
      usedByViewer: lesson.usedByViewer === true,
      slug: lesson.slug,
      handle: lesson.handle,
      tool: lesson.tool,
      sharedAt: lesson.sharedAt,
    })),
  };
}

function FeedTabs({
  followingHref,
  isFollowingView,
}: {
  followingHref: string;
  isFollowingView: boolean;
}) {
  const tabClass =
    "relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-3 text-sm font-medium transition-[background-color,color] hover:bg-zinc-950/80";

  return (
    <div className="grid grid-cols-2 border-t border-zinc-900/80">
      <Link
        href="/feed"
        className={`${tabClass} ${
          isFollowingView ? "text-zinc-500 hover:text-zinc-200" : "text-zinc-50"
        }`}
      >
        <span>For you</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
          Everyone
        </span>
        {!isFollowingView ? (
          <span className="absolute bottom-0 h-1 w-14 rounded-t-full bg-[#a7f300]" />
        ) : null}
      </Link>
      <TrailLink
        href={followingHref}
        className={`${tabClass} ${
          isFollowingView ? "text-zinc-50" : "text-zinc-500 hover:text-zinc-200"
        }`}
      >
        <span>Following</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
          Your graph
        </span>
        {isFollowingView ? (
          <span className="absolute bottom-0 h-1 w-14 rounded-t-full bg-[#a7f300]" />
        ) : null}
      </TrailLink>
    </div>
  );
}

function dailyBriefAction(data: DailyBuilderBriefData): {
  href: string;
  label: string;
  title: string;
  body: string;
} {
  if (data.draftCount > 0) {
    return {
      href: "#feed-composer",
      label: "Publish",
      title: "Ship one receipt today",
      body: `${pluralize(data.draftCount, "draft")} can become public proof from the composer below.`,
    };
  }

  if (data.unreadNotifications > 0) {
    return {
      href: "/notifications",
      label: "Open inbox",
      title: "Answer the network",
      body: `${pluralize(data.unreadNotifications, "unread signal")} waiting: replies, follows, reactions, or lessons used.`,
    };
  }

  const firstLesson = data.lessons[0];
  if (firstLesson) {
    return {
      href: `/learn#lesson-${firstLesson.id}`,
      label: "Steal move",
      title: "Steal one proven move",
      body: "Mark a lesson used when it helps your own work. That is the habit loop.",
    };
  }

  if (data.followingCount === 0) {
    return {
      href: "/discover",
      label: "Follow builders",
      title: "Build your graph",
      body: "Follow a few builders so Following becomes a useful daily stream.",
    };
  }

  return {
    href: "/learn",
    label: "Read lessons",
    title: "Find one move to reuse",
    body: "Search the playbook for the stack or bug you are working on today.",
  };
}

function DailyBuilderBriefSkeleton() {
  return (
    <section className="border-b border-zinc-900 px-4 py-4 sm:px-5">
      <div className="h-48 animate-pulse rounded-[28px] border border-zinc-900 bg-zinc-950/75" />
    </section>
  );
}

async function DailyBuilderBrief({
  viewer,
  draftCount,
}: {
  viewer: FeedComposerViewer | null;
  draftCount: number;
}) {
  if (!viewer?.id) return null;

  const data = await loadDailyBuilderBrief(viewer.id, draftCount);
  const action = dailyBriefAction(data);
  const stats = [
    { label: "Ship", value: formatCount(data.draftCount), detail: "ready drafts" },
    { label: "Read", value: formatCount(data.followingReceipts), detail: "followed this week" },
    { label: "Notifications", value: formatCount(data.unreadNotifications), detail: "unread" },
    { label: "Signal", value: formatCount(data.reputation.score), detail: data.reputation.label },
  ];

  return (
    <section className="border-b border-zinc-900 px-4 py-4 sm:px-5">
      <div className="overflow-hidden rounded-[28px] border border-[#a7f300]/25 bg-[radial-gradient(circle_at_12%_0%,rgba(167,243,0,0.16),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01)),#080908] shadow-[0_24px_90px_rgba(0,0,0,0.35)]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="p-4 sm:p-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#a7f300]">
              Today on Trail
            </div>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-[24px] font-semibold tracking-[-0.055em] text-white">
                  {action.title}
                </h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-zinc-400">{action.body}</p>
              </div>
              <Link
                href={action.href}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full bg-[#a7f300] px-4 font-mono text-[11px] uppercase tracking-[0.14em] text-black transition-[background-color,transform] hover:bg-[#c8ff5e] active:scale-[0.96]"
              >
                {action.label}
              </Link>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-white/10 bg-black/30 p-3"
                >
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                    {stat.label}
                  </div>
                  <div className="mt-1 font-mono text-lg text-zinc-100 tabular-nums">
                    {stat.value}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-zinc-500">{stat.detail}</div>
                </div>
              ))}
            </div>

            <p className="mt-4 text-[12px] leading-5 text-zinc-500">
              Builder signal: {data.reputation.summary}. Trail gets useful when you read one
              receipt, steal one move, ship one receipt, and answer one signal.
            </p>
          </div>

          <div className="border-t border-white/10 bg-black/25 p-4 lg:border-l lg:border-t-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-amber-100/70">
              Moves to steal
            </div>
            <div className="mt-3 space-y-3">
              {data.lessons.length > 0 ? (
                data.lessons.map((lesson) => (
                  <div
                    key={lesson.id}
                    className="rounded-2xl border border-white/10 bg-black/30 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                      <span className="text-[#a7f300]">{lesson.transferabilityScore}/5</span>
                      <span>@{lesson.handle}</span>
                      <span>{formatToolName(lesson.tool)}</span>
                    </div>
                    <Link href={`/learn#lesson-${lesson.id}`} className="mt-2 block">
                      <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-zinc-100 transition hover:text-[#a7f300]">
                        {lesson.title}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-zinc-500">
                        {lesson.whatToSteal}
                      </p>
                    </Link>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <UseLessonButton
                        lessonId={lesson.id}
                        initialUsed={lesson.usedByViewer}
                        signedIn={true}
                        signInHref={signInHref("/feed")}
                        className="min-h-8 px-2.5 text-[10px]"
                        refreshOnChange={true}
                      />
                      <Link
                        href={`/u/${lesson.handle}/${lesson.slug}#lessons`}
                        className="inline-flex min-h-8 items-center rounded-full border border-zinc-800 px-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400 transition hover:border-[#a7f300]/50 hover:text-[#a7f300]"
                      >
                        Proof
                      </Link>
                      {lesson.reuseCount > 0 ? (
                        <span className="inline-flex min-h-8 items-center rounded-full px-2.5 font-mono text-[10px] text-zinc-600">
                          {formatCount(lesson.reuseCount)} used
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-zinc-800 bg-black/20 p-3 text-sm leading-6 text-zinc-500">
                  Publish or follow more builders and Trail will recommend specific moves to reuse.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeedNavRail({
  followingHref,
  isFollowingView,
  viewerId,
}: {
  followingHref: string;
  isFollowingView: boolean;
  viewerId: string | null;
}) {
  const notificationsHref = viewerId ? "/notifications" : signInHref("/notifications");
  const publishHref = viewerId ? "/dashboard" : "/install";
  const navItems = [
    {
      href: "/feed",
      label: "Today",
      detail: "Read / steal / ship",
      active: !isFollowingView,
    },
    {
      href: followingHref,
      label: "Following",
      detail: "Builders you track",
      active: isFollowingView,
    },
    {
      href: "/radar",
      label: "Radar",
      detail: "AI signals to test",
      active: false,
    },
    {
      href: notificationsHref,
      label: "Notifications",
      detail: "Replies and reactions",
      active: false,
    },
    {
      href: "/tools",
      label: "Explore",
      detail: "Tools, stacks, builders",
      active: false,
    },
  ];

  return (
    <div className="sticky top-20 flex min-h-[calc(100vh-5rem)] flex-col justify-between py-6">
      <div>
        <Link href="/" className="inline-flex items-center gap-2 px-3 font-mono text-sm">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#a7f300] text-black shadow-[0_0_24px_rgba(167,243,0,0.18)]">
            /
          </span>
          <span className="text-zinc-100">trail</span>
        </Link>

        <nav className="mt-8 space-y-1.5">
          {navItems.map((item) => (
            <TrailLink
              key={item.label}
              href={item.href}
              className={`group block rounded-[20px] px-4 py-3 transition-[background-color,color] ${
                item.active
                  ? "bg-zinc-100 text-zinc-950"
                  : "text-zinc-400 hover:bg-zinc-950/72 hover:text-zinc-100"
              }`}
            >
              <span className="block text-[17px] font-medium tracking-[-0.025em]">
                {item.label}
              </span>
              <span
                className={`mt-1 block text-[12px] leading-4 ${
                  item.active ? "text-zinc-600" : "text-zinc-600 group-hover:text-zinc-500"
                }`}
              >
                {item.detail}
              </span>
            </TrailLink>
          ))}
        </nav>

        <TrailLink
          href={publishHref}
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#a7f300] px-5 font-mono text-[11px] uppercase tracking-[0.14em] text-black transition-[background-color,transform] hover:bg-[#c8ff5e] active:scale-[0.96]"
        >
          Publish receipt
        </TrailLink>
      </div>

      <div className="rounded-[22px] bg-zinc-950/70 p-4 text-sm leading-6 text-zinc-500 shadow-[var(--trail-shadow-border)]">
        Daily loop: read one receipt, steal one move, publish one proof, answer one signal.
      </div>
    </div>
  );
}

function NetworkPulse({ stats }: { stats: FeedStats }) {
  const items = [
    ["Builders", formatCount(stats.builders)],
    ["Receipts", formatCount(stats.receipts)],
    ["Shipped", formatCount(stats.shipped)],
    ["Reactions", formatCount(stats.reactions)],
    ["Comments", formatCount(stats.comments)],
  ];

  return (
    <section className="rounded-[24px] bg-zinc-950/82 p-4 shadow-[var(--trail-shadow-border)]">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#a7f300]">
        Network pulse
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-black/55 px-3 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600">
              {label}
            </div>
            <div className="mt-1 font-mono text-sm text-zinc-100 tabular-nums">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeedPostCard({ row: r, viewerId }: { row: FeedRow; viewerId: string | null }) {
  const authorHref = profileHref(r);
  const currentReceiptHref = receiptHref(r);
  const forkHref = `${currentReceiptHref}/fork`;
  const displayName = r.name || r.handle || "Trail builder";
  const handleLabel = r.handle ? `@${r.handle}` : "anonymous";
  const repoLabel = r.linkedRepo ?? r.repo;
  const badge = receiptBadge(r);
  const chips = stackChips(r);
  const metrics = timelineMetrics(r);
  const currentPublicReceiptUrl = publicReceiptUrl(r);
  const tweetHref = tweetIntent(
    `${displayName} published a Trail receipt from ${formatToolName(r.tool)}.`,
    currentPublicReceiptUrl,
  );
  const reason = feedReason(r);
  const socialProof = [
    r.commentCount > 0 ? pluralize(r.commentCount, "comment") : null,
    r.positiveReactions + r.negativeReactions > 0 ? reactionSummary(r) : null,
  ].filter(Boolean);

  return (
    <article className="group grid grid-cols-[44px_minmax(0,1fr)] gap-3 px-4 py-5 transition-[background-color] hover:bg-zinc-950/55 sm:grid-cols-[52px_minmax(0,1fr)] sm:px-5">
      <Link
        href={authorHref}
        className="mt-1 inline-flex h-11 w-11 items-center justify-center rounded-full transition-transform group-hover:scale-[1.03] active:scale-[0.96] sm:h-12 sm:w-12"
        aria-label={`Open ${handleLabel}'s profile`}
      >
        <Avatar
          src={avatarSrc(r)}
          alt={displayName}
          size={48}
          fallback={r.handle ?? displayName}
          className="border-zinc-700 bg-black shadow-[0_0_0_3px_rgba(255,255,255,0.03)]"
        />
      </Link>

      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link
                href={authorHref}
                className="max-w-[180px] truncate text-[15px] font-semibold tracking-[-0.02em] text-zinc-100 transition-colors hover:text-white sm:max-w-[240px]"
              >
                {displayName}
              </Link>
              <Link
                href={authorHref}
                className="font-mono text-[12px] text-zinc-500 transition-colors hover:text-zinc-300"
              >
                {handleLabel}
              </Link>
              <span className="text-zinc-700">·</span>
              <RelativeTime
                date={r.sharedAt ?? r.startedAt}
                className="font-mono text-[12px] text-zinc-500 tabular-nums"
              />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-zinc-500">
              <span>published a receipt</span>
              <span className="text-zinc-700">·</span>
              <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.1em] text-zinc-500">
                <ToolIcon name={r.tool} size={12} className="text-[#a7f300]" />
                {formatToolName(r.tool)}
              </span>
              {badge ? (
                <>
                  <span className="text-zinc-700">·</span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#a7f300]">
                    {badge}
                  </span>
                </>
              ) : null}
            </div>
          </div>

          {viewerId && viewerId !== r.authorId ? (
            <FollowButton
              targetUserId={r.authorId}
              initialFollowing={r.isFollowing}
              className="h-8 shrink-0 px-3 text-[10px]"
            />
          ) : !viewerId ? (
            <TrailLink
              href={signInHref(authorHref)}
              className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-zinc-800 px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-300 transition-[border-color,color,transform] hover:border-[#a7f300] hover:text-[#a7f300] active:scale-[0.96]"
            >
              Follow
            </TrailLink>
          ) : null}
        </div>

        <Link href={currentReceiptHref} className="mt-3 block">
          <h3 className="break-words text-pretty text-[17px] font-medium leading-6 tracking-[-0.02em] text-zinc-100 transition-colors group-hover:text-white">
            {r.title ?? r.slug}
          </h3>
          {r.summary ? (
            <p className="mt-2 line-clamp-4 break-words text-pretty text-[14px] leading-6 text-zinc-400">
              {r.summary}
            </p>
          ) : null}

          <div className="mt-4 rounded-[22px] bg-zinc-950/58 px-4 py-3 shadow-[var(--trail-shadow-border)] transition-[box-shadow] group-hover:shadow-[var(--trail-shadow-border-hover)]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
                Proof
              </div>
              <div className="flex flex-wrap gap-1.5">
                {chips.map((chip) => (
                  <span
                    key={chip}
                    className="inline-flex min-h-7 items-center rounded-full bg-black/55 px-2.5 font-mono text-[10px] text-zinc-400 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {metrics.map((metric) => (
                <div key={metric.label} className="rounded-full bg-black/45 px-3 py-1.5">
                  <div className="inline font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                    {metric.label}
                  </div>
                  <div className="ml-2 inline font-mono text-[11px] text-zinc-200 tabular-nums">
                    {metric.value}
                  </div>
                </div>
              ))}
              {repoLabel ? (
                <div className="min-w-0 rounded-full bg-black/45 px-3 py-1.5">
                  <div className="inline font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                    Repo
                  </div>
                  <div className="ml-2 inline font-mono text-[11px] text-zinc-200">{repoLabel}</div>
                </div>
              ) : null}
            </div>
          </div>
        </Link>

        {r.lessonCount > 0 ? (
          <Link
            href={`${currentReceiptHref}#lessons`}
            className="mt-3 block rounded-[22px] bg-[#a7f300]/[0.045] px-4 py-3 shadow-[0_0_0_1px_rgba(167,243,0,0.14)] transition-[background-color,box-shadow] hover:bg-[#a7f300]/[0.065] hover:shadow-[0_0_0_1px_rgba(167,243,0,0.28)]"
          >
            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#a7f300]">
              <span>Steal this move</span>
              <span className="text-lime-100/45">{pluralize(r.lessonCount, "lesson")}</span>
              {r.lessonPreviewTitle ? (
                <span className="text-lime-100/45">{r.lessonPreviewTitle}</span>
              ) : null}
            </div>
            {r.lessonPreviewWhatToSteal ? (
              <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-lime-50/75">
                {r.lessonPreviewWhatToSteal}
              </p>
            ) : null}
          </Link>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em]">
          <span className="rounded-full bg-zinc-950/70 px-2.5 py-1 text-zinc-400 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
            {reason}
          </span>
          {socialProof.length > 0 ? (
            <span className="text-zinc-600">{socialProof.join(" · ")}</span>
          ) : null}
        </div>

        {r.commentPreviews.length > 0 ? (
          <Link
            href={`${currentReceiptHref}#conversation`}
            className="mt-3 block overflow-hidden rounded-[22px] border border-zinc-900 bg-zinc-950/55 transition-[border-color,background-color] hover:border-zinc-800 hover:bg-zinc-950"
          >
            <div className="border-b border-zinc-900 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
              Thread preview
            </div>
            <div className="divide-y divide-zinc-900/80">
              {r.commentPreviews
                .slice()
                .reverse()
                .map((comment) => (
                  <div
                    className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 px-4 py-3"
                    key={comment.id}
                  >
                    <Avatar
                      src={commentAvatarSrc(comment)}
                      alt={comment.authorName}
                      size={28}
                      fallback={comment.authorHandle ?? comment.authorName}
                      className="border-zinc-800 bg-black"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[12px] font-semibold text-zinc-200">
                          {comment.authorName}
                        </span>
                        <RelativeTime
                          date={comment.createdAt}
                          className="font-mono text-[10px] text-zinc-600"
                        />
                      </div>
                      <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-zinc-400">
                        {comment.body}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
            <div className="border-t border-zinc-900 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#a7f300]">
              Join the thread →
            </div>
          </Link>
        ) : null}

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ReactionBar
            slug={r.slug}
            authorHandle={r.handle}
            variant="inline"
            initialCounts={{
              worked: r.workedReactions + r.verifiedReactions,
              "needs-tweak": r.tweakReactions,
              broken: r.brokenReactions,
            }}
            initialMine={r.viewerReactions}
            className="flex-1"
          />

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Link
              href={`${currentReceiptHref}#conversation`}
              className="inline-flex min-h-9 items-center rounded-full border border-transparent px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-500 transition-[background-color,color,transform] hover:bg-zinc-900 hover:text-amber-100 active:scale-[0.96]"
            >
              Reply {r.commentCount > 0 ? formatCount(r.commentCount) : ""}
            </Link>
            <SaveReceiptButton
              sessionId={r.id}
              initialSaved={r.viewerHasSaved}
              signedIn={viewerId !== null}
              signInHref={signInHref(currentReceiptHref)}
              className="border-transparent"
            />
            <CopyButton
              value={currentPublicReceiptUrl}
              label="Copy"
              copiedLabel="Copied"
              className="min-h-9 rounded-full border-transparent bg-transparent px-3 text-[11px] text-zinc-500 hover:bg-zinc-900 hover:text-zinc-100"
            />
            <Link
              href={forkHref}
              className="inline-flex min-h-9 items-center rounded-full px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-500 transition-[background-color,color,transform] hover:bg-zinc-900 hover:text-amber-100 active:scale-[0.96]"
            >
              Fork
            </Link>
            <a
              href={tweetHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-9 items-center rounded-full px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-500 transition-[background-color,color,transform] hover:bg-zinc-900 hover:text-[#a7f300] active:scale-[0.96]"
            >
              Share
            </a>
            <Link
              href={currentReceiptHref}
              className="inline-flex min-h-10 items-center rounded-full bg-zinc-100 px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-black transition-[background-color,transform] hover:bg-[#a7f300] active:scale-[0.96]"
            >
              Open
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function EmptyTimeline({
  isFollowingView,
  recommendations,
  viewerId,
}: {
  isFollowingView: boolean;
  recommendations: BuilderRecommendation[];
  viewerId: string | null;
}) {
  const builders = recommendations.filter((builder) => !builder.isFollowing).slice(0, 3);

  return (
    <div className="px-6 py-16 text-center">
      {isFollowingView ? (
        <div className="mx-auto max-w-xl">
          <p className="text-pretty text-sm leading-relaxed text-zinc-400">
            Your Following timeline is empty. Follow a few builders and this becomes your live proof
            stream instead of a blank tab.
          </p>
          {builders.length > 0 ? (
            <div className="mt-6 grid gap-3 text-left">
              {builders.map((builder) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-900 bg-zinc-950/70 p-3"
                  key={builder.id}
                >
                  <Link className="flex min-w-0 items-center gap-3" href={`/u/${builder.handle}`}>
                    <Avatar
                      src={builder.image ?? githubAvatar(builder.handle)}
                      alt={builder.name}
                      fallback={builder.handle}
                      className="h-10 w-10 rounded-full"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-zinc-100">
                        {builder.name}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-zinc-600">
                        {formatCount(builder.receiptCount)} receipts · @{builder.handle}
                      </span>
                    </span>
                  </Link>
                  {viewerId ? (
                    <FollowButton
                      targetUserId={builder.id}
                      initialFollowing={builder.isFollowing}
                      className="h-8 px-3 text-[10px]"
                    />
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm leading-relaxed text-zinc-500">
              Browse{" "}
              <Link href="/tools" className="text-[#a7f300] hover:underline">
                AI tools
              </Link>{" "}
              to find people shipping in your stack.
            </p>
          )}
        </div>
      ) : (
        <p className="mx-auto max-w-xl text-pretty text-sm leading-relaxed text-zinc-400">
          No public sessions yet. Install Trail and share one with{" "}
          <span className="font-mono text-zinc-200">trail share latest</span>.
        </p>
      )}
    </div>
  );
}

function PersonalizationNudge({
  builders,
  stacks,
  viewerId,
  personalization,
  draftCount,
}: {
  builders: BuilderRecommendation[];
  stacks: TrendingStack[];
  viewerId: string | null;
  personalization: FeedPersonalization;
  draftCount: number;
}) {
  if (!viewerId) return null;
  const recommendations = builders.filter((builder) => !builder.isFollowing).slice(0, 3);
  const stackSuggestions = stacks.slice(0, 5);
  const needsSetup =
    personalization.followingCount < 3 ||
    personalization.publicReceiptCount === 0 ||
    personalization.usedLessonCount === 0 ||
    personalization.topTags.length === 0 ||
    personalization.unreadNotifications > 0;
  if (!needsSetup && recommendations.length === 0 && stackSuggestions.length === 0) return null;

  const setupItems = [
    {
      label: "Follow",
      value: `${Math.min(personalization.followingCount, 3)}/3`,
      body: "seed your graph",
      done: personalization.followingCount >= 3,
      href: "/discover",
    },
    {
      label: "Stacks",
      value:
        personalization.topTags.length > 0
          ? personalization.topTags.slice(0, 2).map(formatToolName).join(" + ")
          : "pick one",
      body: "teach For you",
      done: personalization.topTags.length > 0,
      href: stackSuggestions[0] ? stackHref(stackSuggestions[0]) : "/tools",
    },
    {
      label: "Lessons",
      value:
        personalization.usedLessonCount > 0
          ? `${formatCount(personalization.usedLessonCount)} used`
          : "0 used",
      body: "steal a move",
      done: personalization.usedLessonCount > 0,
      href: "/learn",
    },
    {
      label: "Proof",
      value:
        personalization.publicReceiptCount > 0
          ? `${formatCount(personalization.publicReceiptCount)} live`
          : draftCount > 0
            ? `${formatCount(draftCount)} draft`
            : "publish",
      body: "ship receipt",
      done: personalization.publicReceiptCount > 0,
      href: draftCount > 0 ? "#feed-composer" : "/install",
    },
    {
      label: "Notifications",
      value:
        personalization.unreadNotifications > 0
          ? `${formatCount(personalization.unreadNotifications)} unread`
          : "clear",
      body: "answer signals",
      done: personalization.unreadNotifications === 0,
      href: "/notifications",
    },
  ];

  return (
    <section className="border-b border-zinc-900 px-4 py-4 sm:px-5">
      <div className="overflow-hidden rounded-[26px] border border-zinc-900 bg-[linear-gradient(135deg,rgba(167,243,0,0.08),transparent_46%),#09090b]">
        <div className="border-b border-zinc-900 px-4 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#a7f300]">
            Personalize Trail
          </div>
          <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.04em] text-zinc-50">
            Make the daily feed feel like it was built for you.
          </h2>
          <p className="mt-1 text-sm leading-6 text-zinc-500">
            Trail learns from who you follow, what stacks you ship with, lessons you reuse, and
            notifications you answer. Your notifications live in the top nav and at{" "}
            <Link href="/notifications" className="text-[#a7f300] hover:underline">
              /notifications
            </Link>
            .
          </p>
        </div>
        <div className="grid gap-px bg-zinc-900 md:grid-cols-5">
          {setupItems.map((item) => (
            <Link
              href={item.href}
              key={item.label}
              className="group bg-black/65 p-4 transition-colors hover:bg-zinc-950"
            >
              <div
                className={`inline-flex min-h-6 items-center rounded-full px-2 font-mono text-[10px] uppercase tracking-[0.12em] ${
                  item.done ? "bg-[#a7f300] text-black" : "bg-zinc-900 text-zinc-500"
                }`}
              >
                {item.done ? "done" : "next"}
              </div>
              <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
                {item.label}
              </div>
              <div className="mt-1 truncate text-[15px] font-semibold tracking-[-0.03em] text-zinc-100 group-hover:text-[#a7f300]">
                {item.value}
              </div>
              <div className="mt-1 text-[12px] leading-5 text-zinc-500">{item.body}</div>
            </Link>
          ))}
        </div>

        {recommendations.length > 0 ? (
          <div className="grid divide-y divide-zinc-900 md:grid-cols-3 md:divide-x md:divide-y-0">
            {recommendations.map((builder) => (
              <div className="p-4" key={builder.id}>
                <Link className="flex items-center gap-3" href={`/u/${builder.handle}`}>
                  <Avatar
                    src={builder.image ?? githubAvatar(builder.handle)}
                    alt={builder.name}
                    fallback={builder.handle}
                    className="h-10 w-10 rounded-full"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-zinc-100">
                      {builder.name}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-zinc-600">
                      @{builder.handle}
                    </span>
                  </span>
                </Link>
                <div className="mt-3 text-[12px] leading-5 text-zinc-500">
                  {formatCount(builder.shippedCount)} shipped receipts ·{" "}
                  {formatCount(builder.followerCount)} followers
                </div>
                <FollowButton
                  targetUserId={builder.id}
                  initialFollowing={builder.isFollowing}
                  className="mt-3 h-8 px-3 text-[10px]"
                />
              </div>
            ))}
          </div>
        ) : null}

        {stackSuggestions.length > 0 ? (
          <div className="border-t border-zinc-900 px-4 py-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
              Browse stacks to follow the work you care about
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {stackSuggestions.map((stack) => (
                <Link
                  href={stackHref(stack)}
                  key={`${stack.kind}:${stack.tag}`}
                  className="inline-flex min-h-8 items-center rounded-full border border-zinc-800 px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-300 transition hover:border-[#a7f300]/60 hover:text-[#a7f300]"
                >
                  {stack.label}
                  <span className="ml-2 text-zinc-600">{formatCount(stack.receiptCount)}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FeedDiscoveryPanel({
  discovery,
  radarSignals,
  viewerId,
}: {
  discovery: FeedDiscovery;
  radarSignals: FeedRadarSignal[];
  viewerId: string | null;
}) {
  return (
    <div className="space-y-4">
      <Link
        href="/tools"
        className="group block rounded-full bg-zinc-950 px-4 py-3 text-sm text-zinc-500 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] transition-[box-shadow,color] hover:text-zinc-200 hover:shadow-[0_0_0_1px_rgba(167,243,0,0.18)]"
      >
        <span className="font-mono text-[11px] uppercase tracking-[0.14em]">
          Search builders, tools, receipts
        </span>
        <span className="float-right text-[#a7f300] transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </Link>

      <NetworkPulse stats={discovery.stats} />

      <section className="overflow-hidden rounded-[26px] bg-zinc-950 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
        <div className="flex items-center justify-between gap-4 border-b border-zinc-900 px-4 py-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#a7f300]">
              AI Radar
            </div>
            <h3 className="mt-1 text-[20px] font-semibold tracking-[-0.04em] text-zinc-50">
              Signals to test
            </h3>
          </div>
          <Link
            href="/radar"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#a7f300] transition-colors hover:text-[#c8ff5e]"
          >
            Open
          </Link>
        </div>

        {radarSignals.length === 0 ? (
          <div className="px-4 py-5">
            <p className="text-sm leading-6 text-zinc-500">
              Radar fills from curated X sources via the local xurl fetcher. No pasted URLs needed.
            </p>
            <Link
              href="/radar"
              className="mt-3 inline-flex min-h-8 items-center rounded-full border border-zinc-800 px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-300 transition hover:border-[#a7f300]/50 hover:text-[#a7f300]"
            >
              View radar
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-zinc-900">
            {radarSignals.map((signal) => (
              <Link
                key={signal.id}
                href={`/radar?category=${signal.category}`}
                className="group block px-4 py-4 transition-colors hover:bg-black/45"
              >
                <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                  <span className="text-[#a7f300]">{radarCategoryLabel(signal.category)}</span>
                  <span>@{signal.sourceHandle}</span>
                  <span>
                    <RelativeTime date={signal.publishedAt} />
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm font-medium leading-5 text-zinc-200 group-hover:text-white">
                  {signal.title}
                </p>
                <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-100/60">
                  Needs Trail receipts
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-[26px] bg-zinc-950 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
        <div className="border-b border-zinc-900 px-4 py-4">
          <h3 className="text-[20px] font-semibold tracking-[-0.04em] text-zinc-50">
            Who to follow
          </h3>
        </div>

        {discovery.builders.length === 0 ? (
          <p className="px-4 py-5 text-sm leading-6 text-zinc-500">
            Fresh builder recommendations appear here as more public receipts are published.
          </p>
        ) : (
          <div className="divide-y divide-zinc-900">
            {discovery.builders.map((builder) => (
              <div key={builder.id} className="px-4 py-4 transition-colors hover:bg-black/45">
                <div className="flex items-start gap-3">
                  <Link href={`/u/${builder.handle}`} className="shrink-0">
                    <Avatar
                      src={builder.image ?? githubAvatar(builder.handle)}
                      alt={builder.name}
                      fallback={builder.handle}
                      className="h-10 w-10 rounded-full shadow-[0_0_0_1px_rgba(255,255,255,0.12)]"
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/u/${builder.handle}`} className="min-w-0">
                        <div className="truncate text-[15px] font-medium tracking-[-0.02em] text-zinc-100">
                          {builder.name}
                        </div>
                        <div className="truncate font-mono text-[11px] text-zinc-600">
                          @{builder.handle}
                        </div>
                      </Link>
                      {viewerId ? (
                        <FollowButton
                          targetUserId={builder.id}
                          initialFollowing={builder.isFollowing}
                          className="h-8 px-3 text-[10px]"
                        />
                      ) : (
                        <TrailLink
                          href={signInHref(`/u/${builder.handle}`)}
                          className="inline-flex h-8 items-center rounded-full bg-zinc-100 px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-950 transition-[background-color,transform] hover:bg-[#a7f300] active:scale-[0.96]"
                        >
                          Follow
                        </TrailLink>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-zinc-500">
                      {builder.bio ||
                        `${formatCount(builder.shippedCount)} shipped receipts in public.`}
                    </p>
                    <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.11em] text-zinc-600">
                      {formatCount(builder.receiptCount)} receipts ·{" "}
                      {builder.latestAt ? <RelativeTime date={builder.latestAt} /> : "recent"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-[26px] bg-zinc-950 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
        <div className="flex items-center justify-between gap-4 border-b border-zinc-900 px-4 py-4">
          <h3 className="text-[20px] font-semibold tracking-[-0.04em] text-zinc-50">
            Trending now
          </h3>
          <Link
            href="/tools"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#a7f300] transition-colors hover:text-[#c8ff5e]"
          >
            Explore
          </Link>
        </div>

        {discovery.stacks.length === 0 ? (
          <p className="px-4 py-5 text-sm leading-6 text-zinc-500">
            Stack trends will fill in as published receipts are tagged.
          </p>
        ) : (
          <div className="divide-y divide-zinc-900">
            {discovery.stacks.map((stack) => (
              <Link
                key={`${stack.kind}:${stack.tag}`}
                href={stackHref(stack)}
                className="group block px-4 py-4 transition-colors hover:bg-black/45"
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                  {stack.kind} · {formatCount(stack.builderCount)} builders
                </div>
                <div className="mt-1 flex items-center justify-between gap-4">
                  <div className="truncate text-[15px] font-medium tracking-[-0.02em] text-zinc-200">
                    {stack.label}
                  </div>
                  <div className="font-mono text-[11px] text-zinc-600 tabular-nums group-hover:text-[#a7f300]">
                    {formatCount(stack.receiptCount)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-[26px] bg-zinc-950 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
        <div className="border-b border-zinc-900 px-4 py-4">
          <h3 className="text-[20px] font-semibold tracking-[-0.04em] text-zinc-50">Explore</h3>
        </div>
        <div className="divide-y divide-zinc-900">
          {discoveryLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group block px-4 py-4 transition-colors hover:bg-black/45"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-200">
                  {link.label}
                </span>
                <span className="text-[#a7f300] transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </div>
              <p className="mt-2 text-pretty text-[12px] leading-[1.55] text-zinc-500">
                {link.detail}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-[26px] bg-zinc-950 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#a7f300]">
          How Trail works
        </div>
        <div className="mt-4 space-y-3">
          {onboardingSteps.map((step) => (
            <div key={step.n} className="grid grid-cols-[28px_1fr] gap-3">
              <span className="font-mono text-[11px] text-zinc-600 tabular-nums">{step.n}</span>
              <div>
                <div className="text-sm font-medium tracking-tight text-zinc-100">{step.title}</div>
                <p className="mt-1 text-pretty text-[12px] leading-relaxed text-zinc-500">
                  {step.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<FeedSearchParams>;
}) {
  const sp = await searchParams;
  const view = normalizeFeedView(sp.view);

  let rows: FeedRow[];
  let discovery: FeedDiscovery;
  let radarSignals: FeedRadarSignal[];
  let composerDrafts: FeedComposerDraft[];
  let personalization: FeedPersonalization;

  const viewer = await loadViewer();
  const viewerId = viewer?.id ?? null;
  if (view === "following") {
    if (!viewerId) redirect(FOLLOWING_SIGN_IN_HREF);
    [rows, discovery, radarSignals, composerDrafts, personalization] = await Promise.all([
      loadFollowingFeed(viewerId),
      loadFeedDiscovery(viewerId),
      loadFeedRadarSignals(),
      loadComposerDrafts(viewerId),
      loadFeedPersonalization(viewerId),
    ]);
  } else {
    [rows, discovery, radarSignals, composerDrafts, personalization] = await Promise.all([
      loadPublicFeed(viewerId),
      loadFeedDiscovery(viewerId),
      loadFeedRadarSignals(),
      loadComposerDrafts(viewerId),
      loadFeedPersonalization(viewerId),
    ]);
  }

  const isFollowingView = view === "following";
  const followingHref = viewerId ? "/feed?view=following" : FOLLOWING_SIGN_IN_HREF;
  const subtitle = isFollowingView
    ? "Read the builders you follow, steal one move, and reply while the thread is warm."
    : "Read what shipped, steal reusable moves, follow useful builders, then publish your own proof.";
  const feedTitle = isFollowingView ? "Following" : "Today";
  const feedCountLabel = `${rows.length} ${rows.length === 1 ? "receipt" : "receipts"}`;

  return (
    <div className="min-h-screen bg-black text-zinc-50">
      <SiteNav currentPath="/feed" />

      <main className="min-h-[calc(100vh-3.5rem)] w-full bg-[radial-gradient(circle_at_10%_0%,rgba(167,243,0,0.045),transparent_24%),linear-gradient(180deg,rgba(24,24,27,0.24),rgba(0,0,0,0)_220px)]">
        <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-[208px_minmax(0,1fr)] lg:gap-6 lg:px-4 xl:grid-cols-[208px_minmax(0,680px)_320px] xl:gap-8">
          <aside className="hidden lg:block">
            <FeedNavRail
              followingHref={followingHref}
              isFollowingView={isFollowingView}
              viewerId={viewerId}
            />
          </aside>

          <section className="min-w-0 border-x border-zinc-900/80 bg-black/72 lg:min-h-[calc(100vh-3.5rem)]">
            <div className="border-b border-zinc-900/90 bg-black/86 shadow-[0_10px_30px_rgba(0,0,0,0.24)] backdrop-blur-xl md:sticky md:top-14 md:z-30">
              <div className="flex items-start justify-between gap-4 px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#a7f300]">
                    Trail social
                  </div>
                  <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.055em] text-zinc-50">
                    {feedTitle}
                  </h1>
                  <p className="mt-1 max-w-xl text-pretty text-[13px] leading-5 text-zinc-500">
                    {subtitle}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-zinc-950/75 px-3 py-2 font-mono text-[11px] text-zinc-500 tabular-nums shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
                  {feedCountLabel}
                </span>
              </div>
              <FeedTabs followingHref={followingHref} isFollowingView={isFollowingView} />
            </div>

            <div id="feed-composer" className="border-b border-zinc-900/90 px-4 py-4 sm:px-5">
              <FeedComposer viewer={viewer} drafts={composerDrafts} />
            </div>

            {viewerId ? (
              <Suspense fallback={<DailyBuilderBriefSkeleton />}>
                <DailyBuilderBrief viewer={viewer} draftCount={composerDrafts.length} />
              </Suspense>
            ) : null}

            {!isFollowingView ? (
              <PersonalizationNudge
                builders={discovery.builders}
                stacks={discovery.stacks}
                viewerId={viewerId}
                personalization={personalization}
                draftCount={composerDrafts.length}
              />
            ) : null}

            {!viewerId && !isFollowingView ? (
              <div className="border-b border-zinc-900 px-4 py-4 sm:px-5">
                <div className="rounded-[24px] border border-zinc-900 bg-[linear-gradient(135deg,rgba(167,243,0,0.09),transparent_44%),#09090b] p-4">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#a7f300]">
                    Make it personal
                  </div>
                  <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.04em] text-zinc-50">
                    Follow builders, react to receipts, and get notifications.
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                    The public timeline is open. GitHub sign-in unlocks the social graph and turns
                    Trail into your builder network.
                  </p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <TrailLink
                      href={FOLLOWING_SIGN_IN_HREF}
                      className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#a7f300] px-4 font-mono text-[11px] uppercase tracking-[0.14em] text-black transition-[background-color,transform] hover:bg-[#c8ff5e] active:scale-[0.96]"
                    >
                      Sign in to follow
                    </TrailLink>
                    <Link
                      href="/install"
                      className="inline-flex min-h-10 items-center justify-center rounded-full bg-black px-4 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-200 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] transition-[box-shadow,color,transform] hover:text-white hover:shadow-[0_0_0_1px_rgba(255,255,255,0.16)] active:scale-[0.96]"
                    >
                      Install Trail
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}

            {rows.length === 0 ? (
              <EmptyTimeline
                isFollowingView={isFollowingView}
                recommendations={discovery.builders}
                viewerId={viewerId}
              />
            ) : (
              <div className="divide-y divide-zinc-900/90">
                {rows.map((row) => (
                  <FeedPostCard key={row.id} row={row} viewerId={viewerId} />
                ))}
              </div>
            )}
          </section>

          <aside className="hidden xl:block">
            <div className="sticky top-20 py-6">
              <FeedDiscoveryPanel
                discovery={discovery}
                radarSignals={radarSignals}
                viewerId={viewerId}
              />
            </div>
          </aside>

          <div className="px-3 py-6 lg:col-start-2 xl:hidden">
            <FeedDiscoveryPanel
              discovery={discovery}
              radarSignals={radarSignals}
              viewerId={viewerId}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
