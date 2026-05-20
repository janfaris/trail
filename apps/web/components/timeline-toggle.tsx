"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

export function TimelineToggle({
  totalEvents,
  highlightCount,
}: {
  totalEvents: number;
  highlightCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const full = params.get("full") != null;

  return (
    <button
      type="button"
      onClick={() => {
        const next = new URLSearchParams(params.toString());
        if (full) next.delete("full");
        else next.set("full", "1");
        const qs = next.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname);
      }}
      className="inline-flex items-center border border-zinc-800 px-3 py-1.5 rounded-md text-xs font-mono text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition-colors"
    >
      {full
        ? `Show highlights only (${highlightCount})`
        : `Show all ${totalEvents} events`}
    </button>
  );
}
