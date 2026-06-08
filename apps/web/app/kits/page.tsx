export const dynamic = "force-dynamic";

import { KitCard } from "@/components/kit-card";
import { SiteNav } from "@/components/site-nav";
import { listPublicKits } from "@/lib/kit-queries";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Build Kits | Trail",
  description:
    "Steal the working setup behind real builds — agent rules, stack, and prompts you can drop into your tool in one click.",
  alternates: { canonical: "/kits" },
};

export default async function KitsHubPage() {
  const [mostForked, fresh] = await Promise.all([
    listPublicKits({ sort: "forks", limit: 6 }),
    listPublicKits({ sort: "recent", limit: 12 }),
  ]);
  const hasAny = mostForked.length > 0 || fresh.length > 0;

  return (
    <div className="min-h-screen bg-[var(--surface-deep)] text-zinc-50">
      <SiteNav currentPath="/kits" />
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--accent-text)]">
              Hardware store
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
              Steal the setup behind real builds.
            </h1>
            <p className="mt-3 max-w-2xl text-pretty text-[15px] leading-7 text-zinc-400">
              A Build Kit is the reusable setup behind a ship — agent rules, stack, and the prompts
              that worked. Drop one into your tool in one click.
            </p>
          </div>
          <Link
            href="/create/kit"
            className="inline-flex min-h-10 shrink-0 items-center rounded-full bg-[var(--accent)] px-4 text-[13px] font-medium text-[var(--on-accent)] transition-[background-color,transform] hover:bg-[var(--accent-bright)] active:scale-[0.97]"
          >
            Build a Kit →
          </Link>
        </div>

        {!hasAny ? (
          <div className="mt-10 rounded-2xl border border-dashed border-white/10 bg-zinc-950/60 p-10 text-center">
            <p className="text-lg font-semibold text-zinc-200">No Build Kits yet.</p>
            <p className="mt-2 text-sm text-zinc-500">
              Be the first — turn one of your repos into a reusable setup other builders can steal.
            </p>
            <Link
              href="/create/kit"
              className="mt-4 inline-flex min-h-10 items-center rounded-full bg-[var(--accent)] px-4 text-[13px] font-medium text-[var(--on-accent)] hover:bg-[var(--accent-bright)]"
            >
              Build a Kit from a repo →
            </Link>
          </div>
        ) : (
          <>
            {mostForked.length > 0 ? (
              <section className="mt-8">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  Most forked
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {mostForked.map((kit) => (
                    <KitCard key={kit.id} kit={kit} />
                  ))}
                </div>
              </section>
            ) : null}

            {fresh.length > 0 ? (
              <section className="mt-10">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  Fresh kits
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {fresh.map((kit) => (
                    <KitCard key={kit.id} kit={kit} />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
