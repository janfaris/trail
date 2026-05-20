"use client";

import { cn } from "@/lib/utils";

export function ForkButton({
  user,
  slug,
  title: _title,
}: {
  user: string;
  slug: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        window.location.href = `/u/${user}/${slug}/fork`;
      }}
      className={cn(
        "inline-flex items-center h-7 px-2.5 rounded-md border border-zinc-800 bg-zinc-900/50 text-xs font-mono text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 hover:bg-zinc-900 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a7f300]/60",
      )}
    >
      Fork setup ↓
    </button>
  );
}
