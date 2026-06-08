import { SiteNav } from "@/components/site-nav";
import type { CountedItem, RecapPayload } from "@/lib/recap/aggregate";
import type { Metadata } from "next";
/**
 * Public Recap page — /r/[slug]
 *
 * Renders any recap tier (pulse/weekly/monthly/project/wrapped) from the
 * cached payload. Pulse/project pages also link back to the source session.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

export const runtime = "nodejs";
export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

async function loadRecap(slug: string) {
  const [{ eq }, { db, schema }] = await Promise.all([
    import("drizzle-orm"),
    import("@/db/client"),
  ]);
  const recap = await db.query.recap.findFirst({
    where: eq(schema.recap.slug, slug),
  });
  if (!recap || recap.visibility !== "public") return null;
  // Cost-tier recaps (Week 5) use a different payload shape — refuse to
  // render them through the classic recap UI to avoid silent zero/NaN
  // misreads. A cost-tier renderer can land here later.
  if (recap.tier.startsWith("cost-")) return null;

  const owner = await db.query.user.findFirst({
    where: eq(schema.user.id, recap.userId),
    columns: { handle: true, name: true, image: true },
  });
  if (!owner) return null;

  const session = recap.sessionId
    ? await db.query.trailSession.findFirst({
        where: eq(schema.trailSession.id, recap.sessionId),
        columns: {
          slug: true,
          title: true,
          summary: true,
          linkedRepo: true,
          linkedCommitSha: true,
          linkedPrUrl: true,
          receiptStatus: true,
          outcome: true,
        },
      })
    : null;

  return { recap, owner, session };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadRecap(slug);
  if (!data) return { title: "Recap not found" };

  const { recap, owner, session } = data;
  const payload = recap.payload as RecapPayload;
  const tierLabel = recap.tier.charAt(0).toUpperCase() + recap.tier.slice(1);
  const title = session?.title
    ? `${tierLabel} Recap · ${session.title}`
    : `${tierLabel} Recap · @${owner.handle}`;
  const description =
    recap.oneLiner ??
    session?.summary ??
    `${payload.shippedCount} shipped of ${payload.sessionCount} sessions.`;

  const ogUrl = `/api/og/recap/${recap.slug}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogUrl, width: 1200, height: 675 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogUrl],
    },
  };
}

function CountedList({ items, label }: { items: CountedItem[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-[10.5px] font-mono uppercase tracking-[0.22em] text-zinc-600 mb-3">
        {label}
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.name}
            className="flex items-baseline justify-between text-[14px] text-zinc-200 font-mono"
          >
            <span className="truncate">{item.name}</span>
            <span className="text-zinc-500 tabular-nums">×{item.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function RecapPage({ params }: Props) {
  const { slug } = await params;
  const data = await loadRecap(slug);
  if (!data) notFound();

  const { recap, owner, session } = data;
  const payload = recap.payload as RecapPayload;
  const tierLabel = recap.tier.charAt(0).toUpperCase() + recap.tier.slice(1);
  const isPulse = recap.tier === "pulse";
  const isProject = recap.tier === "project";

  const hours = Math.floor(payload.totalSeconds / 3600);
  const minutes = Math.round((payload.totalSeconds % 3600) / 60);
  const durationLabel = hours > 0 ? `${hours}h ${minutes}m` : minutes > 0 ? `${minutes}m` : "—";

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_18%_0%,rgba(167,243,0,0.08),transparent_24rem),var(--page-base)] text-zinc-50">
      <SiteNav currentPath="/" />

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-4 pb-12 pt-8 sm:px-6 lg:px-10">
          <div className="rounded-[2rem] bg-black/55 p-6 shadow-[var(--trail-shadow-border)] sm:p-8">
            <div className="mb-6 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
              <span className="text-[var(--accent-text)]">trail recap</span>
              <span className="text-zinc-700">·</span>
              <span>{tierLabel}</span>
              <span className="text-zinc-700">·</span>
              <Link href={`/u/${owner.handle}`} className="hover:text-zinc-200 transition-colors">
                @{owner.handle}
              </Link>
            </div>

            {/* Title block */}
            {session?.title ? (
              <h1 className="mb-5 max-w-[22ch] font-display text-[34px] leading-[1.0] tracking-[-0.02em] text-zinc-50 sm:text-[44px] md:text-[52px]">
                {session.title}
              </h1>
            ) : (
              <h1 className="mb-5 font-display text-[34px] leading-[1.0] tracking-[-0.02em] text-zinc-50 sm:text-[44px] md:text-[52px]">
                {payload.shippedCount} shipped <span className="text-zinc-500">of</span>{" "}
                {payload.sessionCount}
              </h1>
            )}

            {recap.oneLiner ? (
              <p className="mb-8 max-w-[56ch] text-[17px] italic leading-[1.5] text-zinc-400">
                {recap.oneLiner}
              </p>
            ) : session?.summary ? (
              <p className="mb-8 max-w-[56ch] text-[16px] leading-[1.55] text-zinc-400">
                {session.summary}
              </p>
            ) : null}

            {/* Verification strip — pulse/project only */}
            {(isPulse || isProject) && session?.linkedCommitSha && (
              <div className="mb-10 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[1.5rem] bg-zinc-950/70 px-5 py-4 font-mono text-[12.5px] shadow-[var(--trail-shadow-border)]">
                <span className="text-zinc-500">commit</span>
                <span className="text-[var(--accent-text)]">
                  {session.linkedCommitSha.slice(0, 7)}
                </span>
                {session.linkedRepo && (
                  <>
                    <span className="text-zinc-700">·</span>
                    <span className="text-zinc-400">{session.linkedRepo}</span>
                  </>
                )}
                {(session.receiptStatus === "shipped" || session.outcome === "shipped") && (
                  <>
                    <span className="text-zinc-700">·</span>
                    <span className="text-[var(--accent-text)]">✓ shipped</span>
                  </>
                )}
              </div>
            )}

            {/* Stat row */}
            <div className="mb-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Sessions" value={String(payload.sessionCount)} />
              <Stat label="Shipped" value={String(payload.shippedCount)} accent />
              <Stat label="Time" value={durationLabel} />
              <Stat label="Vibe" value={String(payload.vibeScore)} suffix="/100" />
            </div>

            {/* Counted lists */}
            <div className="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              <CountedList items={payload.topModels} label="Models" />
              <CountedList items={payload.topTools} label="Tools" />
              <CountedList items={payload.topFrameworks} label="Frameworks" />
              <CountedList items={payload.topRepos} label="Repos" />
              <CountedList items={payload.topTaskTypes} label="Task types" />
            </div>

            {/* Back to session */}
            {session && (
              <div className="mt-16 rounded-[1.5rem] bg-zinc-950/70 p-5 text-[13px] shadow-[var(--trail-shadow-border)]">
                <Link
                  href={`/u/${owner.handle}/${session.slug}`}
                  className="inline-flex items-center gap-2 font-mono text-zinc-400 transition-colors hover:text-[var(--accent-text)]"
                >
                  ← Open full session
                </Link>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer>
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-6 font-mono text-[11px] text-zinc-500 lg:px-10">
          <Link href="/" className="hover:text-zinc-300 transition-colors">
            <span className="text-[var(--accent-text)]">/</span> trail
          </Link>
          <span className="text-zinc-700">
            generated {new Date(recap.generatedAt).toISOString().slice(0, 10)}
          </span>
        </div>
      </footer>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: string;
  suffix?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-[1.35rem] bg-zinc-950/70 p-4 shadow-[var(--trail-shadow-border)]">
      <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-zinc-600">
        {label}
      </div>
      <div className="font-display text-[28px] leading-none tabular-nums sm:text-[32px]">
        <span className={accent ? "text-[var(--accent-text)]" : "text-zinc-100"}>{value}</span>
        {suffix && <span className="ml-1 text-[16px] text-zinc-600">{suffix}</span>}
      </div>
    </div>
  );
}
