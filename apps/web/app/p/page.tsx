import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Playlists — Trail" };

export default async function PlaylistsIndex() {
  let rows: {
    slug: string;
    title: string;
    description: string | null;
    isOfficial: boolean;
    curatorHandle: string | null;
    itemCount: number;
  }[] = [];
  try {
    rows = (await db
      .select({
        slug: schema.playlist.slug,
        title: schema.playlist.title,
        description: schema.playlist.description,
        isOfficial: schema.playlist.isOfficial,
        curatorHandle: schema.user.handle,
        itemCount: sql<number>`(SELECT count(*)::int FROM playlist_item pi WHERE pi.playlist_id = ${schema.playlist.id})`,
      })
      .from(schema.playlist)
      .innerJoin(schema.user, eq(schema.playlist.curatorId, schema.user.id))
      .orderBy(desc(schema.playlist.isOfficial), desc(schema.playlist.updatedAt))
      .limit(60)) as typeof rows;
  } catch {
    // table may not exist before migration
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-900">
        <div className="max-w-4xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <Link href="/" className="font-mono text-[15px] font-semibold tracking-tight">
            <span className="text-[#a7f300]">/</span>trail
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/learn" className="text-zinc-400 hover:text-zinc-100">Learn</Link>
            <Link href="/discover" className="text-zinc-400 hover:text-zinc-100">Discover</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 w-full">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 mb-2">
          Playlists
        </h1>
        <p className="text-zinc-500 mb-8 text-sm font-mono">
          Curated trail collections
        </p>

        {rows.length === 0 ? (
          <div className="text-zinc-500 text-sm font-mono">
            No playlists yet. Curators can create them via POST /api/playlists.
          </div>
        ) : (
          <ul className="divide-y divide-zinc-900">
            {rows.map((r) => (
              <li key={r.slug} className="py-4">
                <Link href={`/p/${r.slug}`} className="block group">
                  <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 mb-1">
                    {r.isOfficial && (
                      <span className="text-[#a7f300]">curated by Trail</span>
                    )}
                    {!r.isOfficial && r.curatorHandle && (
                      <span>@{r.curatorHandle}</span>
                    )}
                    <span>·</span>
                    <span>{r.itemCount} trails</span>
                  </div>
                  <h3 className="text-base font-medium text-zinc-100 group-hover:text-[#a7f300] transition-colors">
                    {r.title}
                  </h3>
                  {r.description && (
                    <p className="text-sm text-zinc-400 mt-0.5 line-clamp-2">
                      {r.description}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
