import { RelativeTime } from "@/components/relative-time";
import { SaveReceiptButton } from "@/components/save-receipt-button";
import { SiteNav } from "@/components/site-nav";
import { ToolIcon } from "@/components/tool-icon";
import { Avatar } from "@/components/ui/avatar";
import { githubAvatar } from "@/lib/share";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Saved receipts · Trail",
  description: "Your private collection of AI shipping receipts saved from the Trail network.",
};

function signInHref(callbackURL: string): string {
  return `/api/auth/sign-in/github?callbackURL=${encodeURIComponent(callbackURL)}`;
}

function receiptTitle(row: { title: string | null; slug: string }) {
  return row.title?.trim() || row.slug;
}

function avatarSrc(row: { authorImage: string | null; githubHandle: string | null }) {
  return row.authorImage ?? (row.githubHandle ? githubAvatar(row.githubHandle) : null);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en", { notation: value >= 1000 ? "compact" : "standard" }).format(
    value,
  );
}

export default async function SavedReceiptsPage() {
  const [{ auth }, { db, schema }] = await Promise.all([
    import("@/lib/auth"),
    import("@/db/client"),
  ]);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) redirect(signInHref("/saved"));

  const rows = await db
    .select({
      id: schema.trailSession.id,
      slug: schema.trailSession.slug,
      title: schema.trailSession.title,
      summary: schema.trailSession.summary,
      receiptTldr: schema.trailSession.receiptTldr,
      tool: schema.trailSession.tool,
      eventCount: schema.trailSession.eventCount,
      sharedAt: schema.trailSession.sharedAt,
      savedAt: schema.savedReceipt.createdAt,
      authorHandle: schema.user.handle,
      authorName: schema.user.name,
      authorImage: schema.user.image,
      githubHandle: schema.user.githubHandle,
    })
    .from(schema.savedReceipt)
    .innerJoin(schema.trailSession, eq(schema.savedReceipt.sessionId, schema.trailSession.id))
    .innerJoin(schema.user, eq(schema.trailSession.userId, schema.user.id))
    .where(
      and(
        eq(schema.savedReceipt.userId, session.user.id),
        eq(schema.trailSession.visibility, "public"),
        isNotNull(schema.trailSession.sharedAt),
        isNull(schema.trailSession.redactedAt),
        isNotNull(schema.user.handle),
      ),
    )
    .orderBy(desc(schema.savedReceipt.createdAt), desc(schema.trailSession.sharedAt))
    .limit(100);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_18%_0%,rgba(167,243,0,0.12),transparent_24rem),#050505] text-zinc-100">
      <SiteNav currentPath="/saved" />

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-6 lg:px-10">
        <section className="overflow-hidden rounded-[2rem] border border-zinc-800 bg-black/55 p-6 shadow-2xl shadow-black/50 sm:p-8">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#a7f300]">
            Private collection
          </div>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="max-w-2xl text-4xl font-semibold leading-none tracking-[-0.07em] text-white sm:text-5xl">
                Saved receipts
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                Keep proof artifacts you want to revisit, fork, or learn from. Saves are private;
                only public receipts stay visible here.
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">
                saved
              </div>
              <div className="mt-1 font-mono text-2xl text-[#a7f300] tabular-nums">
                {formatCount(rows.length)}
              </div>
            </div>
          </div>
        </section>

        {rows.length === 0 ? (
          <section className="mt-6 rounded-[2rem] border border-dashed border-zinc-800 bg-zinc-950/70 p-10 text-center">
            <div className="font-mono text-sm text-zinc-400">No saved receipts yet.</div>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-600">
              Save receipts from the feed or discovery when you find a build worth revisiting.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Link
                href="/feed"
                className="rounded-full bg-[#a7f300] px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-[#c8ff5e]"
              >
                Browse feed
              </Link>
              <Link
                href="/discover"
                className="rounded-full border border-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-zinc-600 hover:text-white"
              >
                Discover builders
              </Link>
            </div>
          </section>
        ) : (
          <section className="mt-6 grid gap-4">
            {rows.map((row) => {
              const authorHandle = row.authorHandle ?? "";
              const href = `/u/${authorHandle}/${row.slug}`;
              const copy = row.receiptTldr ?? row.summary ?? "Open the proof artifact.";

              return (
                <article
                  key={row.id}
                  className="group grid gap-4 rounded-[1.75rem] border border-zinc-900 bg-zinc-950/82 p-5 transition hover:-translate-y-0.5 hover:border-zinc-700 sm:grid-cols-[48px_minmax(0,1fr)_auto]"
                >
                  <Link href={`/u/${authorHandle}`} aria-label={`Open @${authorHandle}`}>
                    <Avatar
                      src={avatarSrc(row)}
                      alt={row.authorName}
                      size={48}
                      fallback={row.authorHandle ?? row.authorName}
                      className="border-zinc-700 bg-black"
                    />
                  </Link>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <Link href={`/u/${authorHandle}`} className="font-semibold text-zinc-300">
                        @{authorHandle}
                      </Link>
                      <span>published</span>
                      {row.sharedAt ? <RelativeTime date={row.sharedAt} /> : null}
                      <span className="text-zinc-700">·</span>
                      <span>
                        saved <RelativeTime date={row.savedAt} />
                      </span>
                    </div>
                    <Link href={href}>
                      <h2 className="mt-2 text-xl font-semibold leading-tight tracking-[-0.04em] text-white group-hover:text-[#a7f300]">
                        {receiptTitle(row)}
                      </h2>
                    </Link>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-400">{copy}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-black px-2.5 py-1">
                        <ToolIcon name={row.tool} size={12} className="text-[#a7f300]" />
                        {row.tool}
                      </span>
                      <span className="rounded-full border border-zinc-800 bg-black px-2.5 py-1">
                        {formatCount(row.eventCount)} events
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                    <Link
                      href={href}
                      className="inline-flex min-h-9 items-center rounded-full bg-zinc-100 px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-950 transition hover:bg-[#a7f300]"
                    >
                      Open
                    </Link>
                    <SaveReceiptButton
                      sessionId={row.id}
                      initialSaved
                      signedIn
                      signInHref={signInHref("/saved")}
                      refreshOnChange
                      savedLabel="Unsave"
                      unsavedLabel="Save"
                      className="border-zinc-800 px-3 text-zinc-400 hover:border-zinc-600 hover:text-white"
                    />
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
