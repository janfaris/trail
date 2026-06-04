import { CopyButton } from "@/components/copy-button";
import { CostEfficiencyBand, CostEfficiencyBandSkeleton } from "@/components/cost-efficiency-band";
import { EmptyBuildPostCard } from "@/components/empty-build-post-card";
import { FeatureToggle } from "@/components/feature-toggle";
import { FeaturedSessionCard } from "@/components/featured-session-card";
import { FollowButton } from "@/components/follow-button";
import { LanguagesBar, topLanguages } from "@/components/languages-bar";
import { ProfileIntroCard } from "@/components/profile-intro-card";
import { RelativeTime } from "@/components/relative-time";
import { SiteNav } from "@/components/site-nav";
import { ToolIcon } from "@/components/tool-icon";
import { ToolMixBar } from "@/components/tool-mix-bar";
import { TopRepos } from "@/components/top-repos";
import { Avatar } from "@/components/ui/avatar";
import { VelocitySparkline } from "@/components/velocity-sparkline";
import { VerifiedBadge } from "@/components/verified-badge";
import { db, schema } from "@/db/client";
import { computeUserStats } from "@/lib/aggregates";
import { auth } from "@/lib/auth";
import { computeBuilderReputation } from "@/lib/builder-reputation";
import { formatRepoPath } from "@/lib/format";
import { formatDuration } from "@/lib/session-metrics";
import { githubAvatar, shareUrl, tweetIntent } from "@/lib/share";
import { computeStreak } from "@/lib/streak";
import { computeVerifiedBuilder } from "@/lib/verified-builder";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

function parseUsd(raw: string | null | undefined): number {
  if (raw == null) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function GitHubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className="shrink-0"
    >
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.57.1.78-.25.78-.55v-1.94c-3.2.7-3.88-1.37-3.88-1.37-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.25 3.35.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.73.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.07.78 2.16v3.2c0 .31.2.66.79.55A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

function XIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className="shrink-0"
    >
      <path d="M18.244 2H21.5l-7.5 8.57L23 22h-6.91l-4.84-6.34L5.7 22H2.44l8.03-9.18L1.5 2h7.06l4.37 5.79L18.244 2Zm-1.21 18h1.83L7.06 4H5.12l11.914 16Z" />
    </svg>
  );
}

function ArrowUpRightIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}

type TrailSessionRow = typeof schema.trailSession.$inferSelect;

type PageProps = { params: Promise<{ user: string }> };

interface ProfileEngagementRow {
  sessionId: string;
  reactions: number;
  comments: number;
}

interface ProfileStackRow {
  tag: string;
  count: number;
}

interface ProfileLessonSignalRow {
  lessons: number;
  saves: number;
  reuses: number;
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }
  return [];
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

function sessionTitle(s: TrailSessionRow): string {
  return s.title || s.receiptTldr || s.summary || "Untitled build post";
}

function sessionOutcome(s: TrailSessionRow): string {
  return (
    s.receiptOutcome ||
    s.receiptTldr ||
    s.summary ||
    "A public build post with optional proof details and conversation context."
  );
}

function sessionStatusLabel(s: TrailSessionRow): string {
  if (s.receiptStatus === "shipped") return "Verified ship";
  if (s.outcome === "shipped") return "Shipped";
  if (s.receiptStatus === "draft") return "Draft build";
  if (isPublicReceipt(s)) return "Public proof";
  return s.visibility === "public" ? "Unshared proof" : "Private proof";
}

function stackHref(tag: string): string {
  void tag;
  return "/discover";
}

