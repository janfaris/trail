import { RelativeTime } from "@/components/relative-time";
import { SiteNav } from "@/components/site-nav";
import { ToolIcon } from "@/components/tool-icon";
import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";
import { type RankableSession, rankFeed } from "@/lib/follow";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// /feed — the home timeline. Public sessions authored by people the signed-in
// viewer follows, newest first. Auth-gated: anon visitors are redirected to
// sign in. Joins always key on trail_session.id / userId (slugs are unique only
// per-user, never globally) and filter visibility = 'public' in SQL.

interface FeedRow extends RankableSession {
  slug: string;
  title: string | null;
  summary: string | null;
  tool: string;
  eventCount: number;
  handle: string | null;
}

async function loadFeed(viewerId: string): Promise<FeedRow[]> {
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
    .limit(80);

  // rankFeed re-applies the visibility filter + ordering so the tested helper
  // runs in prod and the page stays correct even if the query drifts.
  return rankFeed(rows);
}

export default async function FeedPage() {
  let viewerId: string | null = null;
  try {
    const sessionInfo = await auth.api.getSession({ headers: await headers() });
    viewerId = sessionInfo?.user?.id ?? null;
  } catch {
    viewerId = null;
  }

  if (!viewerId) {
    redirect("/api/auth/sign-in/github?callbackURL=/feed");
  }

  // Let DB/query failures surface to the error boundary — an empty feed must
  // mean "zero rows", not "the query blew up".
  const rows = await loadFeed(viewerId);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav currentPath="/feed" />

      <main className="flex-1 max-w-5xl mx-auto px-6 py-16 w-full">
        <h1 className="text-4xl font-medium tracking-tight text-zinc-50 mb-2">Feed</h1>
        <p className="text-sm text-zinc-400 mb-10">Public sessions from the builders you follow.</p>

        {rows.length === 0 ? (
          <div className="border border-zinc-900 bg-zinc-950 rounded-md p-10 text-center">
            <p className="text-sm text-zinc-400">
              Your feed is empty. Follow some builders on{" "}
              <Link href="/discover" className="text-[#a7f300] hover:underline">
                Discover
              </Link>{" "}
              to fill it up.
            </p>
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
