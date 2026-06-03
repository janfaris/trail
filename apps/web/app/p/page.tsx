import { SiteNav } from "@/components/site-nav";
import Link from "next/link";

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
    const [{ desc, eq, sql }, { db, schema }] = await Promise.all([
      import("drizzle-orm"),
      import("@/db/client"),
    ]);
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
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_18%_0%,rgba(167,243,0,0.08),transparent_24rem),#050505] text-zinc-100">
      <SiteNav currentPath="/p" />

      <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-8 sm:px-6">
        <section className="mb-6 rounded-[2rem] bg-black/55 p-6 shadow-[var(--trail-shadow-border)] sm:p-8">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#a7f300]">
            Curated proof
          </div>
          <h1 className="mt-4 text-4xl font-semibold leading-none tracking-[-0.07em] text-white sm:text-5xl">
            Playlists
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            Curated Trail collections for studying how builders ship with agents.
          </p>
        </section>

        {rows.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-zinc-800/80 p-8 text-center font-mono text-sm text-zinc-500">
            No playlists yet. Curators can create them via POST /api/playlists.
          </div>
        ) : (
          <ul className="grid gap-4">
            {rows.map((r) => (
              <li
                key={r.slug}
                className="rounded-[1.5rem] bg-zinc-950/70 p-5 shadow-[var(--trail-shadow-border)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[var(--trail-shadow-border-hover)]"
              >
                <Link href={`/p/${r.slug}`} className="group block">
                  <div className="mb-1 flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                    {r.isOfficial && <span className="text-[#a7f300]">curated by Trail</span>}
                    {!r.isOfficial && r.curatorHandle && <span>@{r.curatorHandle}</span>}
                    <span>·</span>
                    <span>{r.itemCount} trails</span>
                  </div>
                  <h3 className="text-base font-medium text-zinc-100 transition-colors group-hover:text-[#a7f300]">
                    {r.title}
                  </h3>
                  {r.description && (
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-400">
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
