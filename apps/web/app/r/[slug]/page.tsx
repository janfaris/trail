/**
 * Public Recap page — /r/[slug]
 *
 * Renders any recap tier (pulse/weekly/monthly/project/wrapped) from the
 * cached payload. Pulse/project pages also link back to the source session.
 */
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db, schema } from "@/db/client";
import type { RecapPayload, CountedItem } from "@/lib/recap/aggregate";
import { SiteNav } from "@/components/site-nav";

export const runtime = "nodejs";
export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

async function loadRecap(slug: string) {
  const recap = await db.query.recap.findFirst({
    where: eq(schema.recap.slug, slug),
  });
  if (!recap || recap.visibility !== "public") return null;

  const owner = await db.query.user.findFirst({
    where: eq(schema.user.id, recap.userId),
    columns: { handle: true, name: true, image: true },
  });
  if (!owner) return null;

  const session =
    recap.sessionId
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
  const title =
    session?.title
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
  const durationLabel =
    hours > 0 ? `${hours}h ${minutes}m` : minutes > 0 ? `${minutes}m` : "—";

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-50">
      <SiteNav currentPath="/" />

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 lg:px-10 pt-16 pb-12">
          <div className="flex items-center gap-3 text-[11px] font-mono uppercase tracking-[0.22em] text-zinc-500 mb-6">
            <span className="text-[#a7f300]">trail recap</span>
            <span className="text-zinc-700">·</span>
            <span>{tierLabel}</span>
            <span className="text-zinc-700">·</span>
            <Link href={`/u/${owner.handle}`} className="hover:text-zinc-200 transition-colors">
              @{owner.handle}
            </Link>
          </div>

          {/* Title block */}
          {session?.title ? (
            <h1 className="font-display text-[34px] sm:text-[44px] md:text-[52px] leading-[1.0] tracking-[-0.02em] text-zinc-50 mb-5 max-w-[22ch]">
              {session.title}
            </h1>
          ) : (
            <h1 className="font-display text-[34px] sm:text-[44px] md:text-[52px] leading-[1.0] tracking-[-0.02em] text-zinc-50 mb-5">
              {payload.shippedCount} shipped <span className="text-zinc-500">of</span>{" "}
              {payload.sessionCount}
            </h1>
          )}

          {recap.oneLiner ? (
            <p className="text-[17px] leading-[1.5] text-zinc-400 max-w-[56ch] mb-8 italic">
              {recap.oneLiner}
            </p>
          ) : session?.summary ? (
            <p className="text-[16px] leading-[1.55] text-zinc-400 max-w-[56ch] mb-8">
              {session.summary}
            </p>
          ) : null}

          {/* Verification strip — pulse/project only */}
          {(isPulse || isProject) && session?.linkedCommitSha && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-5 py-4 mb-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] font-mono">
              <span className="text-zinc-500">commit</span>
              <span className="text-[#a7f300]">
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
                  <span className="text-[#a7f300]">✓ shipped</span>
                </>
              )}
            </div>
          )}

          {/* Stat row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12 border-t border-zinc-900 pt-6">
            <Stat label="Sessions" value={String(payload.sessionCount)} />
            <Stat label="Shipped" value={String(payload.shippedCount)} accent />
            <Stat label="Time" value={durationLabel} />
            <Stat label="Vibe" value={String(payload.vibeScore)} suffix="/100" />
          </div>

          {/* Counted lists */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-10">
            <CountedList items={payload.topModels} label="Models" />
            <CountedList items={payload.topTools} label="Tools" />
            <CountedList items={payload.topFrameworks} label="Frameworks" />
            <CountedList items={payload.topRepos} label="Repos" />
            <CountedList items={payload.topTaskTypes} label="Task types" />
          </div>

          {/* Back to session */}
          {session && (
            <div className="mt-16 pt-8 border-t border-zinc-900 text-[13px]">
              <Link
                href={`/u/${owner.handle}/${session.slug}`}
                className="text-zinc-400 hover:text-[#a7f300] transition-colors inline-flex items-center gap-2 font-mono"
              >
                ← Open full session
              </Link>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-zinc-900">
        <div className="mx-auto max-w-4xl px-6 lg:px-10 py-6 flex items-center justify-between text-[11px] font-mono text-zinc-500">
          <Link href="/" className="hover:text-zinc-300 transition-colors">
            <span className="text-[#a7f300]">/</span> trail
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
    <div>
      <div className="text-[10.5px] font-mono uppercase tracking-[0.22em] text-zinc-600 mb-2">
        {label}
      </div>
      <div className="text-[28px] sm:text-[32px] font-display leading-none tabular-nums">
        <span className={accent ? "text-[#a7f300]" : "text-zinc-100"}>{value}</span>
        {suffix && <span className="text-zinc-600 text-[16px] ml-1">{suffix}</span>}
      </div>
    </div>
  );
}
