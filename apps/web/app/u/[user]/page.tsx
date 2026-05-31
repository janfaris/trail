import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { headers, cookies } from "next/headers";
import { db, schema } from "@/db/client";
import { eq, desc, and, sql } from "drizzle-orm";
import { Avatar } from "@/components/ui/avatar";
import { ToolIcon } from "@/components/tool-icon";
import { RelativeTime } from "@/components/relative-time";
import { SiteNav } from "@/components/site-nav";
import { FeaturedSessionCard } from "@/components/featured-session-card";
import { FeatureToggle } from "@/components/feature-toggle";
import { FollowButton } from "@/components/follow-button";
import { ProfileIntroCard } from "@/components/profile-intro-card";
import { EmptyInstallCard } from "@/components/empty-install-card";
import { githubAvatar } from "@/lib/share";
import { formatRepoPath } from "@/lib/format";
import { auth } from "@/lib/auth";
import { formatDuration } from "@/lib/session-metrics";
import { computeStreak } from "@/lib/streak";
import { LanguagesBar, topLanguages } from "@/components/languages-bar";
import { ToolMixBar } from "@/components/tool-mix-bar";
import { VelocitySparkline } from "@/components/velocity-sparkline";
import { TopRepos } from "@/components/top-repos";
import { computeUserStats } from "@/lib/aggregates";
import { CostEfficiencyBand, CostEfficiencyBandSkeleton } from "@/components/cost-efficiency-band";
import { VerifiedBadge } from "@/components/verified-badge";
import { computeVerifiedBuilder } from "@/lib/verified-builder";

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

