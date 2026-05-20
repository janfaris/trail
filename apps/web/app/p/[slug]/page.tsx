import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { ToolIcon } from "@/components/tool-icon";
import { RelativeTime } from "@/components/relative-time";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const p = await db.query.playlist.findFirst({
    where: eq(schema.playlist.slug, slug),
  });
  return { title: p ? `${p.title} — Trail` : "Playlist — Trail" };
}

export default async function PlaylistPage({ params }: Props) {
  const { slug } = await params;
  const p = await db.query.playlist.findFirst({
    where: eq(schema.playlist.slug, slug),
  });
  if (!p) notFound();

  const items = await db
    .select({
      position: schema.playlistItem.position,
      note: schema.playlistItem.note,
      sessionSlug: schema.trailSession.slug,
      title: schema.trailSession.title,
      summary: schema.trailSession.summary,
      tool: schema.trailSession.tool,
      taskType: schema.trailSession.taskType,
      outcome: schema.trailSession.outcome,
      startedAt: schema.trailSession.startedAt,
      visibility: schema.trailSession.visibility,
      handle: schema.user.handle,
    })
    .from(schema.playlistItem)
    .innerJoin(
      schema.trailSession,
      eq(schema.playlistItem.sessionId, schema.trailSession.id),
    )
    .innerJoin(schema.user, eq(schema.trailSession.userId, schema.user.id))
    .where(eq(schema.playlistItem.playlistId, p.id))
    .orderBy(asc(schema.playlistItem.position));

  // Filter to public visibility client-side so curators can't unintentionally
  // expose pending/redacted sessions through a playlist.
  const publicItems = items.filter((i) => i.visibility === "public");

  const curator = await db.query.user.findFirst({
    where: eq(schema.user.id, p.curatorId),
  });

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
            <Link href="/search" className="text-zinc-400 hover:text-zinc-100">Search</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 w-full">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] text-zinc-500">
          <span>Playlist</span>
          {p.isOfficial && (
            <span className="text-[#a7f300]">· Curated by Trail</span>
          )}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 mb-2">
          {p.title}
        </h1>
        {p.description && (
          <p className="text-zinc-400 max-w-2xl leading-relaxed mb-2">{p.description}</p>
        )}
        <div className="text-xs font-mono text-zinc-500 mb-8">
          {publicItems.length} {publicItems.length === 1 ? "trail" : "trails"}
          {curator?.handle && (
            <>
              {" · curated by "}
              <Link
                href={`/u/${curator.handle}`}
                className="text-zinc-300 hover:text-[#a7f300]"
              >
                @{curator.handle}
              </Link>
            </>
          )}
        </div>

        {publicItems.length === 0 ? (
          <div className="text-zinc-500 text-sm font-mono">
            No trails in this playlist yet.
          </div>
        ) : (
          <ol className="space-y-5">
            {publicItems.map((it, i) => (
              <li key={it.sessionSlug} className="flex gap-4">
                <div className="text-2xl font-mono text-zinc-700 tabular-nums leading-tight w-10 text-right">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="flex-1 border-b border-zinc-900 pb-5">
                  <Link
                    href={it.handle ? `/u/${it.handle}/${it.sessionSlug}` : "#"}
                    className="block group"
                  >
                    <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 mb-1">
                      <ToolIcon tool={it.tool} className="w-3 h-3" />
                      <span>{it.tool}</span>
                      {it.taskType && (
                        <>
                          <span>·</span>
                          <span>{it.taskType}</span>
                        </>
                      )}
                      {it.outcome === "shipped" && (
                        <>
                          <span>·</span>
                          <span className="text-[#a7f300]">shipped</span>
                        </>
                      )}
                      <span>·</span>
                      <RelativeTime date={it.startedAt} />
                      {it.handle && (
                        <>
                          <span>·</span>
                          <span>@{it.handle}</span>
                        </>
                      )}
                    </div>
                    <h3 className="text-base font-medium text-zinc-100 group-hover:text-[#a7f300] transition-colors">
                      {it.title ?? it.sessionSlug}
                    </h3>
                    {it.summary && (
                      <p className="text-sm text-zinc-400 mt-0.5">{it.summary}</p>
                    )}
                  </Link>
                  {it.note && (
                    <p className="text-sm text-zinc-300 mt-2 pl-3 border-l-2 border-[#a7f300]/40 italic">
                      {it.note}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </main>
    </div>
  );
}
