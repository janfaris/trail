import { RelativeTime } from "@/components/relative-time";
import { SiteNav } from "@/components/site-nav";
import { ToolIcon } from "@/components/tool-icon";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const [{ eq }, { db, schema }] = await Promise.all([
    import("drizzle-orm"),
    import("@/db/client"),
  ]);
  const p = await db.query.playlist.findFirst({
    where: eq(schema.playlist.slug, slug),
  });
  return { title: p ? `${p.title} — Trail` : "Playlist — Trail" };
}

export default async function PlaylistPage({ params }: Props) {
  const { slug } = await params;
  const [{ asc, eq }, { db, schema }] = await Promise.all([
    import("drizzle-orm"),
    import("@/db/client"),
  ]);
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
      sharedAt: schema.trailSession.sharedAt,
      visibility: schema.trailSession.visibility,
      handle: schema.user.handle,
    })
    .from(schema.playlistItem)
    .innerJoin(schema.trailSession, eq(schema.playlistItem.sessionId, schema.trailSession.id))
    .innerJoin(schema.user, eq(schema.trailSession.userId, schema.user.id))
    .where(eq(schema.playlistItem.playlistId, p.id))
    .orderBy(asc(schema.playlistItem.position));

  // Filter to explicitly shared public receipts client-side so curators can't
  // unintentionally expose staged/private sessions through a playlist.
  const publicItems = items.filter((i) => i.visibility === "public" && i.sharedAt != null);

  const curator = await db.query.user.findFirst({
    where: eq(schema.user.id, p.curatorId),
  });

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_18%_0%,rgba(167,243,0,0.08),transparent_24rem),var(--page-base)] text-zinc-100">
      <SiteNav currentPath="/p" />

      <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-8 sm:px-6">
        <section className="mb-6 rounded-[2rem] bg-black/55 p-6 shadow-[var(--trail-shadow-border)] sm:p-8">
          <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent-text)]">
            <span>Playlist</span>
            {p.isOfficial && <span>· Curated by Trail</span>}
          </div>
          <h1 className="text-4xl font-semibold leading-none tracking-[-0.07em] text-white sm:text-5xl">
            {p.title}
          </h1>
          {p.description && (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">{p.description}</p>
          )}
          <div className="mt-5 font-mono text-xs text-zinc-500">
            {publicItems.length} {publicItems.length === 1 ? "trail" : "trails"}
            {curator?.handle && (
              <>
                {" · curated by "}
                <Link
                  href={`/u/${curator.handle}`}
                  className="text-zinc-300 hover:text-[var(--accent-text)]"
                >
                  @{curator.handle}
                </Link>
              </>
            )}
          </div>
        </section>

        {publicItems.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-zinc-800/80 p-8 text-center font-mono text-sm text-zinc-500">
            No trails in this playlist yet.
          </div>
        ) : (
          <ol className="space-y-4">
            {publicItems.map((it, i) => (
              <li
                key={it.sessionSlug}
                className="flex gap-4 rounded-[1.5rem] bg-zinc-950/70 p-5 shadow-[var(--trail-shadow-border)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[var(--trail-shadow-border-hover)]"
              >
                <div className="w-10 text-right font-mono text-2xl leading-tight tabular-nums text-zinc-700">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="flex-1">
                  <Link
                    href={it.handle ? `/u/${it.handle}/${it.sessionSlug}` : "#"}
                    className="group block"
                  >
                    <div className="mb-1 flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                      <ToolIcon name={it.tool} className="h-3 w-3" />
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
                          <span className="text-[var(--accent-text)]">shipped</span>
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
                    <h3 className="text-base font-medium text-zinc-100 transition-colors group-hover:text-[var(--accent-text)]">
                      {it.title ?? it.sessionSlug}
                    </h3>
                    {it.summary && (
                      <p className="mt-1 text-sm leading-6 text-zinc-400">{it.summary}</p>
                    )}
                  </Link>
                  {it.note && (
                    <p className="mt-3 border-l-2 border-[var(--accent-border)]/40 pl-3 text-sm italic text-zinc-300">
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
