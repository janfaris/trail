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

const discoveryLinks = [
  { href: "/tools", label: "AI tools" },
  { href: "/frameworks", label: "Frameworks" },
  { href: "/install", label: "Install CLI" },
];

const onboardingSteps = [
  {
    n: "01",
    title: "Browse openly",
    body: "The Everyone feed is public: no account needed to read sessions, costs, models, and merged work.",
  },
  {
    n: "02",
    title: "Sign in to follow",
    body: "GitHub sign-in unlocks follow buttons, reactions, and your personal Following feed.",
    href: FOLLOWING_SIGN_IN_HREF,
    cta: "Sign in",
  },
  {
    n: "03",
    title: "Install and share",
    body: "Run Trail locally, keep using your AI tools, then publish the sessions worth turning into proof.",
    href: "/install",
    cta: "Install",
  },
];

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
            <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] font-mono uppercase tracking-[0.12em]">
              <span className="text-zinc-600">Explore</span>
              {discoveryLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-full border border-zinc-900 bg-zinc-950 px-3 py-1.5 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-[#a7f300]"
                >
                  {link.label}
                </Link>
              ))}
            </div>
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
          <section className="mb-8 grid gap-px overflow-hidden rounded-md border border-zinc-900 bg-zinc-900 md:grid-cols-3">
            {onboardingSteps.map((step) => (
              <div key={step.n} className="bg-zinc-950 p-5">
                <div className="mb-4 font-mono text-[11px] text-[#a7f300] tracking-[0.14em]">
                  {step.n}
                </div>
                <h2 className="mb-2 text-[15px] font-medium tracking-tight text-zinc-50">
                  {step.title}
                </h2>
                <p className="text-sm leading-relaxed text-zinc-500">{step.body}</p>
                {step.href && step.cta && (
                  <div className="mt-4">
                    {step.href.startsWith("/api/") ? (
                      <a href={step.href} className="text-sm text-[#a7f300] hover:underline">
                        {step.cta} →
                      </a>
                    ) : (
                      <Link href={step.href} className="text-sm text-[#a7f300] hover:underline">
                        {step.cta} →
                      </Link>
                    )}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {rows.length === 0 ? (
          <div className="border border-zinc-900 bg-zinc-950 rounded-md p-10 text-center">
            {isFollowingView ? (
              <p className="text-sm text-zinc-400">
                Your following feed is empty. Follow builders on{" "}
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
