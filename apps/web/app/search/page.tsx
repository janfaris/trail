import Link from "next/link";
import { Suspense } from "react";
import { SearchBox } from "@/components/search-box";

export const metadata = { title: "Search — Trail" };

export default function SearchPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-900">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="font-mono text-[15px] font-semibold tracking-tight">
            <span className="text-[#a7f300]">/</span>trail
          </Link>
          <nav className="text-sm font-mono text-zinc-500">
            <Link href="/install" className="hover:text-zinc-100">install</Link>
          </nav>
        </div>
      </header>
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
