import { RelativeTime } from "@/components/relative-time";
import { SiteNav } from "@/components/site-nav";
import { ToolIcon } from "@/components/tool-icon";
import { type RankableSession, normalizeFeedView, rankFeed } from "@/lib/follow";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const FEED_LIMIT = 80;
const FOLLOWING_SIGN_IN_HREF = `/api/auth/sign-in/github?callbackURL=${encodeURIComponent(
  "/feed?view=following",
)}`;

// /feed — open discovery by default. Everyone can browse public sessions; the
// following timeline is personalized and therefore remains signed-in only.
// Joins always key on trail_session.id / userId (slugs are unique only per-user,
// never globally) and filter visibility = 'public' in SQL.

interface FeedRow extends RankableSession {
  slug: string;
  title: string | null;
  summary: string | null;
  tool: string;
  eventCount: number;
  handle: string | null;
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

async function loadPublicFeed(): Promise<FeedRow[]> {
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
      handle: schema.user.handle,
    })
    .from(schema.trailSession)
    .innerJoin(schema.user, eq(schema.trailSession.userId, schema.user.id))
    .where(and(eq(schema.trailSession.visibility, "public"), isNotNull(schema.user.handle)))
    .orderBy(
      desc(sql`coalesce(${schema.trailSession.sharedAt}, ${schema.trailSession.startedAt})`),
      desc(schema.trailSession.id),
    )
    .limit(FEED_LIMIT);

  return rankFeed(rows);
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
      handle: schema.user.handle,
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
  return rankFeed(rows);
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
    [viewerId, rows] = await Promise.all([loadViewerId(), loadPublicFeed()]);
  }

  const isFollowingView = view === "following";
  const followingHref = viewerId ? "/feed?view=following" : FOLLOWING_SIGN_IN_HREF;
  const subtitle = isFollowingView
    ? "Public sessions from builders you follow."
    : "Public AI-building sessions, newest first. Browse before you sign in.";

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav currentPath="/feed" />

      <main className="flex-1 max-w-5xl mx-auto px-6 py-16 w-full">
        <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500">
              <span className="text-[#a7f300]">●</span>&nbsp;&nbsp;Open feed
            </div>
            <h1 className="text-4xl font-medium tracking-tight text-zinc-50 mb-2">
              {isFollowingView ? "Following" : "Feed"}
            </h1>
            <p className="text-sm text-zinc-400 max-w-xl">{subtitle}</p>
          </div>

          <div className="inline-flex w-fit rounded-full border border-zinc-900 bg-zinc-950 p-1 text-[12px] font-mono uppercase tracking-[0.12em]">
            <Link
              href="/feed"
              className={`rounded-full px-4 py-2 transition-colors ${
                isFollowingView ? "text-zinc-500 hover:text-zinc-200" : "bg-zinc-100 text-zinc-950"
              }`}
            >
              Everyone
            </Link>
            <Link
              href={followingHref}
              className={`rounded-full px-4 py-2 transition-colors ${
                isFollowingView ? "bg-[#a7f300] text-zinc-950" : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              Following
            </Link>
          </div>
        </div>

        {!viewerId && !isFollowingView && (
          <div className="mb-6 rounded-md border border-[#a7f300]/20 bg-[#a7f300]/5 px-4 py-3 text-sm text-zinc-300">
            Browse freely.{" "}
            <a
              href="/api/auth/sign-in/github?callbackURL=/feed"
              className="text-[#a7f300] hover:underline"
            >
              Sign in
            </a>{" "}
            when you want to follow builders and build a personal timeline.
          </div>
        )}

        {rows.length === 0 ? (
          <div className="border border-zinc-900 bg-zinc-950 rounded-md p-10 text-center">
            {isFollowingView ? (
              <p className="text-sm text-zinc-400">
                Your following feed is empty. Follow builders on{" "}
                <Link href="/discover" className="text-[#a7f300] hover:underline">
                  Discover
                </Link>{" "}
                to fill it up.
              </p>
            ) : (
              <p className="text-sm text-zinc-400">
                No public sessions yet. Share one with{" "}
                <span className="font-mono text-zinc-200">trail share latest</span>.
              </p>
            )}
          </div>
        ) : (
          <ul className="grid md:grid-cols-2 gap-4">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/u/${r.handle ?? "anon"}/${r.slug}`}
                  className="group block border border-zinc-900 bg-zinc-950 rounded-md p-5 hover:border-zinc-700 hover:bg-zinc-900/40 transition-colors h-full"
                >
                  <div className="text-[15px] text-zinc-100 font-medium leading-snug group-hover:text-white line-clamp-2">
                    {r.title ?? r.slug}
                  </div>
                  {r.summary && (
                    <p className="mt-2 text-sm text-zinc-400 line-clamp-2 leading-relaxed">
                      {r.summary}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-zinc-500">
                    <span className="inline-flex items-center gap-1.5">
                      <ToolIcon name={r.tool} size={11} className="text-zinc-500" />
                      {r.tool}
                    </span>
                    {r.handle && <span className="text-zinc-400">@{r.handle}</span>}
                    <span className="tabular-nums">{r.eventCount} ev</span>
                    <RelativeTime date={r.sharedAt ?? r.startedAt} className="tabular-nums" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>

      <footer className="border-t border-zinc-900 mt-10">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between text-xs font-mono text-zinc-500">
          <span>© 2026 Trail</span>
          <Link href="/" className="hover:text-zinc-200 transition-colors">
            Home
          </Link>
        </div>
      </footer>
    </div>
  );
}
