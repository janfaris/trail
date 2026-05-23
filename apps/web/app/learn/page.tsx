/* Hallmark · macrostructure: workbench · polish: hp1-vertical-rail · genre: technical-editorial · stamp: trail-2026-05 */
import Link from "next/link";
import { eq, and, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { ToolIcon } from "@/components/tool-icon";
import { RelativeTime } from "@/components/relative-time";
import { EmailDigestForm } from "@/components/email-digest-form";
import { getBuckets, allFeaturedSlugs, blurbFor } from "@/lib/featured-trails";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Learn — Trail",
  description:
    "Curated AI-coding trails — real sessions from builders shipping with agents. Prompts, decisions, diffs.",
};

// /learn — featured trails reading list.
//
// Server component. Loads the hand-curated featured slugs from
// lib/featured-trails.ts (flattened across buckets, deduped by slug) and
// renders them as a single grid. The bucket structure in the data file is
// retained for v2 — we're just not surfacing it in the UI yet.

interface SessionRow {
  slug: string;
  title: string | null;
  summary: string | null;
  tool: string;
  taskType: string | null;
  outcome: string | null;
  toolsUsed: string[] | null;
  frameworks: string[] | null;
  startedAt: Date;
  eventCount: number;
  handle: string | null;
  /** first bucket this slug appears in — used to look up the editorial blurb */
  bucketSlug: string;
}

async function loadFeaturedRows(): Promise<SessionRow[]> {
  const buckets = getBuckets();
  const slugs = allFeaturedSlugs();
  if (slugs.length === 0) return [];

  // map slug -> first bucket it appears in, so we can pull the editorial blurb
  const slugToBucket = new Map<string, string>();
  for (const b of buckets) {
    for (const p of b.picks) {
      if (!slugToBucket.has(p.slug)) slugToBucket.set(p.slug, b.slug);
    }
  }

  let rows: Omit<SessionRow, "bucketSlug">[] = [];
  try {
    rows = (await db
      .select({
        slug: schema.trailSession.slug,
        title: schema.trailSession.title,
        summary: schema.trailSession.summary,
        tool: schema.trailSession.tool,
        taskType: schema.trailSession.taskType,
        outcome: schema.trailSession.outcome,
        toolsUsed: schema.trailSession.toolsUsed,
        frameworks: schema.trailSession.frameworks,
        startedAt: schema.trailSession.startedAt,
        eventCount: schema.trailSession.eventCount,
        handle: schema.user.handle,
      })
      .from(schema.trailSession)
      .innerJoin(schema.user, eq(schema.trailSession.userId, schema.user.id))
      .where(
        and(
          eq(schema.trailSession.visibility, "public"),
          inArray(schema.trailSession.slug, slugs),
        ),
      )) as Omit<SessionRow, "bucketSlug">[];
  } catch {
    // table missing on first deploy — render empty
    return [];
  }

  // preserve the curated order from featured-trails.ts
  const order = new Map(slugs.map((s, i) => [s, i]));
  return rows
    .map((r) => ({ ...r, bucketSlug: slugToBucket.get(r.slug) ?? "" }))
    .sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0));
}

function TrailCard({ row, index }: { row: SessionRow; index: number }) {
  const editor = row.bucketSlug
    ? blurbFor(row.bucketSlug as Parameters<typeof blurbFor>[0], row.slug)
    : undefined;
  const href = row.handle ? `/u/${row.handle}/${row.slug}` : "#";
  const n = String(index + 1).padStart(2, "0");
  return (
    <li>
      <Link
        href={href}
        className="group block h-full rounded-md border border-zinc-900 bg-zinc-950/40 p-5 transition-colors hover:border-zinc-700"
      >
        <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-600">
          <span className="text-[#a7f300] tabular-nums">{n}</span>
          <span>·</span>
          <ToolIcon name={row.tool} className="w-3 h-3" />
          <span className="normal-case tracking-normal">{row.tool}</span>
          {row.taskType && (
            <>
              <span>·</span>
              <span className="normal-case tracking-normal">{row.taskType}</span>
            </>
          )}
          {row.outcome && row.outcome !== "unknown" && (
            <>
              <span>·</span>
              <span
                className={
                  row.outcome === "shipped"
                    ? "text-[#a7f300] normal-case tracking-normal"
                    : "normal-case tracking-normal"
                }
              >
                {row.outcome}
              </span>
            </>
          )}
        </div>
        <h3 className="text-[17px] font-medium leading-snug text-zinc-100 transition-colors group-hover:text-[#a7f300]">
          {row.title ?? row.slug}
        </h3>
        {editor ? (
          <p className="mt-2 border-l-2 border-zinc-800 pl-3 text-[13px] italic leading-relaxed text-zinc-300 transition-colors group-hover:border-[#a7f300]/60">
            {editor}
          </p>
        ) : row.summary ? (
          <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-zinc-400">
            {row.summary}
          </p>
        ) : null}
        <div className="mt-3 flex items-center gap-2 text-[11px] font-mono text-zinc-500">
          {row.handle && <span>@{row.handle}</span>}
          {row.handle && <span>·</span>}
          <RelativeTime date={row.startedAt} />
          <span>·</span>
          <span className="tabular-nums">{row.eventCount} ev</span>
        </div>
        {(row.toolsUsed?.length || row.frameworks?.length) ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(row.toolsUsed ?? []).slice(0, 4).map((t) => (
              <span
                key={`t-${t}`}
                className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500"
              >
                {t}
              </span>
            ))}
            {(row.frameworks ?? []).slice(0, 4).map((f) => (
              <span
                key={`f-${f}`}
                className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
              >
                {f}
              </span>
            ))}
          </div>
        ) : null}
      </Link>
    </li>
  );
}

