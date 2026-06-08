import { CopyButton } from "@/components/copy-button";
import { FollowButton } from "@/components/follow-button";
import { ReactionBar, type ReactionKind } from "@/components/reaction-bar";
import { RelativeTime } from "@/components/relative-time";
import { SaveReceiptButton } from "@/components/save-receipt-button";
import { SiteNav } from "@/components/site-nav";
import { ToolIcon } from "@/components/tool-icon";
import { Avatar } from "@/components/ui/avatar";
import { type RankableSession, normalizeFeedView, rankFeed } from "@/lib/follow";
import {
  type RadarReactionKind,
  emptyRadarReactionCounts,
  isRadarReactionKind,
} from "@/lib/radar-engagement";
import { type RadarCategory, radarCategoryLabel } from "@/lib/radar-sources";
import { formatDuration } from "@/lib/session-metrics";
import { githubAvatar, shareUrl, tweetIntent } from "@/lib/share";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { FeedComposer, type FeedComposerDraft, type FeedComposerViewer } from "./feed-composer";
import { FeedPickEngagement } from "./feed-pick-engagement";
import { FeedPickMedia, type FeedPickMediaItem } from "./feed-pick-media";
import { QuotePickButton } from "./quote-pick-button";

export const dynamic = "force-dynamic";

const FEED_LIMIT = 80;
const FOLLOWING_SIGN_IN_HREF = signInHref("/feed?view=following");
const PUBLIC_APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://gettrail.vercel.app").replace(
  /\/$/,
  "",
);

