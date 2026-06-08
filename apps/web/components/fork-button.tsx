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
        "inline-flex min-h-8 items-center rounded-full px-2.5 text-[13px] text-zinc-600 transition-[background-color,color,transform] hover:bg-white/[0.04] hover:text-zinc-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60",
      )}
    >
      Fork
    </button>
  );
}
