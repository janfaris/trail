/* Hallmark · macrostructure: workbench · polish: hp1-vertical-rail · genre: technical-editorial · stamp: trail-2026-05 */
import Link from "next/link";
import { eq, and, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { ToolIcon } from "@/components/tool-icon";
import { RelativeTime } from "@/components/relative-time";
import { EmailDigestForm } from "@/components/email-digest-form";
import {
  getBuckets,
  allFeaturedSlugs,
  blurbFor,
  type Bucket,
  type BucketSlug,
} from "@/lib/featured-trails";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Learn — Trail",
  description:
    "Curated AI-coding trails by technique: debugging with agents, multi-agent orchestration, RAG, refactors at scale, greenfield builds, and verification loops.",
};

// /learn — technique-bucketed reading list.
//
// Server component. Loads the hand-curated featured slugs from
// lib/featured-trails.ts, joins against trail_session + user, and groups the
// rows by bucket. Missing slugs (deleted/private) are silently dropped — the
// bucket just renders shorter.

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
}

async function loadSessions(slugs: string[]): Promise<Map<string, SessionRow>> {
  if (slugs.length === 0) return new Map();
  const rows = (await db
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
    )) as SessionRow[];
  const map = new Map<string, SessionRow>();
  for (const r of rows) map.set(r.slug, r);
  return map;
}

function TrailItem({
  row,
  bucket,
}: {
  row: SessionRow;
  bucket: BucketSlug;
}) {
  const editor = blurbFor(bucket, row.slug);
  const href = row.handle ? `/u/${row.handle}/${row.slug}` : "#";
  return (
    <li className="py-5">
      <Link href={href} className="block group">
        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 mb-1.5">
          <ToolIcon name={row.tool} className="w-3 h-3" />
          <span>{row.tool}</span>
          {row.taskType && (
            <>
              <span>·</span>
              <span>{row.taskType}</span>
            </>
          )}
          {row.outcome && row.outcome !== "unknown" && (
            <>
              <span>·</span>
              <span className={row.outcome === "shipped" ? "text-[#a7f300]" : ""}>
                {row.outcome}
              </span>
            </>
          )}
          <span>·</span>
          <RelativeTime date={row.startedAt} />
          {row.handle && (
            <>
              <span>·</span>
              <span>@{row.handle}</span>
            </>
          )}
          <span>·</span>
          <span className="tabular-nums">{row.eventCount} ev</span>
        </div>
        <h3 className="text-[17px] font-medium text-zinc-100 group-hover:text-[#a7f300] transition-colors leading-snug">
          {row.title ?? row.slug}
        </h3>
        {editor && (
          <p className="mt-1.5 text-[13px] text-zinc-300 leading-relaxed border-l-2 border-zinc-800 group-hover:border-[#a7f300]/60 pl-3 italic">
            {editor}
          </p>
        )}
        {row.summary && !editor && (
          <p className="mt-1 text-sm text-zinc-400 line-clamp-2">{row.summary}</p>
        )}
        {(row.toolsUsed?.length || row.frameworks?.length) ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(row.toolsUsed ?? []).slice(0, 5).map((t) => (
              <span
                key={`t-${t}`}
                className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded"
              >
                {t}
              </span>
            ))}
            {(row.frameworks ?? []).slice(0, 5).map((f) => (
              <span
                key={`f-${f}`}
                className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded"
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

function BucketSection({
  bucket,
  rows,
  index,
}: {
  bucket: Bucket;
  rows: SessionRow[];
  index: number;
}) {
  const n = String(index + 1).padStart(2, "0");
  return (
    <section
      id={bucket.slug}
      className="scroll-mt-20 grid grid-cols-12 gap-x-6 gap-y-6 py-12 border-t border-zinc-900 first:border-t-0"
    >
      {/* rail */}
      <div className="col-span-12 md:col-span-1 md:pt-2">
        <div className="flex md:flex-col items-center md:items-start gap-3 text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-600">
          <span className="text-[#a7f300]">{n}</span>
          <span className="md:rotate-180 md:[writing-mode:vertical-rl] tracking-[0.32em]">
            {bucket.kicker}
          </span>
        </div>
      </div>

      {/* header */}
      <header className="col-span-12 md:col-span-11">
        <h2 className="font-display text-[28px] md:text-[34px] leading-[1.05] tracking-[-0.02em] text-zinc-50 mb-2 max-w-[22ch]">
          {bucket.title.split(" ").slice(0, -1).join(" ")}{" "}
          <span className="italic font-light text-indigo-300">{bucket.verb}</span>
        </h2>
        <p className="text-[14.5px] text-zinc-400 leading-[1.55] max-w-[60ch]">
          {bucket.description}
        </p>
      </header>

      {/* list */}
      <div className="col-span-12 md:col-start-2 md:col-span-11">
        {rows.length === 0 ? (
          <div className="mt-2 rounded-md border border-dashed border-zinc-900 bg-zinc-950/40 p-5 text-[13px] font-mono text-zinc-500">
            No featured trails yet for this bucket.{" "}
            <Link
              href="/discover"
              className="text-zinc-300 hover:text-[#a7f300] underline-offset-2 hover:underline"
            >
              Browse discover →
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-900">
            {rows.map((r) => (
              <TrailItem key={r.slug} row={r} bucket={bucket.slug} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default async function LearnPage() {
  const buckets = getBuckets();
  const slugs = allFeaturedSlugs();
  let sessionsBySlug: Map<string, SessionRow> = new Map();
  try {
    sessionsBySlug = await loadSessions(slugs);
  } catch {
    // schema/table might not exist on first deploy — render empty buckets
    sessionsBySlug = new Map();
  }

  const tocItems = buckets.map((b) => ({
    slug: b.slug,
    title: b.title,
    count: b.picks.filter((p) => sessionsBySlug.has(p.slug)).length,
  }));

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
          <div className="col-span-12 md:col-span-7">
            <h1 className="font-display text-[40px] sm:text-[48px] md:text-[56px] leading-[0.98] tracking-[-0.025em] text-zinc-50 mb-6 max-w-[18ch]">
              Learn how other builders{" "}
              <span className="italic font-light text-indigo-300">ship with AI</span>.
            </h1>
            <p className="text-[16px] sm:text-[17px] leading-[1.55] text-zinc-400 max-w-[52ch]">
              Real sessions — prompts, decisions, diffs — grouped by what they teach. No screenshots,
              no &ldquo;tips&rdquo; threads, no theory. Just the receipts of people who got the thing working.
            </p>
          </div>
          <aside className="col-span-12 md:col-span-4 md:pt-2">
            <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-600 mb-3">
              Buckets
            </div>
            <ul className="space-y-1.5">
              {tocItems.map((t) => (
                <li key={t.slug} className="flex items-baseline gap-3 text-[13px] font-mono">
                  <Link
                    href={`#${t.slug}`}
                    className="text-zinc-300 hover:text-[#a7f300] transition-colors"
                  >
                    {t.title}
                  </Link>
                  <span className="text-zinc-600 tabular-nums">{t.count}</span>
                </li>
              ))}
            </ul>
          </aside>
        </section>

        {/* BUCKETS */}
        <div>
          {buckets.map((b, i) => {
            const rows = b.picks
              .map((p) => sessionsBySlug.get(p.slug))
              .filter((r): r is SessionRow => Boolean(r));
            return <BucketSection key={b.slug} bucket={b} rows={rows} index={i} />;
          })}
        </div>

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
