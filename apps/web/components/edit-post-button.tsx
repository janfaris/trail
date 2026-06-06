"use client";

import { editOwnBuildPost } from "@/app/u/[user]/actions";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

type Props = {
  sessionId: string;
  initialTitle: string;
  initialSummary: string;
  /** ISO deadline; the post is editable until this moment, then locked. */
  editableUntil: string;
};

/**
 * Owner-only, time-limited edit control for manual build/quote posts
 * (Twitter-style: editable for a short window after publishing, then locked).
 *
 * The server re-checks ownership + the window, so this is purely a convenience
 * surface. We only edit the title + take; proof links, images, and the slug
 * stay fixed so public URLs and proof don't drift.
 */
export function EditPostButton({ sessionId, initialTitle, initialSummary, editableUntil }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300 transition-[background-color,border-color,transform] hover:border-white/25 hover:bg-white/[0.08] active:scale-[0.97]"
        title="Edit this post"
      >
        Edit
      </button>
      {open ? (
        <EditModal
          sessionId={sessionId}
          initialTitle={initialTitle}
          initialSummary={initialSummary}
          editableUntil={editableUntil}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function formatDeadline(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function EditModal({
  sessionId,
  initialTitle,
  initialSummary,
  editableUntil,
  onClose,
}: Props & { onClose: () => void }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState(initialSummary);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const summaryRef = useRef<HTMLTextAreaElement | null>(null);
  const titleId = useId();
  const deadlineLabel = formatDeadline(editableUntil);

  useEffect(() => setMounted(true), []);

  // Open as a true modal (native focus trap + Escape) and lock body scroll.
  useEffect(() => {
    if (!mounted) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, [mounted]);

  // Focus the take field on open (native dialog focuses the panel first).
  useEffect(() => {
    summaryRef.current?.focus();
  }, []);

  const save = () => {
    if (!summary.trim() || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await editOwnBuildPost(sessionId, { title, summary });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  };

  if (!mounted) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 z-[120] m-0 flex h-dvh max-h-none w-screen max-w-none items-start justify-center overflow-y-auto border-0 bg-transparent p-4 backdrop:bg-black/70 backdrop:backdrop-blur-sm sm:items-center"
    >
      <button
        type="button"
        aria-label="Close editor"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div className="relative z-10 w-full max-w-lg rounded-3xl border border-white/10 bg-zinc-950 p-5 text-zinc-50 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.7)] sm:p-6">
        <div className="flex items-center justify-between">
          <div
            id={titleId}
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--trail-green)]"
          >
            Edit post
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label
              htmlFor={`${titleId}-title`}
              className="block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500"
            >
              Title
            </label>
            <input
              id={`${titleId}-title`}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (error) setError(null);
              }}
              maxLength={120}
              placeholder="Leave blank to derive from your take"
              className="mt-1.5 w-full rounded-2xl border border-white/[0.12] bg-black/30 px-3.5 py-2.5 text-[14px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-white/25"
            />
          </div>
          <div>
            <label
              htmlFor={`${titleId}-summary`}
              className="block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500"
            >
              Your take
            </label>
            <textarea
              id={`${titleId}-summary`}
              ref={summaryRef}
              value={summary}
              onChange={(event) => {
                setSummary(event.target.value);
                if (error) setError(null);
              }}
              rows={5}
              maxLength={1200}
              className="mt-1.5 w-full resize-none rounded-2xl border border-white/[0.12] bg-black/30 px-3.5 py-3 text-[14px] leading-6 text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-white/25"
            />
          </div>
          {error ? (
            <p aria-live="polite" className="text-[13px] leading-5 text-rose-400">
              {error}
            </p>
          ) : (
            <p className="text-[12px] leading-5 text-zinc-600">
              Proof links and images stay attached.
              {deadlineLabel ? ` Editable until ${deadlineLabel}.` : ""}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-9 items-center rounded-full px-3 text-[13px] text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!summary.trim() || isPending}
              className="inline-flex min-h-9 items-center rounded-full bg-[var(--trail-green)] px-5 text-[13px] font-semibold text-black transition-[filter,transform] hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