const discoveryLinks = [
  {
    href: "/create",
    label: "Post a build",
    detail: "Share work manually, paste GitHub/X/demo links, and start a thread.",
  },
  {
    href: "/discover",
    label: "Builders",
    detail: "Find people by stack, tool, shipping history, and conversation signals.",
  },
  {
    href: "/puerto-rico",
    label: "Puerto Rico",
    detail: "Join the local AI builder loop around meetups, demos, and recaps.",
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

function trailPickCreateHref(signal: FeedRadarSignal): string {
  const params = new URLSearchParams();
  const prompt = signal.testPrompt.trim().slice(0, 260);

  params.set("radarId", signal.id);
  if (signal.source === "x") {
    params.set("source", "x");
    params.set("url", signal.url);
  }
  if (prompt) params.set("prompt", prompt);

  const query = params.toString();
  return query ? `/create?${query}` : "/create";
}

function avatarSrc(row: BaseFeedRow): string | null {
  return row.image ?? (row.handle ? githubAvatar(row.handle) : null);
}

function commentAvatarSrc(comment: FeedCommentPreview): string | null {
  return comment.authorImage ?? (comment.authorHandle ? githubAvatar(comment.authorHandle) : null);
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

function isManualBuildPost(row: BaseFeedRow): boolean {
  return row.postKind === "manual_build";
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
  if (isManualBuildPost(row)) return [];
  const metrics = [{ label: "Proof", value: `${row.eventCount} ev` }];
  const duration = formatDuration(row.durationSeconds);

  if (duration) metrics.push({ label: "Time", value: duration });
  if (row.promptCount) metrics.push({ label: "Prompts", value: `${row.promptCount}` });
  if (row.distinctFiles) metrics.push({ label: "Files", value: `${row.distinctFiles}` });
  if (row.failedToolCalls) metrics.push({ label: "Failed", value: `${row.failedToolCalls}` });

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
  if (row.lessonCount > 0) return `${pluralize(row.lessonCount, "reusable move")} extracted`;
  if (row.positiveReactions + row.negativeReactions > 0) return reactionSummary(row);
  if (isManualBuildPost(row) && row.xPostUrl) return "Discussion from X";
  if (isManualBuildPost(row)) return "New build post";
  if (row.receiptStatus === "shipped" || row.outcome === "shipped") return "Fresh shipping proof";
  if (row.linkedRepo ?? row.repo) return `Proof from ${row.linkedRepo ?? row.repo}`;
  return "New builder post";
}

function receiptBadge(row: BaseFeedRow): string | null {
  if (isManualBuildPost(row)) return "Build post";
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
  postKind: string;
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
  xPostUrl: string | null;
  previewImageUrl: string | null;
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
  | "xPostUrl"
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
  source: string;
  title: string;
  summary: string;
  whyBuildersCare: string;
  testPrompt: string;
  url: string;
  category: RadarCategory;
  sourceHandle: string;
  score: unknown;
  publishedAt: Date | string;
  media: FeedPickMediaItem[] | null;
  text: string | null;
  reactionCounts: Record<RadarReactionKind, number>;
  viewerReactions: RadarReactionKind[];
  commentCount: number;
}

type TimelineItem =
  | { kind: "post"; row: FeedRow }
  | { kind: "trail_pick"; signal: FeedRadarSignal };

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
  void stack;
  return "/discover";
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
      postKind: schema.trailSession.postKind,
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
      previewImageUrl: schema.trailSession.previewImageUrl,
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
      postKind: schema.trailSession.postKind,
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
      previewImageUrl: schema.trailSession.previewImageUrl,
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
  const [statsRows, commentRows, commentPreviewRows, savedRows, lessonRows, xLinkRows] =
    await Promise.all([
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
      db
        .select({
          sessionId: schema.buildPostLink.sessionId,
          url: schema.buildPostLink.url,
        })
        .from(schema.buildPostLink)
        .where(
          and(
            inArray(schema.buildPostLink.sessionId, sessionIds),
            eq(schema.buildPostLink.kind, "x"),
          ),
        )
        .orderBy(asc(schema.buildPostLink.createdAt)),
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
  const xLinkBySession = new Map<string, string>();
  for (const link of xLinkRows) {
    if (!xLinkBySession.has(link.sessionId)) xLinkBySession.set(link.sessionId, link.url);
  }
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
    xPostUrl: xLinkBySession.get(row.id) ?? null,
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

async function loadFeedRadarSignals(viewerId: string | null): Promise<FeedRadarSignal[]> {
  if (!process.env.DATABASE_URL) return [];

  try {
    const { db, schema } = await import("@/db/client");
    const rows = await db.execute<FeedRadarSignal>(sql`
      SELECT
        id,
        source,
        title,
        summary,
        why_builders_care AS "whyBuildersCare",
        test_prompt AS "testPrompt",
        url,
        category,
        source_handle AS "sourceHandle",
        score,
        published_at AS "publishedAt",
        text AS "text",
        (entities -> 'media') AS "media"
      FROM radar_signal
      WHERE status <> 'dismissed'
      ORDER BY published_at DESC, score DESC
      LIMIT 12
    `);
    const signals = rowsOf<FeedRadarSignal>(rows).map((signal) => ({
      ...signal,
      text: typeof signal.text === "string" ? signal.text : null,
      reactionCounts: emptyRadarReactionCounts(),
      viewerReactions: [] as RadarReactionKind[],
      commentCount: 0,
    }));
    if (signals.length === 0) return signals;

    const ids = signals.map((signal) => signal.id);
    try {
      const [reactionRows, commentRows, viewerRows] = await Promise.all([
        db
          .select({
            signalId: schema.radarReaction.signalId,
            kind: schema.radarReaction.kind,
            count: sql<number>`count(*)::int`,
          })
          .from(schema.radarReaction)
          .where(inArray(schema.radarReaction.signalId, ids))
          .groupBy(schema.radarReaction.signalId, schema.radarReaction.kind),
        db
          .select({
            signalId: schema.radarComment.signalId,
            count: sql<number>`count(*)::int`,
          })
          .from(schema.radarComment)
          .where(
            and(inArray(schema.radarComment.signalId, ids), isNull(schema.radarComment.deletedAt)),
          )
          .groupBy(schema.radarComment.signalId),
        viewerId
          ? db
              .select({
                signalId: schema.radarReaction.signalId,
                kind: schema.radarReaction.kind,
              })
              .from(schema.radarReaction)
              .where(
                and(
                  inArray(schema.radarReaction.signalId, ids),
                  eq(schema.radarReaction.userId, viewerId),
                ),
              )
          : Promise.resolve([] as { signalId: string; kind: string }[]),
      ]);

      const byId = new Map(signals.map((signal) => [signal.id, signal]));
      for (const row of reactionRows) {
        const signal = byId.get(row.signalId);
        if (signal && isRadarReactionKind(row.kind)) {
          signal.reactionCounts[row.kind] = toCount(row.count);
        }
      }
      for (const row of commentRows) {
        const signal = byId.get(row.signalId);
        if (signal) signal.commentCount = toCount(row.count);
      }
      for (const row of viewerRows) {
        const signal = byId.get(row.signalId);
        if (signal && isRadarReactionKind(row.kind) && !signal.viewerReactions.includes(row.kind)) {
          signal.viewerReactions.push(row.kind);
        }
      }
    } catch (error) {
      console.error("Failed to load feed radar engagement", error);
    }

    return signals;
  } catch (error) {
    console.error("Failed to load feed radar signals", error);
    return [];
  }
}

function buildTimelineItems(
  rows: FeedRow[],
  radarSignals: FeedRadarSignal[],
  isFollowingView: boolean,
): TimelineItem[] {
  if (isFollowingView) return rows.map((row) => ({ kind: "post", row }));

  // Curated Trail Picks fill the gap while native builds are scarce, then recede
  // as real posts arrive: more picks when the feed is empty, fewer as it fills.
  // The budget caps how many picks we mix in, but placement is purely by recency
  // (below) so the newest item leads regardless of whether it's a build or a pick.
  const postCount = rows.length;
  const pickBudget =
    postCount === 0 ? 8 : postCount <= 4 ? 4 : postCount <= 12 ? 3 : postCount <= 24 ? 2 : 1;
  const picks = radarSignals.slice(0, pickBudget);

  // Merge posts and picks into one chronological stream, newest first, so a fresh
  // Trail Pick never sits below an older build (and vice versa). Posts rank by
  // sharedAt (matching rankFeed); picks rank by publishedAt. On a timestamp tie,
  // builds lead picks so native work stays first-class.
  type Sortable = { item: TimelineItem; time: number; isPost: boolean };
  const sortable: Sortable[] = [
    ...rows.map((row) => ({
      item: { kind: "post", row } as TimelineItem,
      time: toEpoch(row.sharedAt ?? row.startedAt),
      isPost: true,
    })),
    ...picks.map((signal) => ({
      item: { kind: "trail_pick", signal } as TimelineItem,
      time: toEpoch(signal.publishedAt),
      isPost: false,
    })),
  ];

  sortable.sort((a, b) => {
    if (b.time !== a.time) return b.time - a.time;
    if (a.isPost !== b.isPost) return a.isPost ? -1 : 1;
    return 0;
  });

  return sortable.map((entry) => entry.item);
}

/** Epoch millis for a date-ish value; missing/invalid sort oldest. */
function toEpoch(value: Date | string | null | undefined): number {
  if (value == null) return Number.NEGATIVE_INFINITY;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

function FeedTabs({
  followingHref,
  isFollowingView,
}: {
  followingHref: string;
  isFollowingView: boolean;
}) {
  const tabClass =
    "relative inline-flex min-h-8 items-center gap-2 rounded-full px-3 text-sm transition-[background-color,color] hover:bg-white/[0.04]";

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Link
        href="/feed"
        className={`${tabClass} ${
          isFollowingView ? "text-zinc-500 hover:text-zinc-200" : "bg-zinc-100 text-zinc-950"
        }`}
      >
        <span>For you</span>
      </Link>
      <TrailLink
        href={followingHref}
        className={`${tabClass} ${
          isFollowingView ? "bg-zinc-100 text-zinc-950" : "text-zinc-500 hover:text-zinc-200"
        }`}
      >
        <span>Following</span>
      </TrailLink>
    </div>
  );
}

function FeedIdentityRail({
  viewer,
  personalization,
}: {
  viewer: FeedComposerViewer | null;
  personalization: FeedPersonalization;
}) {
  if (!viewer?.id) {
    return (
      <div className="sticky top-20 py-6 pr-2">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
          <div className="text-[15px] font-medium tracking-[-0.015em] text-zinc-100">
            Your public build log.
          </div>
          <p className="mt-1.5 text-[12px] leading-5 text-zinc-500">
            Sign in to follow builders, save ideas, and publish what you shipped.
          </p>
          <TrailLink
            href={signInHref("/feed")}
            className="mt-3 inline-flex min-h-9 w-full items-center justify-center rounded-full bg-[#a7f300] px-4 text-sm font-medium text-zinc-950 transition-[background-color,transform] hover:bg-[#b9ff1f] active:scale-[0.97]"
          >
            Sign in with GitHub
          </TrailLink>
          <Link
            href="/create"
            className="mt-2 inline-flex min-h-9 w-full items-center justify-center rounded-full bg-white/[0.05] px-4 text-sm text-zinc-300 transition-[background-color,color,transform] hover:bg-white/[0.09] hover:text-zinc-100 active:scale-[0.97]"
          >
            Post a build
          </Link>
        </div>
      </div>
    );
  }

  const profileHref = viewer.handle ? `/u/${viewer.handle}` : "/settings";
  const avatar = viewer.image ?? (viewer.handle ? githubAvatar(viewer.handle) : undefined);
  const stats = [
    { label: "Builds", value: personalization.publicReceiptCount },
    { label: "Following", value: personalization.followingCount },
    { label: "Saved", value: personalization.usedLessonCount },
  ];
  const unread = personalization.unreadNotifications;
  const links = [
    {
      href: "/notifications",
      label: "Notifications",
      detail: unread > 0 ? `${formatCount(unread)} unread` : "Replies and reactions",
      badge: unread > 0,
    },
    { href: "/saved", label: "Saved", detail: "Ideas and builds you kept", badge: false },
    { href: "/dashboard", label: "Builder Studio", detail: "Manage your posts", badge: false },
    viewer.handle
      ? {
          href: `/u/${viewer.handle}`,
          label: "Your profile",
          detail: `@${viewer.handle}`,
          badge: false,
        }
      : {
          href: "/settings",
          label: "Finish your profile",
          detail: "Add a public handle",
          badge: false,
        },
  ];

  return (
    <div className="sticky top-20 py-6 pr-2">
      <Link href={profileHref} className="group flex items-center gap-3">
        <Avatar
          src={avatar}
          alt={viewer.name}
          size={40}
          fallback={viewer.handle ?? viewer.name}
          className="border-white/10 bg-black"
        />
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-medium tracking-[-0.01em] text-zinc-100 group-hover:text-white">
            {viewer.name}
          </span>
          <span className="block truncate font-mono text-[12px] text-zinc-600">
            {viewer.handle ? `@${viewer.handle}` : "Finish your profile"}
          </span>
        </span>
      </Link>

      <div className="mt-4 flex items-center gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="leading-tight">
            <div className="font-mono text-[14px] text-zinc-100 tabular-nums">
              {formatCount(stat.value)}
            </div>
            <div className="text-[11px] text-zinc-600">{stat.label}</div>
          </div>
        ))}
      </div>

      <TrailLink
        href="/create"
        className="mt-5 inline-flex min-h-9 w-full items-center justify-center rounded-full bg-zinc-100 px-4 text-sm font-medium text-zinc-950 transition-[background-color,transform] hover:bg-[#a7f300] active:scale-[0.97]"
      >
        Post a build
      </TrailLink>

      <nav className="mt-6 space-y-0.5">
        {links.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="group block border-l border-white/0 px-3 py-2.5 text-zinc-500 transition-[border-color,color] hover:border-white/20 hover:text-zinc-200"
          >
            <span className="flex items-center gap-2 text-[14px] font-medium tracking-[-0.01em]">
              {item.label}
              {item.badge ? (
                <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-[#a7f300] px-1 text-[10px] font-semibold leading-4 text-zinc-950">
                  {formatCount(unread)}
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block text-[12px] leading-4 text-zinc-700 group-hover:text-zinc-600">
              {item.detail}
            </span>
          </Link>
        ))}
      </nav>

      <p className="mt-6 border-l border-white/10 px-3 text-[12px] leading-5 text-zinc-600">
        Your loop: read a build, save an idea, ship an update, reply to a thread.
      </p>
    </div>
  );
}

function NetworkPulse({ stats }: { stats: FeedStats }) {
  const items = [
    { label: "Builders", value: stats.builders },
    { label: "Builds", value: stats.receipts },
    { label: "Shipped", value: stats.shipped },
    { label: "Reactions", value: stats.reactions },
    { label: "Comments", value: stats.comments },
  ].filter((item) => item.value > 0);

  return (
    <section className="border-b border-white/[0.08] pb-5">
      <div className="text-sm font-medium tracking-[-0.01em] text-zinc-200">Network pulse</div>
      {items.length > 0 ? (
        <dl className="mt-3 space-y-1.5">
          {items.map((item) => (
            <div key={item.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-[12px] text-zinc-600">{item.label}</dt>
              <dd className="font-mono text-sm text-zinc-100 tabular-nums">
                {formatCount(item.value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {stats.receipts === 0 ? (
        <p className="mt-3 text-[13px] leading-5 text-zinc-500">
          No public builds yet.{" "}
          <Link href="/create" className="text-[#a7f300] hover:underline">
            Post the first build.
          </Link>
        </p>
      ) : null}
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
  const manualPost = isManualBuildPost(r);
  const postNoun = "build post";
  const tweetHref = tweetIntent(
    `${displayName} published a Trail ${postNoun} from ${formatToolName(r.tool)}.`,
    currentPublicReceiptUrl,
  );
  const reason = feedReason(r);
  const socialProof = [
    r.commentCount > 0 ? pluralize(r.commentCount, "comment") : null,
    r.positiveReactions + r.negativeReactions > 0 ? reactionSummary(r) : null,
  ].filter(Boolean);

  return (
    <article className="group grid grid-cols-[40px_minmax(0,1fr)] gap-3 border-b border-white/[0.08] px-4 py-5 transition-[background-color] hover:bg-white/[0.025] sm:grid-cols-[44px_minmax(0,1fr)] sm:px-5">
      <Link
        href={authorHref}
        className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-full transition-opacity hover:opacity-90 sm:h-11 sm:w-11"
        aria-label={`Open ${handleLabel}'s profile`}
      >
        <Avatar
          src={avatarSrc(r)}
          alt={displayName}
          size={44}
          fallback={r.handle ?? displayName}
          className="border-white/10 bg-black"
        />
      </Link>

      <div className="min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
              <Link
                href={authorHref}
                className="max-w-[180px] truncate font-medium tracking-[-0.01em] text-zinc-100 transition-colors hover:text-white sm:max-w-[240px]"
              >
                {displayName}
              </Link>
              <Link
                href={authorHref}
                className="font-mono text-[12px] text-zinc-600 transition-colors hover:text-zinc-300"
              >
                {handleLabel}
              </Link>
              <span className="text-zinc-800">·</span>
              <RelativeTime
                date={r.sharedAt ?? r.startedAt}
                className="font-mono text-[12px] text-zinc-600 tabular-nums"
              />
              {badge ? (
                <>
                  <span className="text-zinc-800">·</span>
                  <span className="text-[12px] text-zinc-500">{badge}</span>
                </>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-zinc-600">
              <span>{manualPost ? "posted a build" : "shared a build"}</span>
              <span className="text-zinc-800">·</span>
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-zinc-500">
                <ToolIcon name={r.tool} size={12} className="text-[#a7f300]" />
                {formatToolName(r.tool)}
              </span>
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
              className="inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-white/[0.04] px-3 text-[12px] text-zinc-300 transition-[background-color,color,transform] hover:bg-white/[0.08] hover:text-zinc-100 active:scale-[0.97]"
            >
              Follow
            </TrailLink>
          ) : null}
        </div>

        <Link href={currentReceiptHref} className="mt-2.5 block">
          <h3 className="break-words text-pretty text-[17px] font-medium leading-[1.42] tracking-[-0.012em] text-zinc-50 transition-colors group-hover:text-white">
            {r.title ?? r.slug}
          </h3>
          {r.summary ? (
            <p className="mt-2 line-clamp-2 break-words text-pretty text-[14px] leading-[1.55] text-zinc-400">
              {r.summary}
            </p>
          ) : null}
        </Link>

        {r.previewImageUrl ? (
          <Link
            href={currentReceiptHref}
            className="mt-3 block overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900 transition-colors hover:border-white/[0.16]"
          >
            <img
              src={r.previewImageUrl}
              alt={r.title ?? "Build preview"}
              loading="lazy"
              className="max-h-80 w-full object-cover"
            />
          </Link>
        ) : null}

        {r.xPostUrl ? (
          <a
            href={r.xPostUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 block border border-white/[0.08] bg-white/[0.025] px-3 py-3 transition-colors hover:border-white/[0.16] hover:bg-white/[0.04]"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
              Curated from X
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] leading-5 text-zinc-300">
              <span>Open X post</span>
              <span className="text-zinc-700">→</span>
              <span className="break-all font-mono text-[11px] text-zinc-600">{r.xPostUrl}</span>
            </div>
          </a>
        ) : null}

        <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
          {metrics.map((metric) => (
            <div key={metric.label} className="flex items-baseline gap-1.5">
              <span className="text-[12px] text-zinc-600">{metric.label}</span>
              <span className="font-mono text-[12.5px] text-zinc-200 tabular-nums">
                {metric.value}
              </span>
            </div>
          ))}
          {repoLabel ? (
            <div className="flex min-w-0 items-baseline gap-1.5">
              <span className="text-[12px] text-zinc-600">Repo</span>
              <span className="truncate font-mono text-[12.5px] text-zinc-300">{repoLabel}</span>
            </div>
          ) : null}
        </div>

        {chips.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-zinc-600">
            {chips.map((chip) => (
              <span key={chip}>#{chip}</span>
            ))}
          </div>
        ) : null}

        {r.lessonCount > 0 ? (
          <Link
            href={`${currentReceiptHref}#lessons`}
            className="mt-3 block border-l border-[#a7f300]/30 pl-3 transition-colors hover:border-[#a7f300]/70"
          >
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-zinc-500">
              <span>Steal this move</span>
              <span className="text-zinc-700">·</span>
              <span>{pluralize(r.lessonCount, "move")}</span>
              {r.lessonPreviewTitle ? (
                <>
                  <span className="text-zinc-700">·</span>
                  <span>{r.lessonPreviewTitle}</span>
                </>
              ) : null}
            </div>
            {r.lessonPreviewWhatToSteal ? (
              <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-zinc-400">
                {r.lessonPreviewWhatToSteal}
              </p>
            ) : null}
          </Link>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-zinc-600">
          <span>{reason}</span>
          {socialProof.length > 0 ? (
            <>
              <span className="text-zinc-700">·</span>
              <span>{socialProof.join(" · ")}</span>
            </>
          ) : null}
        </div>

        {r.commentPreviews.length > 0 ? (
          <Link
            href={`${currentReceiptHref}#conversation`}
            className="mt-3 block border-l border-white/10 pl-3 transition-colors hover:border-white/25"
          >
            <div className="space-y-2">
              {r.commentPreviews
                .slice()
                .reverse()
                .map((comment) => (
                  <div className="grid grid-cols-[24px_minmax(0,1fr)] gap-2.5" key={comment.id}>
                    <Avatar
                      src={commentAvatarSrc(comment)}
                      alt={comment.authorName}
                      size={24}
                      fallback={comment.authorHandle ?? comment.authorName}
                      className="border-white/10 bg-black"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[12px] font-medium text-zinc-200">
                          {comment.authorName}
                        </span>
                        <RelativeTime
                          date={comment.createdAt}
                          className="font-mono text-[10px] text-zinc-600"
                        />
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-zinc-400">
                        {comment.body}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
            <div className="mt-2 text-[12px] text-zinc-500">
              Join the thread <span aria-hidden>→</span>
            </div>
          </Link>
        ) : null}

        <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.06] pt-3.5 sm:flex-row sm:items-center sm:justify-between">
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
              className="inline-flex min-h-8 items-center rounded-full px-2.5 text-[13px] text-zinc-600 transition-[background-color,color,transform] hover:bg-white/[0.04] hover:text-zinc-200 active:scale-[0.97]"
            >
              Reply {r.commentCount > 0 ? formatCount(r.commentCount) : ""}
            </Link>
            <SaveReceiptButton
              sessionId={r.id}
              initialSaved={r.viewerHasSaved}
              signedIn={viewerId !== null}
              signInHref={signInHref(currentReceiptHref)}
              className="border-transparent bg-transparent px-2.5 text-[13px] normal-case tracking-normal text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-200"
            />
            <CopyButton
              value={currentPublicReceiptUrl}
              label="Copy"
              copiedLabel="Copied"
              className="min-h-8 rounded-full border-transparent bg-transparent px-2.5 text-[13px] text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-200"
            />
            {!manualPost ? (
              <Link
                href={forkHref}
                className="inline-flex min-h-8 items-center rounded-full px-2.5 text-[13px] text-zinc-600 transition-[background-color,color,transform] hover:bg-white/[0.04] hover:text-zinc-200 active:scale-[0.97]"
              >
                Fork
              </Link>
            ) : null}
            <a
              href={tweetHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-8 items-center rounded-full px-2.5 text-[13px] text-zinc-600 transition-[background-color,color,transform] hover:bg-white/[0.04] hover:text-zinc-200 active:scale-[0.97]"
            >
              Share
            </a>
            <span className="mx-0.5 hidden h-4 w-px bg-white/10 sm:inline-block" aria-hidden />
            <Link
              href={currentReceiptHref}
              className="inline-flex min-h-8 items-center rounded-full bg-zinc-100 px-3 text-[13px] font-medium text-zinc-950 transition-[background-color,transform] hover:bg-[#a7f300] active:scale-[0.97]"
            >
              Open post
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function TrailPickFeedCard({
  signal,
  viewerId,
}: {
  signal: FeedRadarSignal;
  viewerId: string | null;
}) {
  const sourceLabel = signal.source === "x" ? "Curated from X" : "Curated signal";
  const openLabel = signal.source === "x" ? "Open X post" : "Open source";
  const createHref = trailPickCreateHref(signal);
  const discussionPrompt = signal.testPrompt.trim();

  return (
    <article className="border-b border-white/[0.08] bg-[linear-gradient(135deg,rgba(167,243,0,0.045),transparent_34%),#0b0b0a] px-4 py-5 sm:px-5">
      <div className="flex items-start gap-3">
        <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#a7f300]/10 font-mono text-[11px] font-semibold text-[#a7f300] shadow-[0_0_0_1px_rgba(167,243,0,0.16)]">
          TP
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-zinc-600">
            <span className="font-medium text-[#a7f300]">Trail Pick</span>
            <span className="text-zinc-800">·</span>
            <span>{sourceLabel}</span>
            <span className="text-zinc-800">·</span>
            <span>@{signal.sourceHandle}</span>
            <span className="text-zinc-800">·</span>
            <span>{radarCategoryLabel(signal.category)}</span>
            <span className="text-zinc-800">·</span>
            <RelativeTime date={signal.publishedAt} className="font-mono tabular-nums" />
          </div>

          <a href={signal.url} target="_blank" rel="noreferrer noopener" className="mt-2.5 block">
            <h3 className="break-words text-pretty text-[17px] font-medium leading-[1.42] tracking-[-0.012em] text-zinc-50 transition-colors hover:text-white">
              {signal.title}
            </h3>
            <p className="mt-2 line-clamp-3 break-words text-pretty text-[14px] leading-[1.55] text-zinc-400">
              {signal.summary}
            </p>
          </a>

          {Array.isArray(signal.media) && signal.media.length > 0 ? (
            <FeedPickMedia
              media={signal.media}
              sourceHandle={signal.sourceHandle}
              signalUrl={signal.url}
            />
          ) : null}

          <div className="mt-3 border-l border-[#a7f300]/30 pl-3">
            <div className="text-[12px] text-zinc-500">Why builders care</div>
            <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-zinc-400">
              {signal.whyBuildersCare}
            </p>
          </div>

          {discussionPrompt ? (
            <div className="mt-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-3">
              <div className="text-[12px] text-zinc-500">Start a Trail thread about this</div>
              <p className="mt-1 text-[13px] leading-5 text-zinc-300">{discussionPrompt}</p>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3.5">
            <a
              href={signal.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-8 items-center rounded-full px-2.5 text-[13px] text-zinc-600 transition-[background-color,color,transform] hover:bg-white/[0.04] hover:text-zinc-200 active:scale-[0.97]"
            >
              {openLabel}
            </a>
            <CopyButton
              value={signal.url}
              label="Copy source"
              copiedLabel="Copied source"
              className="min-h-8 rounded-full border-transparent bg-transparent px-2.5 text-[13px] text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-200"
            />
            <QuotePickButton
              quoted={{
                author: `@${signal.sourceHandle}`,
                handle: signal.sourceHandle,
                text: signal.text ?? signal.summary,
                url: signal.url,
              }}
              xUrl={signal.source === "x" ? signal.url : ""}
              createHref={createHref}
              canQuote={viewerId != null && signal.source === "x"}
            />
            <span className="basis-full text-[11px] leading-5 text-zinc-700 sm:basis-auto">
              Quotes this into a new Trail post under your name — the external author stays
              external.
            </span>
          </div>

          <FeedPickEngagement
            signalId={signal.id}
            initialCounts={signal.reactionCounts}
            initialMine={signal.viewerReactions}
            initialCommentCount={signal.commentCount}
            viewerId={viewerId}
          />
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
            Your Following feed is empty. Follow a few builders and this becomes your live build
            stream instead of a blank tab.
          </p>
          {builders.length > 0 ? (
            <div className="mt-6 grid gap-3 text-left">
              {builders.map((builder) => (
                <div
                  className="flex items-center justify-between gap-3 border-l border-white/10 pl-3"
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
                      <span className="block truncate text-sm font-medium text-zinc-100">
                        {builder.name}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-zinc-600">
                        {formatCount(builder.receiptCount)} posts · @{builder.handle}
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
              <Link href="/discover" className="text-[#a7f300] hover:underline">
                Builders
              </Link>{" "}
              to find people shipping in your stack.
            </p>
          )}
        </div>
      ) : (
        <div className="mx-auto max-w-xl">
          <h3 className="text-[17px] font-medium tracking-[-0.02em] text-zinc-100">
            Be the first to share a build.
          </h3>
          <p className="mt-2 text-pretty text-sm leading-relaxed text-zinc-400">
            Post what you built with AI — the outcome, proof, and one idea other builders can reuse.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link
              href={viewerId ? "/create" : signInHref("/create")}
              className="inline-flex min-h-9 items-center rounded-full bg-zinc-100 px-4 text-sm font-medium text-zinc-950 transition-[background-color,transform] hover:bg-[#a7f300] active:scale-[0.97]"
            >
              Share a build
            </Link>
            <Link
              href="/discover"
              className="inline-flex min-h-9 items-center rounded-full bg-white/[0.04] px-4 text-sm text-zinc-300 transition-[background-color,color,transform] hover:bg-white/[0.08] hover:text-zinc-100 active:scale-[0.97]"
            >
              Browse builders
            </Link>
          </div>
        </div>
      )}
    </div>
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
  const topBuilders = discovery.builders.slice(0, 4);
  const topStacks = discovery.stacks.slice(0, 6);

  return (
    <div className="space-y-6 text-sm">
      <NetworkPulse stats={discovery.stats} />

      <section className="border-b border-white/[0.08] pb-5">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-medium tracking-[-0.01em] text-zinc-200">Trail Picks</h3>
        </div>
        <p className="mt-1 text-[12px] leading-5 text-zinc-600">
          Curated AI updates — react, reply, or quote one into your own post.
        </p>

        {radarSignals.length === 0 ? (
          <p className="mt-3 text-[13px] leading-5 text-zinc-600">
            Nothing curated right now. Check back soon.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {radarSignals.slice(0, 4).map((signal) => (
              <div key={signal.id} className="group block">
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-zinc-600">
                  <span>{radarCategoryLabel(signal.category)}</span>
                  <span>@{signal.sourceHandle}</span>
                  <span>
                    <RelativeTime date={signal.publishedAt} />
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-zinc-300 group-hover:text-zinc-50">
                  {signal.title}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border-b border-white/[0.08] pb-5">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-medium tracking-[-0.01em] text-zinc-200">Builders</h3>
          <Link
            href="/discover"
            className="text-[12px] text-zinc-600 underline-offset-4 hover:text-zinc-200 hover:underline"
          >
            Discover
          </Link>
        </div>

        {topBuilders.length === 0 ? (
          <div className="mt-3 space-y-2 text-[13px] leading-5 text-zinc-600">
            <p>No builders to recommend yet — be one of the first.</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <Link href="/create" className="text-[#a7f300] hover:underline">
                Post a build
              </Link>
              <Link href="/discover" className="text-zinc-400 hover:text-zinc-200">
                Browse builders
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {topBuilders.map((builder) => (
              <div key={builder.id}>
                <div className="flex items-start gap-3">
                  <Link href={`/u/${builder.handle}`} className="shrink-0">
                    <Avatar
                      src={builder.image ?? githubAvatar(builder.handle)}
                      alt={builder.name}
                      fallback={builder.handle}
                      className="h-8 w-8 rounded-full border-white/10 bg-black"
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/u/${builder.handle}`} className="min-w-0">
                        <div className="truncate text-[13px] font-medium text-zinc-200">
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
                          className="inline-flex h-7 items-center rounded-full bg-white/[0.05] px-2.5 text-[12px] text-zinc-300 transition-[background-color,transform] hover:bg-white/[0.08] hover:text-zinc-100 active:scale-[0.97]"
                        >
                          Follow
                        </TrailLink>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-zinc-600">
                      {builder.bio ||
                        `${formatCount(builder.shippedCount)} shipped posts in public.`}
                    </p>
                    <div className="mt-1 text-[12px] text-zinc-700">
                      {formatCount(builder.receiptCount)} posts ·{" "}
                      {builder.latestAt ? <RelativeTime date={builder.latestAt} /> : "recent"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border-b border-white/[0.08] pb-5">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-medium tracking-[-0.01em] text-zinc-200">Stacks</h3>
          <Link
            href="/discover"
            className="text-[12px] text-zinc-600 underline-offset-4 hover:text-zinc-200 hover:underline"
          >
            Explore
          </Link>
        </div>

        {topStacks.length === 0 ? (
          <p className="mt-3 text-[13px] leading-5 text-zinc-600">
            Stack trends will fill in as published build posts are tagged.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {topStacks.map((stack) => (
              <Link
                key={`${stack.kind}:${stack.tag}`}
                href={stackHref(stack)}
                className="group flex items-baseline justify-between gap-4"
              >
                <span className="truncate text-[13px] text-zinc-400 group-hover:text-zinc-100">
                  {stack.label}
                </span>
                <span className="font-mono text-[11px] text-zinc-700 tabular-nums">
                  {formatCount(stack.receiptCount)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="pb-2">
        <h3 className="font-medium tracking-[-0.01em] text-zinc-200">Explore</h3>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          {discoveryLinks.slice(0, 4).map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[13px] text-zinc-600 hover:text-zinc-200"
            >
              {link.label}
            </Link>
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
      loadFeedRadarSignals(viewerId),
      loadComposerDrafts(viewerId),
      loadFeedPersonalization(viewerId),
    ]);
  } else {
    [rows, discovery, radarSignals, composerDrafts, personalization] = await Promise.all([
      loadPublicFeed(viewerId),
      loadFeedDiscovery(viewerId),
      loadFeedRadarSignals(viewerId),
      loadComposerDrafts(viewerId),
      loadFeedPersonalization(viewerId),
    ]);
  }

  const isFollowingView = view === "following";
  const timelineItems = buildTimelineItems(rows, radarSignals, isFollowingView);
  const trailPickCount = timelineItems.filter((item) => item.kind === "trail_pick").length;
  const followingHref = viewerId ? "/feed?view=following" : FOLLOWING_SIGN_IN_HREF;
  const subtitle = isFollowingView
    ? "Read the builders you follow, save an idea, and reply while the thread is fresh."
    : "See what builders shipped, save ideas you can reuse, then post your own build.";
  const feedTitle = isFollowingView ? "Following" : "Today";
  const feedCountLabel =
    rows.length > 0 ? `${rows.length} ${rows.length === 1 ? "build" : "builds"}` : null;

  return (
    <div className="min-h-screen bg-[#080808] text-zinc-50">
      <SiteNav currentPath="/feed" />

      <main className="min-h-[calc(100vh-3.5rem)] w-full">
        <div className="mx-auto grid max-w-[1380px] grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8 lg:px-4 xl:grid-cols-[240px_minmax(0,720px)_300px] xl:gap-10">
          <aside className="hidden lg:block">
            <FeedIdentityRail viewer={viewer} personalization={personalization} />
          </aside>

          <section className="min-w-0 border-x border-white/[0.08] bg-[#0b0b0a] lg:min-h-[calc(100vh-3.5rem)]">
            <div className="border-b border-white/[0.08] bg-[#0b0b0a]">
              <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h1 className="text-[24px] font-medium tracking-[-0.035em] text-zinc-50">
                      {feedTitle === "Today" ? "Build feed" : feedTitle}
                    </h1>
                    <p className="mt-1 max-w-xl text-pretty text-[13px] leading-5 text-zinc-500">
                      {subtitle}
                    </p>
                  </div>
                  {feedCountLabel ? (
                    <span className="shrink-0 font-mono text-[12px] text-zinc-600 tabular-nums">
                      {feedCountLabel}
                    </span>
                  ) : null}
                </div>
                <FeedTabs followingHref={followingHref} isFollowingView={isFollowingView} />
              </div>
            </div>

            <details
              id="feed-composer"
              className="group border-b border-white/[0.08] px-4 py-3 sm:px-5"
              open={timelineItems.length === 0}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 marker:hidden">
                <div className="min-w-0">
                  <span className="block text-sm font-medium tracking-[-0.01em] text-zinc-200">
                    Share a build
                  </span>
                  <span className="mt-0.5 block text-[12px] text-zinc-600">
                    {composerDrafts.length > 0
                      ? `${formatCount(composerDrafts.length)} proof draft${composerDrafts.length === 1 ? "" : "s"} ready`
                      : "Write a build post, or turn an agent run into proof."}
                  </span>
                </div>
                <span className="text-[12px] text-zinc-600 group-open:hidden">Open</span>
                <span className="hidden text-[12px] text-zinc-600 group-open:inline">Close</span>
              </summary>
              <div className="mt-4">
                <FeedComposer viewer={viewer} drafts={composerDrafts} />
              </div>
            </details>

            {!viewerId && !isFollowingView ? (
              <div className="border-b border-white/[0.08] px-4 py-4 sm:px-5">
                <h2 className="text-[17px] font-medium tracking-[-0.02em] text-zinc-100">
                  Follow builders and post your own build.
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">
                  The public feed is open. GitHub sign-in unlocks follows, reactions, notifications,
                  and your own builder graph.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <TrailLink
                    href={FOLLOWING_SIGN_IN_HREF}
                    className="inline-flex min-h-9 items-center justify-center rounded-full bg-zinc-100 px-4 text-sm font-medium text-zinc-950 transition-[background-color,transform] hover:bg-[#a7f300] active:scale-[0.97]"
                  >
                    Sign in to follow
                  </TrailLink>
                  <Link
                    href="/create"
                    className="inline-flex min-h-9 items-center justify-center rounded-full bg-white/[0.04] px-4 text-sm text-zinc-300 transition-[background-color,color,transform] hover:bg-white/[0.08] hover:text-zinc-100 active:scale-[0.97]"
                  >
                    Post a build
                  </Link>
                </div>
              </div>
            ) : null}

            <div className="border-b border-white/[0.08] px-4 py-2.5 sm:px-5">
              <div className="flex items-center justify-between gap-4 text-[12px] text-zinc-600">
                <span>{rows.length === 0 && trailPickCount > 0 ? "Curated picks" : "Latest"}</span>
                <span className="hidden sm:inline">Newest first</span>
              </div>
            </div>

            {timelineItems.length === 0 ? (
              <EmptyTimeline
                isFollowingView={isFollowingView}
                recommendations={discovery.builders}
                viewerId={viewerId}
              />
            ) : (
              <div>
                {timelineItems.map((item) =>
                  item.kind === "post" ? (
                    <FeedPostCard key={item.row.id} row={item.row} viewerId={viewerId} />
                  ) : (
                    <TrailPickFeedCard
                      key={`trail-pick-${item.signal.id}`}
                      signal={item.signal}
                      viewerId={viewerId}
                    />
                  ),
                )}
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
