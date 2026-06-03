"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";

export function CopyButton({
  value,
  className,
  label = "Copy",
  copiedLabel = "Copied",
}: {
  value: string;
  className?: string;
  label?: string;
  copiedLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const displayLabel = failed ? "Copy failed" : copied ? copiedLabel : label;

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setFailed(false);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          setCopied(false);
          setFailed(true);
          setTimeout(() => setFailed(false), 1800);
        }
      }}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-950/70 px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400 transition-[background-color,border-color,color,opacity,transform] duration-150 ease-out hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a7f300]/60",
        copied && "text-[#a7f300] border-[#a7f300]/30",
        failed && "border-red-300/40 text-red-200",
        className,
      )}
      aria-label={displayLabel}
    >
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M3 8.5l3 3 7-7"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M11 5V4a1.5 1.5 0 0 0-1.5-1.5h-5A1.5 1.5 0 0 0 3 4v5A1.5 1.5 0 0 0 4.5 10.5H5"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
      )}
      <span>{displayLabel}</span>
    </button>
  );
}