function githubRepoUrl(repo: string | null | undefined): string | null {
  if (!repo) return null;
  const normalized = repo.replace(/^https?:\/\/github\.com\//, "").replace(/^github\.com\//, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(normalized)) return null;
  return `https://github.com/${normalized}`;
}

function isPublicReceipt(s: TrailSessionRow): boolean {
  return s.visibility === "public" && s.sharedAt != null;
}

const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://gettrail.vercel.app").replace(
  /\/$/,
  "",
);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { user } = await params;
  const builder = await db.query.user.findFirst({
    where: eq(schema.user.handle, user),
    columns: { id: true, name: true, handle: true },
  });

  const handle = builder?.handle ?? user;
  const displayName = builder?.name && builder.name !== handle ? builder.name : `@${handle}`;
  const profileUrl = `${baseUrl}/u/${handle}`;
  const imageUrl = `${profileUrl}/opengraph-image`;

  if (!builder) {
    return {
      title: `@${handle} on Trail`,
      description: "Trail builder profile, build posts, and proof links.",
      alternates: { canonical: profileUrl },
      openGraph: {
        title: `@${handle} on Trail`,
        description: "Trail builder profile, build posts, and proof links.",
        url: profileUrl,
        type: "profile",
        images: [{ url: imageUrl, width: 1200, height: 630, alt: `@${handle} on Trail` }],
      },
      twitter: {
        card: "summary_large_image",
        title: `@${handle} on Trail`,
        description: "Trail builder profile, build posts, and proof links.",
        images: [imageUrl],
      },
    };
  }

  const [stats] = await db
    .select({
      publicCount: sql<number>`count(*)::int`,
      shippedCount: sql<number>`count(*) filter (where ${schema.trailSession.receiptStatus} = 'shipped' or ${schema.trailSession.outcome} = 'shipped')::int`,
      eventCount: sql<number>`coalesce(sum(${schema.trailSession.eventCount}), 0)::int`,
    })
    .from(schema.trailSession)
    .where(
      and(
        eq(schema.trailSession.userId, builder.id),
        eq(schema.trailSession.visibility, "public"),
        isNotNull(schema.trailSession.sharedAt),
      ),
    );

  const [followers] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.follow)
    .where(eq(schema.follow.followingId, builder.id));

  const publicCount = Number(stats?.publicCount ?? 0);
  const shippedCount = Number(stats?.shippedCount ?? 0);
  const eventCount = Number(stats?.eventCount ?? 0);
  const followerCount = Number(followers?.count ?? 0);
  const title = `${displayName} (@${handle}) on Trail`;
  const description =
    publicCount > 0
      ? `${formatCount(publicCount)} public build posts, ${formatCount(shippedCount)} shipped outcomes, ${formatCount(eventCount)} proof events, and ${formatCount(followerCount)} followers.`
      : `Follow @${handle}'s build posts, shipped work, and builder proof on Trail.`;

  return {
    title,
    description,
    alternates: { canonical: profileUrl },
    openGraph: {
      title,
      description,
      url: profileUrl,
      type: "profile",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: `${displayName} Trail proof` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function UserProfile({ params }: PageProps) {
  const { user } = await params;
  const userRow = await db.query.user.findFirst({ where: eq(schema.user.handle, user) });
  if (!userRow) return notFound();
  const handle = userRow.handle ?? user;

  let sessionInfo: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    sessionInfo = await auth.api.getSession({ headers: await headers() });
  } catch {
    sessionInfo = null;
  }
  const isSelf = sessionInfo?.user?.id === userRow.id;

  const jar = await cookies();
  const seenIntro = jar.get("trail_seen_intro")?.value === "1";
  // Show the "Try Trail" panel to anyone who is NOT the profile owner
  // (anon visitors + signed-in strangers). Owners don't need install instructions.
  const showIntro = !isSelf && !seenIntro;

  const all = await db
    .select()
    .from(schema.trailSession)
    .where(
      and(
        eq(schema.trailSession.userId, userRow.id),
        // Owners see every visibility on their own profile; everyone else
        // (anon + signed-in strangers) only sees receipts that were explicitly shared.
        isSelf
          ? undefined
          : and(
              eq(schema.trailSession.visibility, "public"),
              isNotNull(schema.trailSession.sharedAt),
            ),
      ),
    )
    .orderBy(desc(schema.trailSession.isFeatured), desc(schema.trailSession.startedAt))
    .limit(100);

  const featured = all.filter((s) => s.isFeatured);
  const recent = all.filter((s) => !s.isFeatured);

  const totalEvents = all.reduce((n, s) => n + (s.eventCount ?? 0), 0);
  const tools = Array.from(new Set(all.map((s) => s.tool))).filter(Boolean);
  const avatar = userRow.image ?? githubAvatar(handle);

  const gh = userRow.githubHandle || handle;
  const x = userRow.xHandle;
  const li = userRow.linkedinHandle;
  const site = userRow.website;
  const location = userRow.location;
  const currentlyBuilding = userRow.currentlyBuilding;
  const hasSocials = Boolean(gh || x || li || site);
  const missingIdentityFields = [
    !userRow.bio ? "bio" : null,
    !location ? "location" : null,
    !currentlyBuilding ? "current build" : null,
  ].filter((field): field is string => Boolean(field));
  const showIdentityStrip = Boolean(location || currentlyBuilding || isSelf);
  const base = baseUrl;

  const viewerId = sessionInfo?.user?.id ?? null;
  const [followerRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.follow)
    .where(eq(schema.follow.followingId, userRow.id));
  const [followingRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.follow)
    .where(eq(schema.follow.followerId, userRow.id));
  const followerCount = followerRow?.count ?? 0;
  const followingCount = followingRow?.count ?? 0;
  let isFollowing = false;
  if (viewerId && !isSelf) {
    const existing = await db.query.follow.findFirst({
      where: and(eq(schema.follow.followerId, viewerId), eq(schema.follow.followingId, userRow.id)),
    });
    isFollowing = Boolean(existing);
  }

  const heroFeatured = featured[0];
  const compactFeatured = featured.slice(1);

  // Tier 1 metrics (computed at read time; 100-row cap is sub-ms).
  const totalSeconds = all.reduce((n, s) => n + (s.durationSeconds ?? 0), 0);
  const hoursLabel = (() => {
    if (totalSeconds <= 0) return "0m";
    if (totalSeconds < 3600) return `${Math.floor(totalSeconds / 60)}m`;
    return `${Math.floor(totalSeconds / 3600)}h`;
  })();
  const distinctRepos = new Set(all.map((s) => s.repo).filter(Boolean)).size;
  const durations = all
    .map((s) => s.durationSeconds)
    .filter((n): n is number => typeof n === "number" && n > 0)
    .sort((a, b) => a - b);
  const median = durations.length ? durations[Math.floor(durations.length / 2)] : null;
  const sharedDates = all
    .map((s) => s.sharedAt)
    .filter((d): d is Date => d instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime());
  const streak = computeStreak(sharedDates);
  const langs = topLanguages(all, 5);
  const tier2 = computeUserStats(all);
  const showTier2 = all.length >= 3;
  const failurePct = Math.round(tier2.failureRate * 1000) / 10;
  // Public proof-of-work credential — counts only public, commit-backed
  // shipped sessions, so it reads identically for owners and recruiters.
  const publicSessions = all.filter(isPublicReceipt);
  const publicEventCount = publicSessions.reduce((n, s) => n + (s.eventCount ?? 0), 0);
  const verifiedBuilder = computeVerifiedBuilder(publicSessions);
  const shippedPublicCount = publicSessions.filter(
    (s) => s.receiptStatus === "shipped" || s.outcome === "shipped",
  ).length;
  const latestPublicSession = [...publicSessions].sort(
    (a, b) => (b.sharedAt ?? b.startedAt).getTime() - (a.sharedAt ?? a.startedAt).getTime(),
  )[0];
  const heroSession = heroFeatured ?? latestPublicSession ?? all[0];
  const profileUrl = `${base}/u/${handle}`;
  const profileShareText = `${
    userRow.name || `@${handle}`
  } is shipping AI-built work on Trail: ${formatCount(publicSessions.length)} public build posts, ${formatCount(shippedPublicCount)} shipped.`;
  const profileTweetUrl = tweetIntent(profileShareText, profileUrl);

  const [engagementResult, stackResult, lessonSignalResult] = await Promise.all([
    db.execute(sql`
      select
        ts.id as "sessionId",
        count(distinct sr.id)::int as reactions,
        count(distinct sc.id)::int as comments
      from ${schema.trailSession} ts
      left join ${schema.sessionReaction} sr on sr.session_id = ts.id
      left join ${schema.sessionComment} sc on sc.session_id = ts.id and sc.deleted_at is null
      where ts.user_id = ${userRow.id}
        and ts.visibility = 'public'
        and ts.shared_at is not null
      group by ts.id
    `),
    db.execute(sql`
      select lower(st.tag) as tag, count(distinct ts.id)::int as count
      from ${schema.sessionTag} st
      join ${schema.trailSession} ts on ts.id = st.session_id
      where ts.user_id = ${userRow.id}
        and ts.visibility = 'public'
        and ts.shared_at is not null
      group by lower(st.tag)
      order by count desc, tag asc
      limit 8
    `),
    db.execute(sql`
      select
        count(distinct sl.id)::int as lessons,
        count(distinct saved.id) filter (where saved.user_id <> ${userRow.id})::int as saves,
        count(distinct used.id) filter (where used.user_id <> ${userRow.id})::int as reuses
      from ${schema.trailSession} ts
      left join ${schema.sessionLesson} sl on sl.session_id = ts.id
      left join ${schema.savedLesson} saved on saved.lesson_id = sl.id
      left join ${schema.lessonReuse} used on used.lesson_id = sl.id
      where ts.user_id = ${userRow.id}
        and ts.visibility = 'public'
        and ts.shared_at is not null
        and ts.redacted_at is null
    `),
  ]);
  const engagementRows = rowsOf<ProfileEngagementRow>(engagementResult);
  const engagementBySession = new Map(
    engagementRows.map((row) => [
      row.sessionId,
      {
        reactions: row.reactions ?? 0,
        comments: row.comments ?? 0,
      },
    ]),
  );
  const reactionCount = engagementRows.reduce((n, row) => n + (row.reactions ?? 0), 0);
  const commentCount = engagementRows.reduce((n, row) => n + (row.comments ?? 0), 0);
  const lessonSignal = rowsOf<ProfileLessonSignalRow>(lessonSignalResult)[0] ?? {
    lessons: 0,
    saves: 0,
    reuses: 0,
  };
  const reputation = computeBuilderReputation({
    publicReceipts: publicSessions.length,
    verifiedShips: verifiedBuilder.verifiedShippedCount,
    extractedLessons: lessonSignal.lessons ?? 0,
    lessonSaves: lessonSignal.saves ?? 0,
    lessonReuses: lessonSignal.reuses ?? 0,
    reactions: reactionCount,
    comments: commentCount,
    followers: followerCount,
    streakDays: streak.current,
  });
  const stackRows = rowsOf<ProfileStackRow>(stackResult).filter((row) => row.tag);
  const stackPills = stackRows.length
    ? stackRows
    : Array.from(new Set(publicSessions.map((s) => s.tool)))
        .filter((tool): tool is string => Boolean(tool))
        .slice(0, 8)
        .map((tool) => ({
          tag: tool,
          count: publicSessions.filter((s) => s.tool === tool).length,
        }));
  const topStack = stackPills[0]?.tag;
  const proofSummary = [
    `${userRow.name || `@${handle}`} on Trail`,
    `${formatCount(publicSessions.length)} public build posts · ${formatCount(shippedPublicCount)} shipped · ${formatCount(lessonSignal.lessons)} lessons · ${formatCount(lessonSignal.reuses)} moves reused`,
    `${formatCount(publicEventCount)} proof events · ${formatCount(followerCount)} followers`,
    `${reputation.label}: ${formatCount(reputation.score)} signal`,
    topStack ? `Top stack/tool: ${topStack}` : null,
    profileUrl,
  ]
    .filter(Boolean)
    .join("\n");
  const heroEngagement = heroSession
    ? (engagementBySession.get(heroSession.id) ?? { reactions: 0, comments: 0 })
    : null;
  const heroReceiptUrl =
    heroSession && isPublicReceipt(heroSession) ? shareUrl(handle, heroSession.slug, base) : null;
  const heroTweetUrl =
    heroSession && heroReceiptUrl
      ? tweetIntent(
          `${userRow.name || `@${handle}`} shipped: ${sessionTitle(heroSession)}`,
          heroReceiptUrl,
        )
      : null;
  const heroRepoUrl = heroSession
    ? githubRepoUrl(heroSession.linkedRepo ?? heroSession.repo)
    : null;

  return (
    <div className="min-h-screen overflow-hidden bg-[#060706] text-zinc-100">
      <SiteNav />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(167,243,0,0.09),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.018),transparent_38%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.025] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:44px_44px]"
      />

      <main className="relative mx-auto max-w-7xl px-4 pt-8 pb-24 sm:px-6 lg:px-8">
        {showIntro && <ProfileIntroCard />}

        {isSelf && (
          <div className="mb-6">
            <Suspense fallback={<CostEfficiencyBandSkeleton />}>
              <CostEfficiencyBand userId={userRow.id} />
            </Suspense>
          </div>
        )}

        <section className="relative overflow-hidden rounded-[2rem] bg-zinc-950/88 shadow-[var(--trail-shadow-border)]">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#a7f300] via-zinc-100 to-zinc-700"
          />
          <div
            aria-hidden
            className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#a7f300]/[0.06] blur-3xl"
          />
          <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.75fr)] lg:p-10">
            <div className="min-w-0">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-4">
                  <Avatar src={avatar} alt={handle} size={80} fallback={handle} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[#a7f300]/30 bg-[#a7f300]/10 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.22em] text-[#a7f300]">
                        Builder proof
                      </span>
                      <VerifiedBadge status={verifiedBuilder} />
                    </div>
                    <h1 className="mt-3 truncate text-4xl font-semibold tracking-[-0.04em] text-zinc-50 sm:text-5xl">
                      @{handle}
                    </h1>
                    {userRow.name && userRow.name !== handle && (
                      <p className="mt-1 text-base text-zinc-400">{userRow.name}</p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {!isSelf &&
                    (viewerId ? (
                      <FollowButton targetUserId={userRow.id} initialFollowing={isFollowing} />
                    ) : (
                      <Link
                        href={`/api/auth/sign-in/github?callbackURL=/u/${handle}`}
                        className="inline-flex min-h-10 items-center rounded-full bg-[#a7f300] px-4 text-sm font-semibold text-black transition-[background-color,transform] hover:bg-[#c8ff5e] active:scale-[0.96]"
                      >
                        Follow
                      </Link>
                    ))}
                  <CopyButton value={profileUrl} label="Copy profile" copiedLabel="Copied" />
                  <a
                    href={profileTweetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-zinc-900 px-3 text-xs font-mono text-zinc-300 shadow-[0_0_0_1px_rgba(255,255,255,0.12)] transition-[box-shadow,color,transform] hover:text-zinc-50 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.22)] active:scale-[0.96]"
                  >
                    <XIcon size={13} />
                    Share
                  </a>
                </div>
              </div>

              {userRow.bio ? (
                <p className="mt-6 max-w-3xl text-xl leading-snug text-zinc-200 sm:text-2xl">
                  {userRow.bio}
                </p>
              ) : (
                <p className="mt-6 max-w-3xl text-xl leading-snug text-zinc-400 sm:text-2xl">
                  AI-native builder publishing build posts and proof of work.
                </p>
              )}

              {showIdentityStrip ? (
                <div className="mt-6 grid max-w-4xl overflow-hidden rounded-[1.25rem] bg-black/28 shadow-[0_0_0_1px_rgba(255,255,255,0.07)] sm:grid-cols-2">
                  <div className="border-b border-white/10 px-4 py-3 sm:border-b-0 sm:border-r">
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                      Based in
                    </div>
                    <div className="mt-1 text-sm leading-6 text-zinc-200">
                      {location ?? "Add your city, region, or remote base"}
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                      Currently building
                    </div>
                    <div className="mt-1 text-sm leading-6 text-zinc-200">
                      {currentlyBuilding ?? "Tell builders what to ask you about"}
                    </div>
                  </div>
                  {isSelf && missingIdentityFields.length > 0 ? (
                    <Link
                      href="/settings"
                      className="border-t border-white/10 px-4 py-3 text-xs font-mono text-[#a7f300] transition-colors hover:text-zinc-50 sm:col-span-2"
                    >
                      Complete profile: {missingIdentityFields.join(", ")} →
                    </Link>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Build posts", publicSessions.length],
                  ["Verified ships", shippedPublicCount],
                  ["Moves reused", lessonSignal.reuses],
                  ["Builder signal", reputation.score],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-2xl bg-black/30 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.07)]"
                  >
                    <p className="text-2xl font-semibold tracking-tight text-zinc-50">
                      {formatCount(Number(value))}
                    </p>
                    <p className="mt-1 text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
                      {label}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2 text-xs font-mono text-zinc-400">
                <span className="rounded-full border border-[#a7f300]/25 bg-[#a7f300]/10 px-3 py-1 text-[#a7f300]">
                  {reputation.label} · {formatCount(reputation.score)}
                </span>
                <span className="rounded-full bg-white/[0.04] px-3 py-1">
                  {formatCount(totalEvents)} proof events
                </span>
                <span className="rounded-full bg-white/[0.04] px-3 py-1">{hoursLabel} logged</span>
                <span className="rounded-full bg-white/[0.04] px-3 py-1">
                  {streak.current}d streak
                </span>
                <span className="rounded-full bg-white/[0.04] px-3 py-1">
                  {formatCount(commentCount)} comments
                </span>
                {isSelf && (
                  <Link
                    href={`/u/${handle}/spend`}
                    className="rounded-full bg-zinc-900/80 px-3 py-1 text-zinc-400 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] transition-[box-shadow,color] hover:text-[#a7f300] hover:shadow-[0_0_0_1px_rgba(167,243,0,0.24)]"
                    title="Private — only you can see this"
                  >
                    Spend →
                  </Link>
                )}
              </div>

              {hasSocials && (
                <div className="mt-6 flex flex-wrap items-center gap-2 text-xs font-mono text-zinc-400">
                  {gh && (
                    <a
                      href={`https://github.com/${gh}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-3 py-1.5 transition-colors hover:bg-white/[0.08] hover:text-zinc-100"
                    >
                      <GitHubIcon size={14} />
                      GitHub
                    </a>
                  )}
                  {x && (
                    <a
                      href={`https://x.com/${x}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-3 py-1.5 transition-colors hover:bg-white/[0.08] hover:text-zinc-100"
                    >
                      <XIcon size={13} />X
                    </a>
                  )}
                  {li && (
                    <a
                      href={`https://linkedin.com/in/${li}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-3 py-1.5 transition-colors hover:bg-white/[0.08] hover:text-zinc-100"
                    >
                      LinkedIn
                    </a>
                  )}
                  {site && (
                    <a
                      href={site}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-[18rem] items-center gap-1.5 truncate rounded-full bg-white/[0.04] px-3 py-1.5 transition-colors hover:bg-white/[0.08] hover:text-zinc-100"
                    >
                      {site.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                </div>
              )}

              {stackPills.length > 0 && (
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {stackPills.map((stack) => (
                    <Link
                      key={stack.tag}
                      href={stackHref(stack.tag)}
                      className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-3 py-1.5 text-xs font-mono text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-[#a7f300]"
                    >
                      <span>{stack.tag}</span>
                      <span className="text-zinc-600">{stack.count}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <aside className="rounded-[1.5rem] bg-black/36 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500">
                  Pinned build
                </p>
                {heroSession && (
                  <span className="rounded-full bg-[#a7f300] px-2 py-0.5 text-[10px] font-mono font-semibold text-black">
                    {sessionStatusLabel(heroSession)}
                  </span>
                )}
              </div>
              {heroSession ? (
                <div className="rounded-[1.25rem] bg-zinc-950/80 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
                  <div className="flex items-start justify-between gap-3">
                    <ToolIcon name={heroSession.tool} className="mt-1 text-[#a7f300]" />
                    {isSelf && (
                      <FeatureToggle
                        sessionId={heroSession.id}
                        isFeatured={heroSession.isFeatured}
                      />
                    )}
                  </div>
                  <Link href={`/u/${handle}/${heroSession.slug}`} className="group mt-4 block">
                    <h2 className="text-2xl font-semibold leading-tight tracking-[-0.03em] text-zinc-50 group-hover:text-[#a7f300]">
                      {sessionTitle(heroSession)}
                    </h2>
                    <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-zinc-400">
                      {sessionOutcome(heroSession)}
                    </p>
                  </Link>
                  <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs font-mono text-zinc-500">
                    <div className="rounded-xl bg-white/[0.03] p-2">
                      <p className="text-zinc-100">{formatCount(heroSession.eventCount)}</p>
                      <p>events</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.03] p-2">
                      <p className="text-zinc-100">{formatCount(heroEngagement?.reactions ?? 0)}</p>
                      <p>react</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.03] p-2">
                      <p className="text-zinc-100">{formatCount(heroEngagement?.comments ?? 0)}</p>
                      <p>talk</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/u/${handle}/${heroSession.slug}`}
                      className="inline-flex min-h-10 flex-1 items-center justify-center rounded-full bg-[#a7f300]/10 px-3 text-xs font-mono text-[#a7f300] shadow-[0_0_0_1px_rgba(167,243,0,0.24)] transition-[background-color,transform] hover:bg-[#a7f300]/20 active:scale-[0.96]"
                    >
                      Open post
                    </Link>
                    <Link
                      href={`/u/${handle}/${heroSession.slug}#conversation`}
                      className="inline-flex min-h-10 items-center justify-center rounded-full px-3 text-xs font-mono text-zinc-300 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] transition-[box-shadow,color,transform] hover:text-zinc-50 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.18)] active:scale-[0.96]"
                    >
                      Comment
                    </Link>
                    {heroTweetUrl && (
                      <a
                        href={heroTweetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-10 items-center justify-center rounded-full px-3 text-xs font-mono text-zinc-300 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] transition-[box-shadow,color,transform] hover:text-zinc-50 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.18)] active:scale-[0.96]"
                      >
                        <XIcon size={13} />
                      </a>
                    )}
                    {heroRepoUrl && (
                      <a
                        href={heroRepoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-10 items-center justify-center rounded-full px-3 text-xs font-mono text-zinc-300 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] transition-[box-shadow,color,transform] hover:text-zinc-50 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.18)] active:scale-[0.96]"
                      >
                        Fork
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-[1.25rem] border border-dashed border-white/10 bg-zinc-950/70 p-5">
                  <p className="text-sm font-medium text-zinc-200">No public build posts yet.</p>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                    The first build post will become this builder&apos;s featured card.
                  </p>
                </div>
              )}
            </aside>
          </div>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-8">
            {compactFeatured.length > 0 && (
              <section className="rounded-[1.5rem] bg-zinc-950/70 shadow-[var(--trail-shadow-border)] p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500">
                    Curated builds
                  </h3>
                  <span className="text-xs font-mono text-zinc-600">
                    {compactFeatured.length} pinned
                  </span>
                </div>
                <div className="space-y-2">
                  {compactFeatured.map((s) => (
                    <FeaturedSessionCard key={s.id} session={s} handle={handle} variant="compact" />
                  ))}
                </div>
              </section>
            )}

            {all.length === 0 ? (
              isSelf ? (
                <div className="rounded-[1.5rem] bg-zinc-950/70 shadow-[var(--trail-shadow-border)] p-5">
                  <EmptyBuildPostCard />
                </div>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-zinc-950/60 p-8 text-center">
                  <p className="text-lg font-semibold text-zinc-200">
                    @{handle} has not published a build post yet.
                  </p>
                  <p className="mt-2 text-sm text-zinc-500">
                    Follow now and their first public ship will land in your feed.
                  </p>
                </div>
              )
            ) : recent.length > 0 ? (
              <section className="rounded-[1.5rem] bg-zinc-950/70 shadow-[var(--trail-shadow-border)]">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 sm:px-5">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100">Build history</h3>
                    <p className="mt-1 text-xs font-mono text-zinc-500">
                      Build posts, proof metrics, and conversation entry points.
                    </p>
                  </div>
                  <Link
                    href="/feed"
                    className="hidden rounded-full bg-white/[0.04] px-3 py-1.5 text-xs font-mono text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-[#a7f300] sm:inline-flex"
                  >
                    Open feed
                  </Link>
                </div>
                <ul>
                  {recent.map((s) => {
                    const repoShort = formatRepoPath(s.linkedRepo ?? s.repo);
                    const title = sessionTitle(s);
                    const costUsd = parseUsd(s.estimatedCostUsd);
                    const engagement = engagementBySession.get(s.id) ?? {
                      reactions: 0,
                      comments: 0,
                    };
                    const repoUrl = githubRepoUrl(s.linkedRepo ?? s.repo);
                    const receiptUrl = isPublicReceipt(s) ? shareUrl(handle, s.slug, base) : null;
                    return (
                      <li key={s.id} className="border-b border-white/10 last:border-b-0">
                        <article className="group grid gap-4 px-4 py-5 transition-colors hover:bg-zinc-900/45 sm:grid-cols-[3.5rem_1fr] sm:px-5">
                          <div className="hidden sm:flex sm:flex-col sm:items-center">
                            <span className="h-10 w-10 rounded-full border border-white/10 bg-black/40 p-2 text-[#a7f300]">
                              <ToolIcon name={s.tool} />
                            </span>
                            <span className="mt-3 h-full w-px bg-zinc-800 group-last:hidden" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-zinc-500">
                              <RelativeTime date={s.startedAt} className="tabular-nums" />
                              <span className="text-zinc-700">/</span>
                              <span>{sessionStatusLabel(s)}</span>
                              {repoShort && (
                                <>
                                  <span className="text-zinc-700">/</span>
                                  <span className="truncate">{repoShort}</span>
                                </>
                              )}
                              {costUsd > 0 && (
                                <>
                                  <span className="text-zinc-700">/</span>
                                  <span>{fmtUsd(costUsd)}</span>
                                </>
                              )}
                            </div>
                            <Link href={`/u/${handle}/${s.slug}`} className="mt-2 block">
                              <h4 className="text-lg font-semibold tracking-tight text-zinc-100 transition-colors group-hover:text-[#a7f300]">
                                {title}
                              </h4>
                              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-zinc-500">
                                {sessionOutcome(s)}
                              </p>
                            </Link>
                            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-mono">
                              <span className="rounded-full bg-white/[0.04] px-3 py-1 text-zinc-400">
                                {formatCount(s.eventCount)} events
                                {s.durationSeconds != null && (
                                  <span className="text-zinc-600">
                                    {" "}
                                    / {formatDuration(s.durationSeconds)}
                                  </span>
                                )}
                              </span>
                              <span className="rounded-full bg-white/[0.04] px-3 py-1 text-zinc-400">
                                {formatCount(engagement.reactions)} reactions
                              </span>
                              <Link
                                href={`/u/${handle}/${s.slug}#conversation`}
                                className="rounded-full bg-white/[0.04] px-3 py-1 text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-50"
                              >
                                {formatCount(engagement.comments)} comments
                              </Link>
                              {receiptUrl && (
                                <CopyButton value={receiptUrl} label="Copy" copiedLabel="Copied" />
                              )}
                              {repoUrl && (
                                <a
                                  href={repoUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-3 py-1 text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-50"
                                >
                                  Fork
                                  <ArrowUpRightIcon size={12} />
                                </a>
                              )}
                              {isSelf && (
                                <span className="ml-auto">
                                  <FeatureToggle sessionId={s.id} isFeatured={s.isFeatured} />
                                </span>
                              )}
                            </div>
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </div>

          <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            <section className="rounded-[1.5rem] bg-zinc-950/75 shadow-[var(--trail-shadow-border)] p-5">
              <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500">
                Builder status
              </p>
              <div className="mt-4 space-y-3 text-sm text-zinc-400">
                <div className="flex items-center justify-between">
                  <span>Builder signal</span>
                  <span className="font-mono text-[#a7f300]">{formatCount(reputation.score)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Lessons extracted</span>
                  <span className="font-mono text-zinc-200">
                    {formatCount(lessonSignal.lessons)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Moves reused</span>
                  <span className="font-mono text-zinc-200">
                    {formatCount(lessonSignal.reuses)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Verified builder</span>
                  <span className={verifiedBuilder.verified ? "text-[#a7f300]" : "text-zinc-500"}>
                    {verifiedBuilder.verified ? "Active" : "Pending"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Public shipped proof</span>
                  <span className="font-mono text-zinc-200">{shippedPublicCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Followers / following</span>
                  <span className="font-mono text-zinc-200">
                    {followerCount} / {followingCount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Repos touched</span>
                  <span className="font-mono text-zinc-200">{distinctRepos}</span>
                </div>
              </div>
            </section>

            {all.length > 0 && (
              <section className="rounded-[1.5rem] bg-zinc-950/75 shadow-[var(--trail-shadow-border)] p-5">
                <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500">
                  Proof graph
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-mono text-zinc-500">
                  <div>
                    <div className="text-lg text-zinc-100">{hoursLabel}</div>
                    <div>hours coded</div>
                  </div>
                  <div>
                    <div className="text-lg text-zinc-100">{streak.current}</div>
                    <div>day streak</div>
                  </div>
                  <div>
                    <div className="text-lg text-zinc-100">
                      {median ? formatDuration(median) : "—"}
                    </div>
                    <div>median session</div>
                  </div>
                  <div>
                    <div className="text-lg text-zinc-100">{streak.longest}</div>
                    <div>longest streak</div>
                  </div>
                </div>
                {showTier2 && (
                  <div className="mt-5">
                    <VelocitySparkline weeks={tier2.velocityWeekly} />
                    <p className="mt-1 text-xs font-mono text-zinc-500">last 12 weeks</p>
                  </div>
                )}
                {langs.length > 0 && <LanguagesBar langs={langs} />}
                {showTier2 && tier2.topToolCalls.length > 0 && (
                  <div className="mt-5">
                    <h4 className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
                      Agent actions
                    </h4>
                    <ToolMixBar tools={tier2.topToolCalls} />
                  </div>
                )}
                {showTier2 && tier2.topRepos.length > 0 && (
                  <div className="mt-5">
                    <h4 className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
                      Top repos
                    </h4>
                    <TopRepos items={tier2.topRepos} />
                  </div>
                )}
                {showTier2 && tier2.peakWeekday && (
                  <p className="mt-4 text-xs font-mono text-zinc-500">
                    Most active on {tier2.peakWeekday}s<span className="text-zinc-700"> / </span>
                    <span className="tabular-nums">{tier2.totalPrompts}</span> prompts
                    <span className="text-zinc-700"> / </span>
                    <span className="tabular-nums">{failurePct}%</span> tool-call errors
                  </p>
                )}
              </section>
            )}

            <section className="rounded-[1.5rem] bg-zinc-950/75 shadow-[var(--trail-shadow-border)] p-5">
              <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500">
                Shareable proof
              </p>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                {isSelf
                  ? "Use your profile or recruiter view as a proof-of-work link in DMs, applications, and launch posts."
                  : "Open the recruiter view for a compact scan of shipped, commit-backed work."}
              </p>
              <div className="mt-4 rounded-[1.25rem] bg-black/35 shadow-[var(--trail-shadow-border)] p-4">
                <p className="text-sm font-semibold text-zinc-100">
                  {userRow.name || `@${handle}`} builder proof
                </p>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                  {formatCount(publicSessions.length)} public build posts ·{" "}
                  {formatCount(shippedPublicCount)} shipped · {formatCount(lessonSignal.lessons)}{" "}
                  lessons · {formatCount(lessonSignal.reuses)} used by builders
                </p>
                <p className="mt-2 text-xs font-mono text-zinc-500">
                  {reputation.label} · {formatCount(reputation.score)} signal ·{" "}
                  {formatCount(publicEventCount)} proof events · {formatCount(followerCount)}{" "}
                  followers
                  {topStack ? ` · ${topStack}` : ""}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/u/${handle}/interview`}
                  className="inline-flex items-center gap-1 rounded-full border border-[#a7f300]/40 bg-[#a7f300]/10 px-3 py-2 text-xs font-mono text-[#a7f300] transition-colors hover:bg-[#a7f300]/20"
                >
                  Recruiter view
                  <ArrowUpRightIcon size={12} />
                </Link>
                <CopyButton value={proofSummary} label="Copy proof" copiedLabel="Copied" />
                <CopyButton
                  value={`${base}/u/${handle}/interview`}
                  label="Copy link"
                  copiedLabel="Copied"
                />
                <a
                  href={profileTweetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-3 py-2 text-xs font-mono text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-50"
                >
                  Post to X
                  <XIcon size={12} />
                </a>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
