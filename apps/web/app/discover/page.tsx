import Link from "next/link";
import { headers } from "next/headers";
import { eq, asc } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/sign-out-button";
import { ToolIcon } from "@/components/tool-icon";
import { RelativeTime } from "@/components/relative-time";

export const dynamic = "force-dynamic";

// /discover — trending shared sessions, ranked by the daily cron at
// /api/cron/discover. This page just reads discover_feed.rank ASC and joins
// trail_session + user. Empty state intentional: the table is empty until the
// cron runs once.

type Row = {
  slug: string;
  rank: number;
  title: string | null;
  summary: string | null;
  tool: string;
  eventCount: number;
  startedAt: Date;
  handle: string | null;
};

async function loadTop(): Promise<Row[]> {
  const rows = await db
    .select({
      slug: schema.discoverFeed.slug,
      rank: schema.discoverFeed.rank,
      title: schema.trailSession.title,
      summary: schema.trailSession.summary,
      tool: schema.trailSession.tool,
      eventCount: schema.trailSession.eventCount,
      startedAt: schema.trailSession.startedAt,
      handle: schema.user.handle,
    })
    .from(schema.discoverFeed)
    .innerJoin(schema.trailSession, eq(schema.discoverFeed.slug, schema.trailSession.slug))
    .innerJoin(schema.user, eq(schema.trailSession.userId, schema.user.id))
    .orderBy(asc(schema.discoverFeed.rank))
    .limit(50);
  return rows as Row[];
}

export default async function DiscoverPage() {
  const sessionInfo = await auth.api.getSession({ headers: await headers() });
  const handle = sessionInfo?.user
    ? (await db.query.user.findFirst({
        where: eq(schema.user.id, sessionInfo.user.id),
      }))?.handle ?? null
    : null;

  let rows: Row[] = [];
  try {
    rows = await loadTop();
  } catch {
    // Table might not exist yet on first deploy before migration runs.
    rows = [];
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-900">
        <div className="max-w-5xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <Link href="/" className="font-mono text-[15px] font-semibold tracking-tight">
            <span className="text-[#a7f300]">/</span>trail
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/discover" className="text-zinc-100 transition-colors">
              Discover
            </Link>
            <Link href="/search" className="text-zinc-400 hover:text-zinc-100 transition-colors">
              Search
            </Link>
            <a
              href="https://github.com/janfaris/trail"
              className="text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              GitHub
            </a>
            {handle ? (
              <>
                <Link
                  href={`/u/${handle}`}
                  className="font-mono text-zinc-300 hover:text-[#a7f300] transition-colors"
                >
                  @{handle}
                </Link>
                <SignOutButton />
              </>
            ) : (
              <a href="/api/auth/sign-in/github">
                <Button size="sm">Sign in</Button>
              </a>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-6 py-16 w-full">
        <h1 className="text-4xl font-medium tracking-tight text-zinc-50 mb-2">Discover</h1>
        <p className="text-sm text-zinc-400 mb-10">
          What people are building, recorded as they built it.
        </p>

        {rows.length === 0 ? (
          <div className="border border-zinc-900 bg-zinc-950 rounded-md p-10 text-center">
            <p className="text-sm text-zinc-400">
              Nothing yet. Be the first — share a session with{" "}
              <span className="font-mono text-zinc-200">trail share latest</span>.
            </p>
          </div>
        ) : (
          <ul className="grid md:grid-cols-2 gap-4">
            {rows.map((r) => (
              <li key={r.slug}>
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
                    {r.handle && (
                      <span className="text-zinc-400">@{r.handle}</span>
                    )}
                    <span className="tabular-nums">{r.eventCount} ev</span>
                    <RelativeTime date={r.startedAt} className="tabular-nums" />
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