export default async function UserProfile({ params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  const userRow = await db.query.user.findFirst({ where: eq(schema.user.handle, user) });
  if (!userRow) return notFound();

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
        // (anon + signed-in strangers) only sees public sessions.
        isSelf ? undefined : eq(schema.trailSession.visibility, "public"),
      ),
    )
    .orderBy(desc(schema.trailSession.isFeatured), desc(schema.trailSession.startedAt))
    .limit(100);

  const featured = all.filter((s) => s.isFeatured);
  const recent = all.filter((s) => !s.isFeatured);

  const totalEvents = all.reduce((n, s) => n + (s.eventCount ?? 0), 0);
  const tools = Array.from(new Set(all.map((s) => s.tool))).filter(Boolean);
  const avatar = userRow.image ?? githubAvatar(userRow.handle ?? user);

  const gh = userRow.githubHandle || userRow.handle;
  const x = userRow.xHandle;
  const li = userRow.linkedinHandle;
  const site = userRow.website;
  const hasSocials = Boolean(gh || x || li || site);

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
      where: and(
        eq(schema.follow.followerId, viewerId),
        eq(schema.follow.followingId, userRow.id),
      ),
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
  const median = durations.length
    ? durations[Math.floor(durations.length / 2)]
    : null;
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
  const verifiedBuilder = computeVerifiedBuilder(all);

  return (
    <div className="min-h-screen">
      <SiteNav />

      <main className="max-w-4xl mx-auto px-6 pt-10 pb-24">
        {showIntro && <ProfileIntroCard />}

        {isSelf && (
          <Suspense fallback={<CostEfficiencyBandSkeleton />}>
            <CostEfficiencyBand userId={userRow.id} />
          </Suspense>
        )}

        <div className="flex items-start gap-5 mb-10">
          <Avatar src={avatar} alt={userRow.handle ?? user} size={64} fallback={userRow.handle ?? user} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-2xl md:text-[28px] font-semibold tracking-tight leading-tight text-zinc-50 truncate">
                  @{userRow.handle}
                </h1>
                <VerifiedBadge status={verifiedBuilder} />
              </div>
              {!isSelf &&
                (viewerId ? (
                  <FollowButton targetUserId={userRow.id} initialFollowing={isFollowing} />
                ) : (
                  <Link
                    href={`/api/auth/sign-in/github?callbackURL=/u/${userRow.handle}`}
                    className="px-3 py-1 rounded-md text-sm font-medium border border-[#a7f300] bg-[#a7f300] text-black hover:bg-[#b6ff14] transition-colors"
                  >
                    Sign in to follow
                  </Link>
                ))}
            </div>
            {userRow.name && userRow.name !== userRow.handle && (
              <p className="text-sm text-zinc-400 mt-0.5">{userRow.name}</p>
            )}
            {userRow.bio ? (
              <p className="text-[15px] text-zinc-300 mt-2 leading-snug max-w-2xl">{userRow.bio}</p>
            ) : isSelf ? (
              <Link
                href="/settings"
                className="inline-block text-sm text-zinc-500 hover:text-[#a7f300] mt-2 font-mono"
              >
                Add a bio →
              </Link>
            ) : null}

            {hasSocials && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-xs font-mono text-zinc-400">
                {gh && (
                  <a
                    href={`https://github.com/${gh}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 hover:text-zinc-100"
                  >
                    <GitHubIcon size={14} />
                    GitHub
                  </a>
                )}
                {x && (
                  <>
                    <span className="text-zinc-700">·</span>
                    <a
                      href={`https://x.com/${x}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 hover:text-zinc-100"
                    >
                      <XIcon size={13} />
                      X
                    </a>
                  </>
                )}
                {li && (
                  <>
                    <span className="text-zinc-700">·</span>
                    <a
                      href={`https://linkedin.com/in/${li}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 hover:text-zinc-100"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                        <path d="M2.5 2A1.5 1.5 0 0 0 1 3.5v9A1.5 1.5 0 0 0 2.5 14h11a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 13.5 2h-11zM4.7 5.6a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM3.8 6.6h1.8v5.7H3.8V6.6zm3 0h1.7v.8c.24-.37.78-.95 1.86-.95 1.32 0 2.04.87 2.04 2.5v3.36h-1.78V9.32c0-.78-.27-1.27-.95-1.27-.52 0-.83.36-.97.7-.05.13-.07.31-.07.5v3.04H6.8V6.6z" />
                      </svg>
                      LinkedIn
                    </a>
                  </>
                )}
                <span className="text-zinc-700">·</span>
                <Link
                  href={`/u/${userRow.handle}/interview`}
                  className="inline-flex items-center gap-1.5 text-[#a7f300] hover:text-[#c8ff5e] transition-colors"
                  title="Recruiter mode — shipped trails only"
                >
                  Recruiter view →
                </Link>
                {site && (
                  <>
                    <span className="text-zinc-700">·</span>
                    <a
                      href={site}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-zinc-100 truncate max-w-[18rem]"
                    >
                      {site.replace(/^https?:\/\//, "")}
                    </a>
                  </>
                )}
              </div>
            )}

            <div className="mt-4 text-xs font-mono text-zinc-500 space-y-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  <span className="tabular-nums text-zinc-200">{all.length}</span>{" "}
                  session{all.length === 1 ? "" : "s"}
                </span>
                <span className="text-zinc-700">·</span>
                <span>
                  <span className="tabular-nums text-zinc-200">{totalEvents}</span> events
                </span>
                <span className="text-zinc-700">·</span>
                <span>
                  <span className="tabular-nums text-zinc-200">{followerCount}</span>{" "}
                  follower{followerCount === 1 ? "" : "s"}
                </span>
                <span className="text-zinc-700">·</span>
                <span>
                  <span className="tabular-nums text-zinc-200">{followingCount}</span> following
                </span>
                {isSelf && (
                  <>
                    <span className="text-zinc-700">·</span>
                    <Link
                      href={`/u/${userRow.handle}/spend`}
                      className="text-zinc-400 hover:text-[#a7f300] transition-colors"
                      title="Private — only you can see this"
                    >
                      Spend →
                    </Link>
                  </>
                )}
              </div>
              {tools.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-zinc-600">captures</span>
                  {tools.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 text-zinc-300"
                    >
                      <ToolIcon name={t} size={11} className="text-zinc-400" />
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {all.length > 0 && (
          <section className="mb-8 border-t border-zinc-900 pt-4">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 mb-3">
              Stats
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs font-mono text-zinc-500">
              <div>
                <div className="text-zinc-200 tabular-nums text-lg">{hoursLabel}</div>
                <div className="text-zinc-500">hours coded</div>
              </div>
              <div>
                <div className="text-zinc-200 tabular-nums text-lg">
                  {streak.current}
                </div>
                <div className="text-zinc-500">
                  day streak{" "}
                  <span className="text-zinc-600">(longest: {streak.longest})</span>
                </div>
              </div>
              <div>
                <div className="text-zinc-200 tabular-nums text-lg">{distinctRepos}</div>
                <div className="text-zinc-500">repos</div>
              </div>
              <div>
                <div className="text-zinc-200 tabular-nums text-lg">
                  {median ? formatDuration(median) : "—"}
                </div>
                <div className="text-zinc-500">median session</div>
              </div>
              {showTier2 && (
                <div>
                  <VelocitySparkline weeks={tier2.velocityWeekly} />
                  <div className="text-zinc-500 mt-1">last 12 weeks</div>
                </div>
              )}
            </div>
            {langs.length > 0 && <LanguagesBar langs={langs} />}
            {showTier2 && tier2.topToolCalls.length > 0 && (
              <div className="mt-5">
                <h4 className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
                  Actions
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
              <p className="mt-4 text-xs font-mono text-zinc-500 italic">
                Most active on {tier2.peakWeekday}s
                <span className="text-zinc-700"> · </span>
                <span className="tabular-nums">{tier2.totalPrompts}</span> prompts
                <span className="text-zinc-700"> · </span>
                <span className="tabular-nums">{failurePct}%</span> tool-call errors
              </p>
            )}
          </section>
        )}

        {heroFeatured && (
          <section className="mb-6">
            <FeaturedSessionCard
              session={heroFeatured}
              handle={userRow.handle ?? user}
              variant="hero"
            />
          </section>
        )}

        {compactFeatured.length > 0 && (
          <section className="mb-10 space-y-2">
            {compactFeatured.map((s) => (
              <FeaturedSessionCard
                key={s.id}
                session={s}
                handle={userRow.handle ?? user}
                variant="compact"
              />
            ))}
          </section>
        )}

        {all.length === 0 ? (
          isSelf ? (
            <div className="border-t border-zinc-900 pt-10">
              <EmptyInstallCard />
            </div>
          ) : (
            <div className="border-t border-zinc-900 pt-10">
              <p className="text-sm text-zinc-500">
                @{userRow.handle} hasn&apos;t shared any sessions yet.
              </p>
            </div>
          )
        ) : recent.length > 0 ? (
          <div>
            <div className="flex items-center justify-between px-2 mb-2 mt-4">
              <h3 className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
                Recent activity
              </h3>
            </div>
            <div className="border-t border-zinc-900">
              <div className="hidden md:grid grid-cols-[7rem_1.5rem_1fr_5rem_2rem] gap-3 px-2 py-2.5 text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-600 border-b border-zinc-900">
                <span>Date</span>
                <span />
                <span>Title</span>
                <span className="text-right">Events</span>
                <span />
              </div>
              <ul>
                {recent.map((s) => {
                  const repoShort = formatRepoPath(s.repo);
                  const title = s.title || s.slug;
                  const costUsd = parseUsd(s.estimatedCostUsd);
                  return (
                    <li key={s.id} className="border-b border-zinc-900 last:border-b-0">
                      <Link
                        href={`/u/${userRow.handle}/${s.slug}`}
                        title={repoShort ? `${title} — ${repoShort}` : title}
                        className="grid md:grid-cols-[7rem_1.5rem_1fr_5rem_2rem] grid-cols-[1fr_4rem] gap-3 items-center px-2 py-3 hover:bg-zinc-900/60 border-l-2 border-transparent hover:border-l-[#a7f300] transition-colors duration-150 group"
                      >
                        <RelativeTime
                          date={s.startedAt}
                          className="hidden md:block text-xs font-mono text-zinc-500 tabular-nums group-hover:text-zinc-300"
                        />
                        <ToolIcon name={s.tool} className="hidden md:block text-zinc-500 group-hover:text-zinc-200" />
                        <span className="min-w-0 flex items-center gap-2">
                          <span
                            className="text-sm text-zinc-200 truncate group-hover:text-zinc-50"
                            title={title}
                          >
                            {title}
                          </span>
                          {costUsd > 0 && (
                            <span
                              title="estimated cost"
                              className="shrink-0 inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900/80 px-1.5 py-0.5 text-[10px] font-mono tabular-nums text-zinc-400 group-hover:text-zinc-200"
                            >
                              {fmtUsd(costUsd)}
                            </span>
                          )}
                        </span>
                        <span className="md:text-right text-xs font-mono text-zinc-500 tabular-nums group-hover:text-zinc-300">
                          {s.eventCount}
                          {s.durationSeconds != null && (
                            <span className="ml-1 text-zinc-600">
                              · {formatDuration(s.durationSeconds)}
                            </span>
                          )}
                        </span>
                        {isSelf ? (
                          <span className="hidden md:flex justify-end">
                            <FeatureToggle sessionId={s.id} isFeatured={s.isFeatured} />
                          </span>
                        ) : (
                          <span className="hidden md:block" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