export default async function LearnPage() {
  const rows = await loadFeaturedRows();

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-50">
      <header className="sticky top-0 z-40 backdrop-blur-md bg-zinc-950/70 border-b border-zinc-900/80">
        <div className="mx-auto max-w-6xl px-6 lg:px-10 h-14 flex items-center justify-between">
          <Link href="/" className="font-mono text-[14px] font-medium tracking-tight">
            <span className="text-[#a7f300]">/</span>trail
          </Link>
          <nav className="flex items-center gap-6 text-[13px]">
            <Link href="/learn" className="text-zinc-100 transition-colors">
              Learn
            </Link>
            <Link href="/discover" className="text-zinc-400 hover:text-zinc-100 transition-colors">
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
          </nav>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-6xl px-6 lg:px-10 w-full">
        {/* HERO */}
        <section className="grid grid-cols-12 gap-x-6 gap-y-10 pt-20 pb-10">
          <div className="col-span-12 md:col-span-1 md:pt-2">
            <div className="flex md:flex-col items-center md:items-start gap-3 text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-600">
              <span className="text-[#a7f300]">00</span>
              <span className="md:rotate-180 md:[writing-mode:vertical-rl] tracking-[0.32em]">
                Playbook
              </span>
            </div>
          </div>
          <div className="col-span-12 md:col-span-11">
            <h1 className="font-display text-[40px] sm:text-[48px] md:text-[56px] leading-[0.98] tracking-[-0.025em] text-zinc-50 mb-6 max-w-[18ch]">
              Learn how other builders{" "}
              <span className="italic font-light text-indigo-300">ship with AI</span>.
            </h1>
            <p className="text-[16px] sm:text-[17px] leading-[1.55] text-zinc-400 max-w-[52ch]">
              Real sessions — prompts, decisions, diffs — from builders who got the thing working.
              No screenshots, no &ldquo;tips&rdquo; threads, no theory. Just the receipts.
            </p>
          </div>
        </section>

        {/* FEATURED TRAILS */}
        <section className="grid grid-cols-12 gap-x-6 gap-y-6 border-t border-zinc-900 py-12">
          <div className="col-span-12 md:col-span-1 md:pt-2">
            <div className="flex md:flex-col items-center md:items-start gap-3 text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-600">
              <span className="text-[#a7f300]">01</span>
              <span className="md:rotate-180 md:[writing-mode:vertical-rl] tracking-[0.32em]">
                Featured
              </span>
            </div>
          </div>
          <header className="col-span-12 md:col-span-11">
            <h2 className="font-display text-[28px] md:text-[34px] leading-[1.05] tracking-[-0.02em] text-zinc-50 mb-2 max-w-[22ch]">
              Featured{" "}
              <span className="italic font-light text-indigo-300">trails</span>
            </h2>
            <p className="text-[14.5px] text-zinc-400 leading-[1.55] max-w-[60ch]">
              Hand-picked sessions worth reading start to finish. More coming as new public trails roll in.
            </p>
          </header>

          <div className="col-span-12 md:col-start-2 md:col-span-11">
            {rows.length === 0 ? (
              <div className="rounded-md border border-dashed border-zinc-900 bg-zinc-950/40 p-6 text-[13px] font-mono text-zinc-500">
                No featured trails yet.{" "}
                <Link
                  href="/discover"
                  className="text-zinc-300 hover:text-[#a7f300] underline-offset-2 hover:underline"
                >
                  Browse discover →
                </Link>
              </div>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {rows.map((r, i) => (
                  <TrailCard key={r.slug} row={r} index={i} />
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* EMAIL CTA */}
        <section className="my-20 grid grid-cols-12 gap-x-6 gap-y-6 border-t border-zinc-900 pt-14">
          <div className="col-span-12 md:col-span-1 md:pt-2">
            <div className="flex md:flex-col items-center md:items-start gap-3 text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-600">
              <span className="text-[#a7f300]">→</span>
              <span className="md:rotate-180 md:[writing-mode:vertical-rl] tracking-[0.32em]">
                Digest
              </span>
            </div>
          </div>
          <div className="col-span-12 md:col-span-7">
            <h2 className="font-display text-[28px] md:text-[34px] leading-[1.05] tracking-[-0.02em] text-zinc-50 mb-3 max-w-[22ch]">
              One email a week.{" "}
              <span className="italic font-light text-indigo-300">Six trails worth reading.</span>
            </h2>
            <p className="text-[14.5px] text-zinc-400 leading-[1.55] max-w-[58ch] mb-6">
              The <em>AI Coding Patterns</em> digest. Hand-picked from new public trails — what worked,
              what didn&apos;t, and what changed about how to drive an agent this week. No filler.
              Unsub in one click.
            </p>
            <EmailDigestForm />
            <p className="mt-3 text-[11px] font-mono text-zinc-600">
              We&apos;ll never share your email. One send a week, max.
            </p>
          </div>
        </section>

        <footer className="border-t border-zinc-900 py-8 text-[11px] font-mono text-zinc-600 flex items-center justify-between">
          <span>
            <span className="text-[#a7f300]">/</span>trail · learn
          </span>
          <Link href="/discover" className="hover:text-zinc-300">
            Browse all public trails →
          </Link>
        </footer>
      </main>
    </div>
  );
}
