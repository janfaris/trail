"use client";

import { useState, useTransition } from "react";

type Props = {
  slug: string;
  tldr: string | null;
  isOwner: boolean;
};

/**
 * Header action buttons for the work-receipt block.
 *
 * - "Copy receipt link" → window.location.href
 * - "Copy receipt summary" → receipt tldr text
 * - "Regenerate receipt" → POST /api/sessions/:slug/regenerate-receipt (owner only)
 *
 * Visibility (mark private) is handled in the dashboard bulk toolbar — see
 * /dashboard. We intentionally do not duplicate that control here.
 */
export function ReceiptActions({ slug, tldr, isOwner }: Props) {
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function copy(text: string, label: string) {
    if (typeof window === "undefined") return;
    void navigator.clipboard.writeText(text).then(
      () => {
        setFlash(label);
        window.setTimeout(() => setFlash(null), 1600);
      },
      () => {
        setFlash("Copy failed");
        window.setTimeout(() => setFlash(null), 1600);
      },
    );
  }

  function regenerate() {
    if (!isOwner) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/sessions/${slug}/regenerate-receipt`, {
          method: "POST",
        });
        if (!res.ok) {
          setFlash("Regenerate failed");
        } else {
          setFlash("Regenerating…");
          window.setTimeout(() => window.location.reload(), 900);
          return;
        }
      } catch {
        setFlash("Regenerate failed");
      }
      window.setTimeout(() => setFlash(null), 1800);
    });
  }

  const btn =
    "font-mono text-[10.5px] uppercase tracking-wider px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition-colors disabled:opacity-40 disabled:hover:text-zinc-400 disabled:hover:border-zinc-800";

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => copy(window.location.href, "Link copied")}
        className={btn}
      >
        Copy link
      </button>
      <button
        type="button"
        onClick={() => copy(tldr ?? "", "Summary copied")}
        disabled={!tldr}
        className={btn}
        title={tldr ? "Copy receipt summary text" : "No summary yet"}
      >
        Copy summary
      </button>
      {isOwner && (
        <button
          type="button"
          onClick={regenerate}
          disabled={pending}
          className={btn}
          title="Re-run summarization + verification"
        >
          {pending ? "Regenerating…" : "Regenerate"}
        </button>
      )}
      {flash && (
        <span className="font-mono text-[10.5px] text-[#a7f300] ml-1">{flash}</span>
      )}
    </div>
  );
}
