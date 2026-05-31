import { CopyButton } from "@/components/copy-button";
import { FollowButton } from "@/components/follow-button";
import { ReactionBar, type ReactionKind } from "@/components/reaction-bar";
import { RelativeTime } from "@/components/relative-time";
import { SiteNav } from "@/components/site-nav";
import { ToolIcon } from "@/components/tool-icon";
import { Avatar } from "@/components/ui/avatar";
import { type RankableSession, normalizeFeedView, rankFeed } from "@/lib/follow";
import { formatDuration } from "@/lib/session-metrics";
import { githubAvatar, shareUrl, tweetIntent } from "@/lib/share";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

const FEED_LIMIT = 80;
const FOLLOWING_SIGN_IN_HREF = signInHref("/feed?view=following");
const PUBLIC_APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://gettrail.vercel.app").replace(
  /\/$/,
  "",
);

const discoveryLinks = [
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
// never globally) and filter visibility = 'public' in SQL.

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
  commentCount: number;
}

interface FeedRow extends BaseFeedRow {
  isFollowing: boolean;
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
  | "commentCount"
>;

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

async function loadViewerId(): Promise<string | null> {
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) return null;

  try {
    const { auth } = await import("@/lib/auth");
    const sessionInfo = await auth.api.getSession({ headers: await headers() });
    return sessionInfo?.user?.id ?? null;
  } catch {
    // Public discovery should still render when auth is unavailable.
    return null;
  }
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
    .where(and(eq(schema.trailSession.visibility, "public"), isNotNull(schema.user.handle)))
    .orderBy(
      desc(sql`coalesce(${schema.trailSession.sharedAt}, ${schema.trailSession.startedAt})`),
      desc(schema.trailSession.id),
    )
    .limit(FEED_LIMIT);

  const ranked = await attachEngagementStats(rankFeed(rows), viewerId);
  if (!viewerId || ranked.length === 0) {
    return ranked.map((row) => ({ ...row, isFollowing: false }));
  }

  const authorIds = Array.from(
    new Set(ranked.map((row) => row.authorId).filter((authorId) => authorId !== viewerId)),
  );
  if (authorIds.length === 0) {
    return ranked.map((row) => ({ ...row, isFollowing: false }));
  }

  const followingRows = await db
    .select({ followingId: schema.follow.followingId })
    .from(schema.follow)
    .where(
      and(eq(schema.follow.followerId, viewerId), inArray(schema.follow.followingId, authorIds)),
    );
  const followingIds = new Set(followingRows.map((row) => row.followingId));

