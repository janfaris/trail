"use client";

import { useState, useTransition } from "react";

type Props = {
  slug: string;
  sessionId: string;
  tldr: string | null;
  isOwner: boolean;
  /** If set, a pulse recap already exists — link to it instead of generating. */
  existingRecapSlug?: string | null;
};

/**
 * Header action buttons for the work-receipt block.
 *
 * - "Copy receipt link" → window.location.href
 * - "Copy receipt summary" → receipt tldr text
 * - "Regenerate receipt" → POST /api/sessions/:slug/regenerate-receipt (owner only)
 * - "Pulse Recap" → POST /api/recap/pulse/:sessionId, then nav to /r/<slug>
 *   (or just nav to existing recap if one exists)
 *
 * Visibility (mark private) is handled in the dashboard bulk toolbar — see
 * /dashboard. We intentionally do not duplicate that control here.
 */
export function ReceiptActions({ slug, sessionId, tldr, isOwner, existingRecapSlug }: Props) {
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [recapPending, startRecapTransition] = useTransition();

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
    "font-mono text-[10.5px] uppercase tracking-wider px-2 py-0.5 rounded border border-white/10 bg-zinc-900/40 text-zinc-400 hover:text-zinc-100 hover:border-white/20 transition-[color,background-color,border-color,transform] active:scale-[0.97] disabled:opacity-40 disabled:hover:text-zinc-400 disabled:hover:border-white/15";

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
      {isOwner && existingRecapSlug ? (
        <a
          href={`/r/${existingRecapSlug}`}
          className={`${btn} no-underline`}
          title="Open the shareable Pulse Recap"
        >
          Pulse Recap →
        </a>
      ) : isOwner ? (
        <button
          type="button"
          onClick={() => {
            startRecapTransition(async () => {
              try {
                const res = await fetch(`/api/recap/pulse/${sessionId}`, {
                  method: "POST",
                });
                const data = (await res.json()) as { url?: string; error?: string };
                if (!res.ok || !data.url) {
                  setFlash("Recap failed");
                  window.setTimeout(() => setFlash(null), 1800);
                  return;
                }
                window.location.href = data.url;
              } catch {
                setFlash("Recap failed");
                window.setTimeout(() => setFlash(null), 1800);
              }
            });
          }}
          disabled={recapPending}
          className={btn}
          title="Generate a shareable Pulse Recap"
        >
          {recapPending ? "Generating…" : "Pulse Recap"}
        </button>
      ) : null}
      {flash && <span className="font-mono text-[10.5px] text-[#a7f300] ml-1">{flash}</span>}
    </div>
  );
}
