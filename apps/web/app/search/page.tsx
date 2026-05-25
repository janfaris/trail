import { Suspense } from "react";
import { SearchBox } from "@/components/search-box";
import { SiteNav } from "@/components/site-nav";

export const metadata = { title: "Search — Trail" };

export default function SearchPage() {
  return (
    <div className="min-h-screen">
      <SiteNav currentPath="/search" />
      <main className="max-w-3xl mx-auto px-6 pt-16 pb-24">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 mb-2">
          Search trails
        </h1>
        <p className="text-zinc-500 mb-8 text-sm font-mono">
          semantic search across every public session
        </p>
        <Suspense fallback={<div className="text-zinc-500 font-mono text-sm">loading…</div>}>
          <SearchBox />
        </Suspense>
      </main>
    </div>
  );
}
