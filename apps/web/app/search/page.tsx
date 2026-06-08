import { SearchBox } from "@/components/search-box";
import { SiteNav } from "@/components/site-nav";
import { Suspense } from "react";

export const metadata = { title: "Search — Trail" };

export default function SearchPage() {
  return (
    <div className="min-h-screen">
      <SiteNav currentPath="/search" />
      <main className="mx-auto max-w-3xl px-6 pt-16 pb-24">
        <section className="rounded-[2rem] bg-zinc-950/82 p-5 shadow-[var(--trail-shadow-border)] sm:p-7">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-text)]">
            Public proof search
          </div>
          <h1 className="mb-2 text-3xl font-semibold tracking-[-0.05em] text-zinc-50">
            Search trails
          </h1>
          <p className="mb-8 text-sm leading-6 text-zinc-500">
            Semantic search across public sessions, receipts, stacks, and decisions.
          </p>
          <Suspense fallback={<div className="font-mono text-sm text-zinc-500">loading...</div>}>
            <SearchBox />
          </Suspense>
        </section>
      </main>
    </div>
  );
}
