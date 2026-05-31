import { FollowButton } from "@/components/follow-button";
import { RelativeTime } from "@/components/relative-time";
import { SiteNav } from "@/components/site-nav";
import { ToolIcon } from "@/components/tool-icon";
import { Avatar } from "@/components/ui/avatar";
import { type RankableSession, normalizeFeedView, rankFeed } from "@/lib/follow";
import { formatDuration } from "@/lib/session-metrics";
import { githubAvatar } from "@/lib/share";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

const FEED_LIMIT = 80;
const FOLLOWING_SIGN_IN_HREF = signInHref("/feed?view=following");

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
}

interface FeedRow extends BaseFeedRow {
  isFollowing: boolean;
}

type FeedSearchParams = {
  view?: string | string[];
};

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

  const ranked = rankFeed(rows);
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
  return rankFeed(rows).map((row) => ({ ...row, isFollowing: row.authorId !== viewerId }));
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

  if (view === "following") {
    viewerId = await loadViewerId();
    if (!viewerId) redirect(FOLLOWING_SIGN_IN_HREF);
    rows = await loadFollowingFeed(viewerId);
  } else {
    viewerId = await loadViewerId();
    rows = await loadPublicFeed(viewerId);
  }

  const isFollowingView = view === "following";
  const followingHref = viewerId ? "/feed?view=following" : FOLLOWING_SIGN_IN_HREF;
  const subtitle = isFollowingView
    ? "A tighter stream of public receipts from builders you follow."
    : "Public AI-building sessions stay open. Sign in only when you want to follow, react, and build a personal timeline.";
  const feedTitle = isFollowingView ? "Your builder radar." : "Watch AI builders ship in public.";
  const feedCountLabel = `${rows.length} ${rows.length === 1 ? "receipt" : "receipts"}`;
  const identityLabel = viewerId ? "Signed in" : "Anonymous mode";

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

                <dl className="mt-8 grid max-w-2xl gap-px overflow-hidden rounded-[18px] bg-white/[0.07] text-sm shadow-[0_0_0_1px_rgba(255,255,255,0.06)] sm:grid-cols-3">
                  {[
                    ["Mode", identityLabel],
                    ["Current view", isFollowingView ? "Following" : "Everyone"],
                    ["Loaded", feedCountLabel],
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
              <ul className="divide-y divide-zinc-900/90 border-t border-zinc-900/70 bg-black/20 pt-2">
                {rows.map((r) => {
                  const authorHref = profileHref(r);
                  const currentReceiptHref = receiptHref(r);
                  const displayName = r.name || r.handle || "Trail builder";
                  const handleLabel = r.handle ? `@${r.handle}` : "anonymous";
                  const repoLabel = r.linkedRepo ?? r.repo;
                  const badge = receiptBadge(r);
                  const chips = stackChips(r);
                  const metrics = timelineMetrics(r);

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
                            <Link
                              href={currentReceiptHref}
                              className="inline-flex min-h-10 items-center rounded-full px-0 font-mono text-[11px] uppercase tracking-[0.14em] text-[#a7f300] transition-[color,transform] hover:text-[#c8ff5e] active:scale-[0.96]"
                            >
                              Open receipt →
                            </Link>
                          </div>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-4">
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
