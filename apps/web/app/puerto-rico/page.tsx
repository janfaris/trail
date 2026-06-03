import SiteNav from "@/components/site-nav";
import Link from "next/link";

export const dynamic = "force-dynamic";

const COMMUNITY_STEPS = [
  "Post what you demoed or shipped this week.",
  "Comment on another Puerto Rico builder's work.",
  "Bring the best threads into the next meetup.",
];

const PROMPTS = [
  "What AI workflow saved you time this week?",
  "What would you demo in five minutes?",
  "What local problem should Puerto Rico builders solve with AI?",
];

type PuertoRicoBuildRow = {
  id: string;
  slug: string;
  title: string | null;
  summary: string | null;
  sharedAt: Date | null;
  handle: string | null;
  authorName: string;
  repo: string | null;
  linkedRepo: string | null;
  toolsUsed: string[] | null;
  frameworks: string[] | null;
};

type PuertoRicoBuild = PuertoRicoBuildRow & {
  handle: string;
  sharedAt: Date;
};

function isRenderableBuild(row: PuertoRicoBuildRow): row is PuertoRicoBuild {
  return Boolean(row.handle && row.sharedAt);
}

async function loadPuertoRicoBuilds(): Promise<PuertoRicoBuild[]> {
  if (!process.env.DATABASE_URL) return [];

  const [{ db, schema }, { and, desc, eq, isNotNull, isNull }] = await Promise.all([
    import("@/db/client"),
    import("drizzle-orm"),
  ]);

  const rows = await db
    .select({
      id: schema.trailSession.id,
      slug: schema.trailSession.slug,
      title: schema.trailSession.title,
      summary: schema.trailSession.summary,
      sharedAt: schema.trailSession.sharedAt,
      handle: schema.user.handle,
      authorName: schema.user.name,
      repo: schema.trailSession.repo,
      linkedRepo: schema.trailSession.linkedRepo,
      toolsUsed: schema.trailSession.toolsUsed,
      frameworks: schema.trailSession.frameworks,
    })
    .from(schema.sessionTag)
    .innerJoin(schema.trailSession, eq(schema.sessionTag.sessionId, schema.trailSession.id))
    .innerJoin(schema.user, eq(schema.trailSession.userId, schema.user.id))
    .where(
      and(
        eq(schema.sessionTag.kind, "community"),
        eq(schema.sessionTag.tag, "puerto-rico"),
        eq(schema.trailSession.visibility, "public"),
        isNotNull(schema.trailSession.sharedAt),
        isNull(schema.trailSession.redactedAt),
        isNotNull(schema.user.handle),
      ),
    )
    .orderBy(desc(schema.trailSession.sharedAt), desc(schema.trailSession.id))
    .limit(12);

  return rows.filter(isRenderableBuild);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function shortList(values: string[] | null, limit: number): string[] {
  return (values ?? []).filter(Boolean).slice(0, limit);
}

function promptHref(prompt: string): string {
  return `/create?community=puerto-rico&prompt=${encodeURIComponent(prompt)}`;
}

export default async function PuertoRicoPage() {
  const localBuilds = await loadPuertoRicoBuilds();

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <SiteNav currentPath="/puerto-rico" />
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
        <section className="overflow-hidden rounded-[2rem] bg-[var(--trail-paper)] text-[var(--trail-ink)] shadow-[var(--trail-shadow-border)]">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="px-5 py-8 sm:px-8">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--trail-orange)]">
                First community wedge
              </div>
              <h1 className="mt-3 max-w-3xl font-display text-5xl leading-[0.92] tracking-[-0.07em] text-[var(--trail-ink)] sm:text-7xl">
                Puerto Rico AI builders, in one feed.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-black/60">
                Trail is becoming the place for local developers, vibe coders, founders, and
                designers to share what they built with AI before and after meetups.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/create?community=puerto-rico"
                  className="inline-flex min-h-11 items-center rounded-full bg-[var(--trail-ink)] px-5 text-sm font-semibold text-zinc-50 transition-[background-color,transform] hover:bg-[var(--trail-orange)] hover:text-black active:scale-[0.98]"
                >
                  Post your build
                </Link>
                <Link
                  href="/feed"
                  className="inline-flex min-h-11 items-center rounded-full px-5 text-sm font-medium text-black/65 shadow-[0_0_0_1px_rgba(10,10,10,0.14)] transition-colors hover:text-black"
                >
                  Browse all builds
                </Link>
              </div>
            </div>
            <div className="bg-[var(--trail-ink)] p-5 text-zinc-50 sm:p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--trail-orange)]">
                Local index
              </div>
              <div className="mt-6 text-6xl font-semibold tracking-[-0.08em]">
                {localBuilds.length}
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Puerto Rico-tagged build {localBuilds.length === 1 ? "post" : "posts"} published by
                the Trail community.
              </p>
            </div>
          </div>

          <div className="grid border-t border-black/10 sm:grid-cols-3 sm:divide-x sm:divide-black/10">
            {COMMUNITY_STEPS.map((step, index) => (
              <div key={step} className="px-5 py-6 sm:px-8">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-black/35">
                  0{index + 1}
                </div>
                <p className="mt-3 text-sm leading-6 text-black/70">{step}</p>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-6">
          <div className="trail-surface px-5 py-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              Meetup loop
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Meetup attendees publish build posts, the feed becomes the recap, and the next event
              starts with real local work instead of a blank agenda.
            </p>
          </div>

          <div className="trail-surface px-5 py-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              Discussion prompts
            </div>
            <div className="mt-4 space-y-3">
              {PROMPTS.map((prompt) => (
                <Link
                  key={prompt}
                  href={promptHref(prompt)}
                  className="block border-t border-white/10 pt-3 text-sm leading-6 text-zinc-300 transition-colors first:border-t-0 first:pt-0 hover:text-zinc-50"
                >
                  {prompt}
                </Link>
              ))}
            </div>
          </div>
        </aside>

        <section className="lg:col-span-2">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                Recent local builds
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-zinc-50">
                What the Puerto Rico network is shipping
              </h2>
            </div>
            <Link
              href="/create?community=puerto-rico"
              className="hidden rounded-full px-4 py-2 text-sm font-medium text-zinc-300 shadow-[var(--trail-shadow-border)] transition-colors hover:text-zinc-50 sm:inline-flex"
            >
              Add yours
            </Link>
          </div>

          {localBuilds.length > 0 ? (
            <div className="divide-y divide-white/10 overflow-hidden rounded-[1.5rem] bg-zinc-950 shadow-[var(--trail-shadow-border)]">
              {localBuilds.map((build) => (
                <LocalBuildCard key={build.id} build={build} />
              ))}
            </div>
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-white/15 bg-zinc-950 px-5 py-10 text-center sm:px-8">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--trail-orange)]">
                No local posts yet
              </div>
              <h2 className="mx-auto mt-3 max-w-xl text-3xl font-semibold tracking-[-0.05em] text-zinc-50">
                Be the first Puerto Rico builder in this feed.
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-500">
                Publish a build with the Puerto Rico tag so meetup recaps and local discovery start
                with real work.
              </p>
              <Link
                href="/create?community=puerto-rico"
                className="mt-7 inline-flex min-h-11 items-center rounded-full bg-zinc-100 px-5 text-sm font-semibold text-zinc-950 transition-[background-color,transform] hover:bg-white active:scale-[0.98]"
              >
                Post the first local build
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function LocalBuildCard({ build }: { build: PuertoRicoBuild }) {
  const href = `/u/${build.handle}/${build.slug}`;
  const title = build.title ?? build.slug;
  const tags = [
    build.linkedRepo ?? build.repo,
    ...shortList(build.frameworks, 2),
    ...shortList(build.toolsUsed, 2),
  ].filter((tag): tag is string => Boolean(tag));

  return (
    <article className="grid gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-6">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <Link
            href={`/u/${build.handle}`}
            className="font-medium text-zinc-300 hover:text-zinc-50"
          >
            @{build.handle}
          </Link>
          <span>·</span>
          <time dateTime={build.sharedAt.toISOString()}>{formatDate(build.sharedAt)}</time>
        </div>
        <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-zinc-50">
          <Link href={href} className="hover:text-[var(--trail-orange)]">
            {title}
          </Link>
        </h3>
        {build.summary ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">{build.summary}</p>
        ) : null}
        {tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {tags.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-zinc-400"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <Link
        href={href}
        className="self-start rounded-full bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 transition-[background-color,transform] hover:bg-white active:scale-[0.98]"
      >
        Open
      </Link>
    </article>
  );
}
