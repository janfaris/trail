"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
      className="inline-flex items-center border border-white/10 px-3 py-1.5 rounded-md text-xs font-mono text-zinc-400 hover:text-zinc-100 hover:border-white/20 transition-[color,background-color,border-color,transform] active:scale-[0.97]"
    >
      {full ? `Show highlights only (${highlightCount})` : `Show all ${totalEvents} events`}
    </button>
  );
}
