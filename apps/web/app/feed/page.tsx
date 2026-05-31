import { RelativeTime } from "@/components/relative-time";
import { SiteNav } from "@/components/site-nav";
import { ToolIcon } from "@/components/tool-icon";
import { type RankableSession, normalizeFeedView, rankFeed } from "@/lib/follow";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

const FEED_LIMIT = 80;
const FOLLOWING_SIGN_IN_HREF = `/api/auth/sign-in/github?callbackURL=${encodeURIComponent(
  "/feed?view=following",
)}`;

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
          <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
            <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
              <div>
                <div className="mb-4 text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500">
                  <span className="text-[#a7f300]">●</span>&nbsp;&nbsp;
                  {isFollowingView ? "Following feed" : "Everyone feed"}
                </div>
                <h1 className="font-display text-[42px] leading-[0.98] tracking-[-0.04em] text-balance text-zinc-50 md:text-[68px]">
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

                <dl className="mt-8 grid max-w-2xl grid-cols-3 gap-px overflow-hidden rounded-[18px] bg-white/[0.07] text-sm shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
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

        <div className="mx-auto max-w-6xl px-6 py-10">
          {!viewerId && !isFollowingView && (
            <section className="mb-8 overflow-hidden rounded-[28px] bg-zinc-950 p-1 shadow-[0_0_0_1px_rgba(255,255,255,0.07),0_24px_70px_rgba(0,0,0,0.35)]">
              <div className="grid gap-px overflow-hidden rounded-[24px] bg-white/[0.07] md:grid-cols-[0.9fr_1fr_1fr_1fr]">
                <div className="bg-black p-5 md:p-6">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#a7f300]">
                    Start here
                  </div>
                  <h2 className="mt-3 text-balance text-[24px] font-medium tracking-[-0.03em] text-zinc-50">
                    Public first. Personal when you sign in.
                  </h2>
                  <p className="mt-3 text-pretty text-sm leading-relaxed text-zinc-500">
                    The feed is useful before an account. Sign in only when you want to tune it
                    around people and stacks you care about.
                  </p>
                </div>
                {onboardingSteps.map((step) => (
                  <div key={step.n} className="bg-zinc-950 p-5 md:p-6">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-600">
                        {step.label}
                      </span>
                      <span className="font-mono text-[11px] text-[#a7f300] tabular-nums">
                        {step.n}
                      </span>
                    </div>
                    <h3 className="mt-5 text-[15px] font-medium tracking-tight text-zinc-50">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-pretty text-sm leading-relaxed text-zinc-500">
                      {step.body}
                    </p>
                    {step.href && step.cta && (
                      <TrailLink
                        href={step.href}
                        className="mt-5 inline-flex min-h-10 items-center rounded-full px-0 text-sm text-[#a7f300] transition-[color,transform] hover:text-[#c8ff5e] active:scale-[0.96]"
                      >
                        {step.cta} →
                      </TrailLink>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {rows.length === 0 ? (
            <div className="rounded-[28px] bg-zinc-950 p-10 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
              {isFollowingView ? (
                <p className="mx-auto max-w-xl text-pretty text-sm leading-relaxed text-zinc-400">
                  Your Following feed is empty. Follow builders on{" "}
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
            <ul className="grid gap-4 md:grid-cols-2">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/u/${r.handle ?? "anon"}/${r.slug}`}
                    className="group relative block h-full overflow-hidden rounded-[26px] bg-zinc-950 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.07),0_18px_55px_rgba(0,0,0,0.28)] transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-zinc-900/70 hover:shadow-[0_0_0_1px_rgba(167,243,0,0.24),0_22px_70px_rgba(0,0,0,0.34)] active:scale-[0.96]"
                  >
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div className="inline-flex min-h-10 items-center gap-2 rounded-full bg-black px-3 text-[11px] font-mono text-zinc-400 shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
                        <ToolIcon name={r.tool} size={13} className="text-[#a7f300]" />
                        <span>{formatToolName(r.tool)}</span>
                      </div>
                      <span className="rounded-full bg-black px-3 py-2 font-mono text-[11px] text-zinc-600 tabular-nums shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
                        {r.eventCount} ev
                      </span>
                    </div>

                    <h2 className="line-clamp-2 text-balance text-[19px] font-medium leading-snug tracking-[-0.02em] text-zinc-100 transition-colors group-hover:text-white">
                      {r.title ?? r.slug}
                    </h2>
                    {r.summary && (
                      <p className="mt-3 line-clamp-3 text-pretty text-sm leading-relaxed text-zinc-500">
                        {r.summary}
                      </p>
                    )}

                    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-zinc-500">
                      <span className="inline-flex min-h-10 items-center rounded-full bg-black px-3 text-zinc-400 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
                        {r.handle ? `@${r.handle}` : "anonymous"}
                      </span>
                      <RelativeTime
                        date={r.sharedAt ?? r.startedAt}
                        className="inline-flex min-h-10 items-center rounded-full bg-black px-3 tabular-nums shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
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