  return ranked.map((row) => ({
    ...row,
    isFollowing: row.authorId !== viewerId && followingIds.has(row.authorId),
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
        isNotNull(schema.user.handle),
      ),
    )
    .orderBy(
      desc(sql`coalesce(${schema.trailSession.sharedAt}, ${schema.trailSession.startedAt})`),
      desc(schema.trailSession.id),
    )
    .limit(FEED_LIMIT);

  // rankFeed re-applies the visibility filter + ordering so the tested helper
  // runs in prod and the page stays correct even if the query drifts.
  return (await attachEngagementStats(rankFeed(rows), viewerId)).map((row) => ({
    ...row,
    isFollowing: row.authorId !== viewerId,
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
  const [statsRows, commentRows] = await Promise.all([
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
    commentCount: commentsBySession.get(row.id) ?? 0,
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

function FeedDiscoveryPanel({
  discovery,
  viewerId,
}: {
  discovery: FeedDiscovery;
  viewerId: string | null;
}) {
  return (
    <>
      <section className="rounded-[26px] bg-[#101012] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.07),0_20px_70px_rgba(0,0,0,0.35)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#a7f300]">
              Builder radar
            </div>
            <h3 className="mt-2 text-[20px] font-medium tracking-[-0.03em] text-zinc-50">
              People shipping now
            </h3>
          </div>
          <span className="rounded-full bg-black px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
            Follow graph
          </span>
        </div>

        <div className="mt-5 space-y-3">
          {discovery.builders.length === 0 ? (
            <p className="rounded-[18px] bg-black/50 p-4 text-sm leading-6 text-zinc-500">
              Fresh builder recommendations appear here as more public receipts are published.
            </p>
          ) : (
            discovery.builders.map((builder, index) => (
              <div
                key={builder.id}
                className="group relative overflow-hidden rounded-[20px] bg-black/55 p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-black/80 hover:shadow-[0_0_0_1px_rgba(167,243,0,0.22)]"
              >
                <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-[#a7f300] opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="flex items-start gap-3">
                  <Link href={`/u/${builder.handle}`} className="shrink-0">
                    <Avatar
                      src={builder.image ?? githubAvatar(builder.handle)}
                      alt={builder.name}
                      fallback={builder.handle}
                      className="h-11 w-11 rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.12)]"
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
                      <span className="rounded-full bg-zinc-950 px-2 py-1 font-mono text-[10px] text-zinc-500 tabular-nums">
                        #{index + 1}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-zinc-500">
                      {builder.bio ||
                        `${formatCount(builder.shippedCount)} shipped receipts in public.`}
                    </p>
                    {builder.topTools.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {builder.topTools.map((tool) => (
                          <span
                            key={tool}
                            className="rounded-full bg-zinc-900 px-2 py-1 font-mono text-[10px] text-zinc-400"
                          >
                            {formatToolName(tool)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.11em] text-zinc-600">
                      <span>{formatCount(builder.receiptCount)} receipts</span>
                      <span>{formatCount(builder.reactionCount)} reactions</span>
                      <span>{formatCount(builder.followerCount)} followers</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="font-mono text-[10px] text-zinc-600">
                        Latest{" "}
                        {builder.latestAt ? <RelativeTime date={builder.latestAt} /> : "recently"}
                      </span>
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
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-[26px] bg-zinc-950 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
              Trending stacks
            </div>
            <h3 className="mt-2 text-[18px] font-medium tracking-[-0.03em] text-zinc-100">
              What the network is using
            </h3>
          </div>
          <Link
            href="/tools"
            className="rounded-full bg-black px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] transition-colors hover:text-white"
          >
            Explore
          </Link>
        </div>

        <div className="mt-5 space-y-2">
          {discovery.stacks.length === 0 ? (
            <p className="rounded-[18px] bg-black/50 p-4 text-sm leading-6 text-zinc-500">
              Stack trends will fill in as published receipts are tagged.
            </p>
          ) : (
            discovery.stacks.map((stack) => (
              <Link
                key={`${stack.kind}:${stack.tag}`}
                href={stackHref(stack)}
                className="group flex items-center justify-between gap-4 rounded-[18px] bg-black/55 px-4 py-3 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-black hover:shadow-[0_0_0_1px_rgba(167,243,0,0.2)]"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium tracking-[-0.02em] text-zinc-200">
                    {stack.label}
                  </div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                    {stack.kind}
                  </div>
                </div>
                <div className="text-right font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-600 tabular-nums">
                  <div className="text-[#a7f300]">{formatCount(stack.receiptCount)} receipts</div>
                  <div>{formatCount(stack.builderCount)} builders</div>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </>
  );
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<FeedSearchParams>;
}) {
  const sp = await searchParams;
  const view = normalizeFeedView(sp.view);

  let viewerId: string | null;
  let rows: FeedRow[];
  let discovery: FeedDiscovery;

  viewerId = await loadViewerId();
  if (view === "following") {
    if (!viewerId) redirect(FOLLOWING_SIGN_IN_HREF);
    [rows, discovery] = await Promise.all([
      loadFollowingFeed(viewerId),
      loadFeedDiscovery(viewerId),
    ]);
  } else {
    [rows, discovery] = await Promise.all([loadPublicFeed(viewerId), loadFeedDiscovery(viewerId)]);
  }

  const isFollowingView = view === "following";
  const followingHref = viewerId ? "/feed?view=following" : FOLLOWING_SIGN_IN_HREF;
  const subtitle = isFollowingView
    ? "A tighter stream of public receipts from builders you follow."
    : "Public AI-building sessions stay open. Sign in only when you want to follow, react, and build a personal timeline.";
  const feedTitle = isFollowingView ? "Your builder radar." : "Watch AI builders ship in public.";
  const feedCountLabel = `${rows.length} ${rows.length === 1 ? "receipt" : "receipts"}`;

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav currentPath="/feed" />

      <main className="flex-1 w-full">
        <section className="border-b border-zinc-900 bg-[radial-gradient(circle_at_top_left,rgba(167,243,0,0.09),transparent_34%),linear-gradient(180deg,rgba(24,24,27,0.7),rgba(0,0,0,0))]">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-16">
            <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
              <div>
                <div className="mb-4 text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500">
                  <span className="text-[#a7f300]">●</span>&nbsp;&nbsp;
                  {isFollowingView ? "Following feed" : "Everyone feed"}
                </div>
                <h1 className="font-display text-[36px] leading-[0.98] tracking-[-0.04em] text-balance text-zinc-50 sm:text-[46px] md:text-[68px]">
                  {feedTitle}
                </h1>
                <p className="mt-5 max-w-2xl text-pretty text-[15px] leading-[1.7] text-zinc-400 md:text-[17px]">
                  {subtitle}
                </p>

                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <TrailLink
                    href={followingHref}
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#a7f300] px-5 text-[12px] font-mono uppercase tracking-[0.14em] text-black transition-[background-color,transform] hover:bg-[#c8ff5e] active:scale-[0.96]"
                  >
                    {viewerId ? "Open following" : "Sign in to follow"}
                  </TrailLink>
                  <Link
                    href="/install"
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-[12px] font-mono uppercase tracking-[0.14em] text-zinc-200 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] transition-[box-shadow,transform,color] hover:text-white hover:shadow-[0_0_0_1px_rgba(255,255,255,0.16)] active:scale-[0.96]"
                  >
                    Install locally
                  </Link>
                </div>

                <dl className="mt-8 grid max-w-3xl gap-px overflow-hidden rounded-[18px] bg-white/[0.07] text-sm shadow-[0_0_0_1px_rgba(255,255,255,0.06)] sm:grid-cols-5">
                  {[
                    ["Builders", formatCount(discovery.stats.builders)],
                    ["Receipts", formatCount(discovery.stats.receipts)],
                    ["Shipped", formatCount(discovery.stats.shipped)],
                    ["Reactions", formatCount(discovery.stats.reactions)],
                    ["Comments", formatCount(discovery.stats.comments)],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-black/70 px-4 py-3">
                      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                        {label}
                      </dt>
                      <dd className="mt-1 truncate font-mono text-[12px] text-zinc-200 tabular-nums">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="rounded-[28px] bg-zinc-950/80 p-1 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur">
                <div className="rounded-[24px] bg-black/60 p-4">
                  <div className="grid grid-cols-2 gap-1 rounded-full bg-zinc-950 p-1 text-[12px] font-mono uppercase tracking-[0.12em] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
                    <Link
                      href="/feed"
                      className={`inline-flex min-h-10 items-center justify-center rounded-full px-4 transition-[background-color,color,transform] active:scale-[0.96] ${
                        isFollowingView
                          ? "text-zinc-500 hover:text-zinc-200"
                          : "bg-zinc-100 text-zinc-950"
                      }`}
                    >
                      Everyone
                    </Link>
                    <TrailLink
                      href={followingHref}
                      className={`inline-flex min-h-10 items-center justify-center rounded-full px-4 transition-[background-color,color,transform] active:scale-[0.96] ${
                        isFollowingView
                          ? "bg-[#a7f300] text-zinc-950"
                          : "text-zinc-500 hover:text-zinc-200"
                      }`}
                    >
                      Following
                    </TrailLink>
                  </div>

                  <div className="mt-5 space-y-2">
                    {discoveryLinks.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="group block rounded-[18px] bg-zinc-950 px-4 py-3 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-zinc-900/80 hover:shadow-[0_0_0_1px_rgba(167,243,0,0.22)]"
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
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-6xl gap-8 px-3 py-8 sm:px-4 md:px-6 md:py-10 lg:grid-cols-[minmax(0,720px)_320px]">
          <section className="min-w-0 overflow-hidden rounded-[22px] bg-zinc-950 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_28px_90px_rgba(0,0,0,0.38)] sm:rounded-[28px]">
            <div className="sticky top-[105px] z-20 border-b border-zinc-900/90 bg-zinc-950 shadow-[0_16px_36px_rgba(0,0,0,0.38)] backdrop-blur-xl md:top-14">
              <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5 md:px-6">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">
                    Live timeline
                  </div>
                  <h2 className="mt-1 text-[22px] font-medium tracking-[-0.03em] text-zinc-50">
                    {isFollowingView ? "Following" : "Everyone"}
                  </h2>
                </div>
                <span className="rounded-full bg-black px-3 py-2 font-mono text-[11px] text-zinc-500 tabular-nums shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
                  {feedCountLabel}
                </span>
              </div>
              <div className="grid grid-cols-2 border-t border-zinc-900/90 p-1 pb-2">
                <Link
                  href="/feed"
                  className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 text-[12px] font-mono uppercase tracking-[0.14em] transition-[background-color,color,transform] active:scale-[0.96] ${
                    isFollowingView
                      ? "text-zinc-500 hover:text-zinc-200"
                      : "bg-zinc-100 text-zinc-950"
                  }`}
                >
                  Everyone
                </Link>
                <TrailLink
                  href={followingHref}
                  className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 text-[12px] font-mono uppercase tracking-[0.14em] transition-[background-color,color,transform] active:scale-[0.96] ${
                    isFollowingView
                      ? "bg-[#a7f300] text-zinc-950"
                      : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  Following
                </TrailLink>
              </div>
            </div>

            {!viewerId && !isFollowingView && (
              <div className="border-b border-zinc-900 bg-[linear-gradient(135deg,rgba(167,243,0,0.09),transparent_42%),#09090b] px-5 py-5 md:px-6">
                <div className="grid gap-4 md:grid-cols-[52px_1fr]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#a7f300] font-mono text-[13px] text-black shadow-[0_0_32px_rgba(167,243,0,0.22)]">
                    01
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#a7f300]">
                      Start here
                    </div>
                    <h3 className="mt-2 text-balance text-[21px] font-medium tracking-[-0.03em] text-zinc-50">
                      Read the open feed first. Follow builders when the signal is worth tuning.
                    </h3>
                    <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-zinc-400">
                      Everyone can browse public receipts, see the tools and frameworks behind the
                      work, and install Trail locally. GitHub sign-in only gates following and
                      account actions.
                    </p>
                    <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
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
              </div>
            )}

            {rows.length === 0 ? (
              <div className="px-6 py-14 text-center">
                {isFollowingView ? (
                  <p className="mx-auto max-w-xl text-pretty text-sm leading-relaxed text-zinc-400">
                    Your Following timeline is empty. Follow builders from{" "}
                    <Link href="/feed" className="text-[#a7f300] hover:underline">
                      Everyone
                    </Link>
                    , or browse{" "}
                    <Link href="/tools" className="text-[#a7f300] hover:underline">
                      AI tools
                    </Link>{" "}
                    to find people shipping in your stack.
                  </p>
                ) : (
                  <p className="mx-auto max-w-xl text-pretty text-sm leading-relaxed text-zinc-400">
                    No public sessions yet. Install Trail and share one with{" "}
                    <span className="font-mono text-zinc-200">trail share latest</span>.
                  </p>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-zinc-900/90 border-t border-zinc-900/70 bg-black/20 pt-6">
                {rows.map((r) => {
                  const authorHref = profileHref(r);
                  const currentReceiptHref = receiptHref(r);
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

                  return (
                    <li key={r.id}>
                      <article className="group grid grid-cols-[44px_minmax(0,1fr)] gap-4 px-4 py-5 transition-[background-color] hover:bg-zinc-900/45 sm:px-5 md:grid-cols-[52px_minmax(0,1fr)] md:px-6">
                        <Link
                          href={authorHref}
                          className="mt-0.5 inline-flex h-11 w-11 items-center justify-center rounded-full transition-transform group-hover:scale-[1.03] active:scale-[0.96] md:h-12 md:w-12"
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
                          <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                                <Link
                                  href={authorHref}
                                  className="max-w-[220px] truncate font-medium tracking-tight text-zinc-100 transition-colors hover:text-white"
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
                              {r.bio && (
                                <p className="mt-1 line-clamp-2 text-pretty text-[13px] leading-relaxed text-zinc-500">
                                  {r.bio}
                                </p>
                              )}
                            </div>

                            {viewerId && viewerId !== r.authorId ? (
                              <FollowButton
                                targetUserId={r.authorId}
                                initialFollowing={r.isFollowing}
                                className="w-full justify-center sm:w-auto"
                              />
                            ) : !viewerId ? (
                              <TrailLink
                                href={signInHref(authorHref)}
                                className="inline-flex min-h-9 w-full shrink-0 items-center justify-center rounded-full border border-zinc-800 px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-300 transition-[border-color,color,transform] hover:border-[#a7f300] hover:text-[#a7f300] active:scale-[0.96] sm:w-auto"
                              >
                                Follow
                              </TrailLink>
                            ) : null}
                          </div>

                          <Link href={currentReceiptHref} className="mt-3 block">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex min-h-8 items-center gap-2 rounded-full bg-black px-3 font-mono text-[11px] text-zinc-400 shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
                                <ToolIcon name={r.tool} size={13} className="text-[#a7f300]" />
                                {formatToolName(r.tool)}
                              </span>
                              {badge && (
                                <span className="inline-flex min-h-8 items-center rounded-full bg-[#a7f300]/10 px-3 font-mono text-[11px] text-[#a7f300] shadow-[0_0_0_1px_rgba(167,243,0,0.14)]">
                                  {badge}
                                </span>
                              )}
                            </div>

                            <h3 className="mt-4 break-words text-balance text-[20px] font-medium leading-snug tracking-[-0.03em] text-zinc-100 transition-colors group-hover:text-white">
                              {r.title ?? r.slug}
                            </h3>
                            {r.summary && (
                              <p className="mt-2 line-clamp-4 break-words text-pretty text-[15px] leading-relaxed text-zinc-400">
                                {r.summary}
                              </p>
                            )}
                          </Link>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {chips.map((chip) => (
                              <span
                                key={chip}
                                className="inline-flex min-h-8 items-center rounded-full bg-zinc-900 px-3 font-mono text-[11px] text-zinc-400 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
                              >
                                {chip}
                              </span>
                            ))}
                          </div>

                          <div className="mt-5 flex flex-col items-start gap-3 border-t border-zinc-900/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-zinc-500 tabular-nums">
                              {metrics.map((metric) => (
                                <span key={metric.label}>
                                  <span className="text-zinc-700">{metric.label}</span>{" "}
                                  {metric.value}
                                </span>
                              ))}
                              {repoLabel && (
                                <span className="max-w-full truncate sm:max-w-[260px]">
                                  <span className="text-zinc-700">Repo</span> {repoLabel}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mt-4 flex flex-col gap-3 rounded-[18px] bg-zinc-950/70 p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] sm:flex-row sm:items-center sm:justify-between">
                            <ReactionBar
                              slug={r.slug}
                              authorHandle={r.handle}
                              variant="inline"
                              summary={reactionSummary(r)}
                              initialCounts={{
                                worked: r.workedReactions + r.verifiedReactions,
                                "needs-tweak": r.tweakReactions,
                                broken: r.brokenReactions,
                              }}
                              initialMine={r.viewerReactions}
                              className="flex-1"
                            />

                            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                              <Link
                                href={`${currentReceiptHref}#conversation`}
                                className="inline-flex min-h-9 flex-1 items-center justify-center rounded-full border border-zinc-800 bg-black px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400 transition-[border-color,color,transform] hover:border-amber-200 hover:text-amber-100 active:scale-[0.96] sm:flex-none"
                              >
                                {formatCount(r.commentCount)}{" "}
                                {r.commentCount === 1 ? "comment" : "comments"}
                              </Link>
                              <CopyButton
                                value={currentPublicReceiptUrl}
                                label="Copy link"
                                copiedLabel="Copied"
                                className="min-h-9 flex-1 justify-center rounded-full border-zinc-800 bg-black px-3 text-[11px] text-zinc-400 sm:flex-none"
                              />
                              <a
                                href={tweetHref}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex min-h-9 flex-1 items-center justify-center rounded-full border border-zinc-800 bg-black px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400 transition-[border-color,color,transform] hover:border-[#a7f300] hover:text-[#a7f300] active:scale-[0.96] sm:flex-none"
                              >
                                Share on X
                              </a>
                              <Link
                                href={currentReceiptHref}
                                className="inline-flex min-h-9 flex-1 items-center justify-center rounded-full bg-[#a7f300] px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-black transition-[background-color,transform] hover:bg-[#c8ff5e] active:scale-[0.96] sm:flex-none"
                              >
                                Open →
                              </Link>
                            </div>
                          </div>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="space-y-4 lg:hidden">
            <FeedDiscoveryPanel discovery={discovery} viewerId={viewerId} />
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-4">
              <FeedDiscoveryPanel discovery={discovery} viewerId={viewerId} />

              <section className="rounded-[26px] bg-zinc-950 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_20px_60px_rgba(0,0,0,0.26)]">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#a7f300]">
                  How to read it
                </div>
                <p className="mt-3 text-pretty text-sm leading-relaxed text-zinc-400">
                  Trail receipts are build logs as social posts: who shipped, which agent they used,
                  what stack showed up, and the proof you can inspect.
                </p>
                <div className="mt-5 space-y-3">
                  {onboardingSteps.map((step) => (
                    <div key={step.n} className="grid grid-cols-[28px_1fr] gap-3">
                      <span className="font-mono text-[11px] text-zinc-600 tabular-nums">
                        {step.n}
                      </span>
                      <div>
                        <div className="text-sm font-medium tracking-tight text-zinc-100">
                          {step.title}
                        </div>
                        <p className="mt-1 text-pretty text-[12px] leading-relaxed text-zinc-500">
                          {step.body}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[26px] bg-zinc-950 p-2 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_20px_60px_rgba(0,0,0,0.26)]">
                {discoveryLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="group block rounded-[20px] px-4 py-4 transition-[background-color,transform] hover:bg-zinc-900/80 active:scale-[0.98]"
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
              </section>
            </div>
          </aside>
        </div>
      </main>

      <footer className="mt-10 border-t border-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs font-mono text-zinc-500">
          <span>© 2026 Trail</span>
          <Link href="/" className="hover:text-zinc-200 transition-colors">
            Home
          </Link>
        </div>
      </footer>
    </div>
  );
}
