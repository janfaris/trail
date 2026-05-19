"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RelativeTime } from "@/components/relative-time";
import { ToolIcon } from "@/components/tool-icon";

interface SearchHit {
  slug: string;
  handle: string;
  title: string;
  summary: string | null;
  score: number;
  tool: string;
  eventCount: number;
  startedAt: string;
}

export function SearchBox({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(initialQuery);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const initial = params.get("q");
    if (initial && initial !== q) {
      setQ(initial);
      void runSearch(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(query: string) {
    setErr(null);
    setHits(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { results: SearchHit[] };
      setHits(data.results);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    router.replace(`/search?q=${encodeURIComponent(trimmed)}`);
    start(() => runSearch(trimmed));
  }

  return (
    <div>
      <form onSubmit={onSubmit}>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder='Try: "pricing research" or "how I fixed the cursor parser"'
          autoFocus
          className="w-full bg-zinc-900/50 border border-zinc-800 rounded-md px-4 py-3 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#a7f300] focus:ring-1 focus:ring-[#a7f300]/40 font-mono text-sm"
        />
      </form>

      {pending && <p className="mt-6 text-sm font-mono text-zinc-500">searching…</p>}
      {err && <p className="mt-6 text-sm font-mono text-red-400">{err}</p>}

      {hits && hits.length === 0 && !pending && (
        <p className="mt-6 text-sm font-mono text-zinc-500">no matches</p>
      )}

      {hits && hits.length > 0 && (
        <ul className="mt-8 space-y-5">
          {hits.map((h) => (
            <li
              key={`${h.handle}/${h.slug}`}
              className="border border-zinc-900 rounded-md p-4 hover:border-zinc-800 transition-colors"
            >
              <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 mb-2">
                <ToolIcon name={h.tool} className="text-zinc-400" />
                <span className="text-zinc-300">{h.tool}</span>
                <span className="text-zinc-700">·</span>
                <Link
                  href={`/u/${h.handle}`}
                  className="text-zinc-400 hover:text-zinc-100"
                >
                  @{h.handle}
                </Link>
                <span className="text-zinc-700">·</span>
                <RelativeTime date={new Date(h.startedAt)} className="text-zinc-400" />
                <span className="text-zinc-700">·</span>
                <span className="text-zinc-400 tabular-nums">{h.eventCount} ev</span>
                <span className="ml-auto text-zinc-600 tabular-nums">
                  {(h.score * 100).toFixed(0)}%
                </span>
              </div>
              <Link
                href={`/u/${h.handle}/${h.slug}`}
                className="block text-zinc-50 font-semibold tracking-tight text-lg leading-snug hover:text-[#a7f300] transition-colors"
              >
                {h.title}
              </Link>
              {h.summary && (
                <p className="mt-1 text-sm text-zinc-400 leading-relaxed">{h.summary}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
