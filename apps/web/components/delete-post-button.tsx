"use client";

import { deleteOwnPost } from "@/app/u/[user]/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  sessionId: string;
  /** Owner handle to return to after deletion. */
  handle: string;
  /** Tweaks the confirm copy for manual build posts vs. receipts. */
  isManualPost?: boolean;
};

/**
 * Owner-only delete control shown on the post page.
 *
 * Deletion is destructive and cascades to events, reactions, comments, proof
 * links, and tags, so we require an explicit confirm. On success we leave the
 * (now-deleted) page and send the owner back to their profile.
 */
export function DeletePostButton({ sessionId, handle, isManualPost = false }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (typeof window !== "undefined") {
      const label = isManualPost ? "build post" : "receipt";
      const ok = window.confirm(
        `Delete this ${label}? This permanently removes the post and its thread. This cannot be undone.`,
      );
      if (!ok) return;
    }

    setError(null);
    startTransition(async () => {
      const result = await deleteOwnPost(sessionId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(result.handle ? `/u/${result.handle}` : "/feed");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/10 px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-red-200 transition-[background-color,border-color,transform] hover:border-red-500/40 hover:bg-red-500/15 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
        title="Permanently delete this post"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error ? (
        <span aria-live="polite" className="text-[11px] leading-4 text-red-300">
          {error}
        </span>
      ) : null}
    </div>
  );
}
