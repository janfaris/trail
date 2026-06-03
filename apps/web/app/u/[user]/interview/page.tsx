import { RelativeTime } from "@/components/relative-time";
import { ToolIcon } from "@/components/tool-icon";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ user: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { user } = await params;
  return {
    title: `@${user} — Trail for hiring`,
    description: `Verified AI-coding work by @${user} — shipped trails linked to GitHub commits.`,
    robots: { index: false },
  };
}

// /u/[user]/interview — recruiter mode profile.
//
// Different from /u/[user] in three ways:
//   1. Filters to outcome=shipped + has linked PR/commit (i.e. provably shipped).
//   2. Lead with skill chips from taxonomy (top tools/frameworks across all
//      shown sessions), so a recruiter sees the headline before scrolling.
//   3. No nav chrome — like a printable resume. /u/[user] is the social
//      profile, this is the artifact you paste into an application.

export default async function InterviewView({ params }: Props) {
  const [{ and, desc, eq, isNotNull, sql }, { db, schema }] = await Promise.all([
    import("drizzle-orm"),
    import("@/db/client"),
  ]);
  const { user } = await params;
  const userRow = await db.query.user.findFirst({
    where: eq(schema.user.handle, user),
  });
  if (!userRow) notFound();

  // Shipped trails: outcome=shipped, has linked commit, OR sustained run
  // (≥20 events). The last is a back-compat catch for older sessions that
  // were uploaded before the upload route auto-inferred outcome. Public only.
  const shipped = await db
    .select({
      slug: schema.trailSession.slug,
      title: schema.trailSession.title,
      summary: schema.trailSession.summary,
      tool: schema.trailSession.tool,
      taskType: schema.trailSession.taskType,
      toolsUsed: schema.trailSession.toolsUsed,
      frameworks: schema.trailSession.frameworks,
      startedAt: schema.trailSession.startedAt,
      durationSeconds: schema.trailSession.durationSeconds,
      eventCount: schema.trailSession.eventCount,
      linkedRepo: schema.trailSession.linkedRepo,
      linkedCommitSha: schema.trailSession.linkedCommitSha,
    })
    .from(schema.trailSession)
    .where(
      and(
        eq(schema.trailSession.userId, userRow.id),
        eq(schema.trailSession.visibility, "public"),
        isNotNull(schema.trailSession.sharedAt),
        sql`(${schema.trailSession.outcome} = 'shipped' OR ${schema.trailSession.linkedCommitSha} IS NOT NULL OR ${schema.trailSession.eventCount} >= 20)`,
      ),
    )
    .orderBy(desc(schema.trailSession.sharedAt))
    .limit(30);

  // Top skill chips — count occurrences across shown sessions.
  const toolCounts = new Map<string, number>();
  const fwCounts = new Map<string, number>();
  for (const s of shipped) {
    for (const t of s.toolsUsed ?? []) {
      toolCounts.set(t, (toolCounts.get(t) ?? 0) + 1);
    }
    for (const f of s.frameworks ?? []) {
      fwCounts.set(f, (fwCounts.get(f) ?? 0) + 1);
    }
  }
  const topTools = [...toolCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topFw = [...fwCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  const totalShipped = shipped.length;
  const withGh = shipped.filter((s) => s.linkedCommitSha).length;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_18%_0%,rgba(167,243,0,0.08),transparent_24rem),#050505] text-zinc-100">
      <header>
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#a7f300]">
              Trail · recruiter view
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50">
              {userRow.name || `@${user}`}
              <span className="ml-2 font-normal text-zinc-500">@{user}</span>
            </h1>
          </div>
          <Link
            href={`/u/${user}`}
            className="inline-flex min-h-10 items-center rounded-full bg-zinc-950 px-4 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500 shadow-[var(--trail-shadow-border)] transition-[box-shadow,color,transform] hover:text-zinc-100 hover:shadow-[var(--trail-shadow-border-hover)] active:scale-[0.97]"
          >
            full profile →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-16 pt-4">
        {/* Headline */}
        <section className="mb-10 rounded-[2rem] bg-black/55 p-6 shadow-[var(--trail-shadow-border)] sm:p-8">
          <div className="mb-6 grid grid-cols-3 gap-4">
            <Stat label="Shipped trails" value={totalShipped} />
            <Stat label="GitHub-verified" value={withGh} />
            <Stat
              label="Verified rate"
              value={totalShipped > 0 ? `${Math.round((withGh / totalShipped) * 100)}%` : "—"}
            />
          </div>

          {(topTools.length > 0 || topFw.length > 0) && (
            <div className="rounded-[1.5rem] bg-zinc-950/70 p-5 shadow-[var(--trail-shadow-border)]">
              <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                Stack signal
              </div>
              {topTools.length > 0 && (
                <div className="mb-3">
                  <div className="mb-1.5 font-mono text-[11px] text-zinc-500">Tools</div>
                  <div className="flex flex-wrap gap-1.5">
                    {topTools.map(([t, n]) => (
                      <span
                        key={t}
                        className="rounded-full bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-200 shadow-[var(--trail-shadow-border)]"
                      >
                        {t}
                        <span className="ml-1 text-zinc-500">{n}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {topFw.length > 0 && (
                <div>
                  <div className="mb-1.5 font-mono text-[11px] text-zinc-500">
                    Frameworks &amp; languages
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {topFw.map(([t, n]) => (
                      <span
                        key={t}
                        className="rounded-full bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-200 shadow-[var(--trail-shadow-border)]"
                      >
                        {t}
                        <span className="ml-1 text-zinc-500">{n}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-4 font-mono text-sm uppercase tracking-[0.18em] text-zinc-500">
            Shipped work
          </h2>
          {shipped.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-zinc-800/80 p-6 font-mono text-sm text-zinc-500">
              No shipped trails yet for @{user}. (Sessions get listed here when outcome=shipped or
              when uploaded from inside a git repo.)
            </div>
          ) : (
            <ol className="space-y-4">
              {shipped.map((s) => (
                <li
                  key={s.slug}
                  className="rounded-[1.5rem] bg-zinc-950/70 p-5 shadow-[var(--trail-shadow-border)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[var(--trail-shadow-border-hover)]"
                >
                  <Link href={`/u/${user}/${s.slug}`} className="group block">
                    <div className="mb-1 flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                      <ToolIcon name={s.tool} size={11} />
                      <span>{s.tool}</span>
                      {s.taskType && (
                        <>
                          <span>·</span>
                          <span>{s.taskType}</span>
                        </>
                      )}
                      <span>·</span>
                      <RelativeTime date={s.startedAt} />
                      {s.linkedRepo && s.linkedCommitSha && (
                        <>
                          <span>·</span>
                          <span className="text-[#a7f300]">
                            {s.linkedRepo}@{s.linkedCommitSha.slice(0, 7)}
                          </span>
                        </>
                      )}
                    </div>
                    <h3 className="text-lg font-medium leading-tight text-zinc-50 transition-colors group-hover:text-[#a7f300]">
                      {s.title ?? s.slug}
                    </h3>
                    {s.summary && (
                      <p className="mt-1 text-sm leading-relaxed text-zinc-300">{s.summary}</p>
                    )}
                  </Link>
                  {s.toolsUsed?.length || s.frameworks?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {[...(s.toolsUsed ?? []), ...(s.frameworks ?? [])].slice(0, 8).map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-zinc-900 px-2 py-1 font-mono text-[10px] text-zinc-500"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>

        <footer className="mt-12 rounded-[1.5rem] bg-black/35 p-5 font-mono text-[11px] text-zinc-600 shadow-[var(--trail-shadow-border)]">
          This is a recruiter-mode view filtered to provably-shipped work. See the{" "}
          <Link href={`/u/${user}`} className="text-zinc-300 hover:text-[#a7f300]">
            full profile
          </Link>{" "}
          for everything @{user} has uploaded.
        </footer>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[1.25rem] bg-zinc-950/70 p-4 shadow-[var(--trail-shadow-border)]">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums text-zinc-50">{value}</div>
    </div>
  );
}
