import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc, and, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { ToolIcon } from "@/components/tool-icon";
import { RelativeTime } from "@/components/relative-time";

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
  const { user } = await params;
  const userRow = await db.query.user.findFirst({
    where: eq(schema.user.handle, user),
  });
  if (!userRow) notFound();

  // Shipped trails: outcome=shipped OR has linked commit. Public only.
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
        sql`(${schema.trailSession.outcome} = 'shipped' OR ${schema.trailSession.linkedCommitSha} IS NOT NULL)`,
      ),
    )
    .orderBy(desc(schema.trailSession.startedAt))
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
  const topTools = [...toolCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const topFw = [...fwCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const totalShipped = shipped.length;
  const withGh = shipped.filter((s) => s.linkedCommitSha).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-900">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
              Trail · recruiter view
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
              {userRow.name || `@${user}`}
              <span className="text-zinc-500 font-normal ml-2">@{user}</span>
            </h1>
          </div>
          <Link
            href={`/u/${user}`}
            className="text-xs font-mono text-zinc-500 hover:text-zinc-100"
          >
            full profile →
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Headline */}
        <section className="mb-10">
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Stat label="Shipped trails" value={totalShipped} />
            <Stat label="GitHub-verified" value={withGh} />
            <Stat
              label="Verified rate"
              value={
                totalShipped > 0
                  ? `${Math.round((withGh / totalShipped) * 100)}%`
                  : "—"
              }
            />
          </div>

          {(topTools.length > 0 || topFw.length > 0) && (
            <div className="border border-zinc-900 rounded p-5">
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 mb-3">
                Stack signal
              </div>
              {topTools.length > 0 && (
                <div className="mb-3">
                  <div className="text-[11px] font-mono text-zinc-500 mb-1.5">
                    Tools
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {topTools.map(([t, n]) => (
                      <span
                        key={t}
                        className="text-xs font-mono text-zinc-200 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded"
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
                  <div className="text-[11px] font-mono text-zinc-500 mb-1.5">
                    Frameworks &amp; languages
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {topFw.map(([t, n]) => (
                      <span
                        key={t}
                        className="text-xs font-mono text-zinc-200 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded"
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
          <h2 className="text-sm font-mono uppercase tracking-[0.18em] text-zinc-500 mb-4">
            Shipped work
          </h2>
          {shipped.length === 0 ? (
            <div className="text-zinc-500 text-sm font-mono">
              No shipped trails yet for @{user}. (Sessions get listed here when
              outcome=shipped or when uploaded from inside a git repo.)
            </div>
          ) : (
            <ol className="space-y-6">
              {shipped.map((s) => (
                <li key={s.slug} className="border-b border-zinc-900 pb-6">
                  <Link
                    href={`/u/${user}/${s.slug}`}
                    className="block group"
                  >
                    <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 mb-1">
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
                    <h3 className="text-lg font-medium text-zinc-50 group-hover:text-[#a7f300] transition-colors leading-tight">
                      {s.title ?? s.slug}
                    </h3>
                    {s.summary && (
                      <p className="text-sm text-zinc-300 mt-1 leading-relaxed">
                        {s.summary}
                      </p>
                    )}
                  </Link>
                  {(s.toolsUsed?.length || s.frameworks?.length) ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {[...(s.toolsUsed ?? []), ...(s.frameworks ?? [])]
                        .slice(0, 8)
                        .map((t) => (
                          <span
                            key={t}
                            className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded"
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

        <footer className="mt-12 pt-6 border-t border-zinc-900 text-[11px] font-mono text-zinc-600">
          This is a recruiter-mode view filtered to provably-shipped work. See
          the{" "}
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
    <div className="border border-zinc-900 rounded p-4">
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 mb-1">
        {label}
      </div>
      <div className="text-2xl font-semibold text-zinc-50 tabular-nums">
        {value}
      </div>
    </div>
  );
}
