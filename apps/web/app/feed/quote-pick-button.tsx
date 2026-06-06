"use client";

import { QuoteRepostIcon, type QuotedPick, QuotedPickEmbed } from "@/app/create/quoted-pick-embed";
import { type FeedPublishResult, createBuildPostFromFeed } from "@/app/feed/actions";
import { deriveBuildPostTitle } from "@/lib/build-post-title";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

const QUOTE_BUTTON_CLASS =
  "inline-flex min-h-8 items-center gap-1.5 rounded-full bg-zinc-100 px-3 text-[13px] font-medium text-zinc-950 transition-[background-color,transform] hover:bg-[#a7f300] active:scale-[0.97]";

type PublishedState = { href: string; title: string };

export function QuotePickButton({
  quoted,
  xUrl,
  createHref,
  canQuote,
}: {
  quoted: QuotedPick;
  xUrl: string;
  createHref: string;
  canQuote: boolean;
}) {
  const [open, setOpen] = useState(false);

  // Signed-out visitors and non-X picks keep the original behavior: navigate to
  // the full /create composer (which carries its own sign-in wall + embed).
  if (!canQuote) {
    return (
      <Link href={createHref} className={QUOTE_BUTTON_CLASS}>
        <QuoteRepostIcon className="h-3.5 w-3.5" />
        Quote
      </Link>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={QUOTE_BUTTON_CLASS}>
        <QuoteRepostIcon className="h-3.5 w-3.5" />
        Quote
      </button>
      {open ? (
        <QuoteModal
          quoted={quoted}
          xUrl={xUrl}
          createHref={createHref}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function QuoteModal({
  quoted,
  xUrl,
  createHref,
  onClose,
}: {
  quoted: QuotedPick;
  xUrl: string;
  createHref: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [take, setTake] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<{ href: string; label: string } | null>(null);
  const [published, setPublished] = useState<PublishedState | null>(null);
  const [isPending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const titleId = useId();

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

  // Focus the take field while composing (native dialog focuses the panel first).
  useEffect(() => {
    if (!published) textareaRef.current?.focus();
  }, [published]);

  const post = () => {
    const summary = take.trim();
    if (!summary || isPending) return;
    setError(null);
    setErrorAction(null);
    startTransition(async () => {
      const title = deriveBuildPostTitle(summary).trim() || summary.slice(0, 120);
      const result: FeedPublishResult = await createBuildPostFromFeed({
        title,
        summary,
        tools: "",
        stack: "",
        githubUrl: "",
        xUrl,
        demoUrl: "",
        proofNote: "",
        question: "",
        community: "",
        kind: "quote",
      });
      if (!result.ok) {
        setError(result.error);
        setErrorAction(
          result.actionHref && result.actionLabel
            ? { href: result.actionHref, label: result.actionLabel }
            : null,
        );
        return;
      }
      setPublished({ href: result.href, title: result.title });
      router.refresh();
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
        aria-label="Close quote composer"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div className="relative z-10 w-full max-w-lg rounded-3xl border border-white/10 bg-zinc-950 p-5 text-zinc-50 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.7)] sm:p-6">
        <div className="flex items-center justify-between">
          <div
            id={titleId}
            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--trail-green)]"
          >
            <QuoteRepostIcon className="h-3 w-3" />
            Quote
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

        {published ? (
          <div className="mt-5 space-y-4">
            <div className="flex items-center gap-2 text-[15px] font-medium text-zinc-100">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#a7f300]/15 text-[#a7f300]">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              Posted to your Trail
            </div>
            <p className="text-[13px] leading-6 text-zinc-400">
              Your quote is live on your profile and the feed.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={published.href}
                className="inline-flex min-h-9 items-center rounded-full bg-[var(--trail-green)] px-4 text-[13px] font-semibold text-black transition-[filter,transform] hover:brightness-110 active:translate-y-px"
              >
                View your receipt →
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-9 items-center rounded-full px-3 text-[13px] text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-100"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Quoting
            </div>
            <QuotedPickEmbed pick={quoted} />
            <textarea
              ref={textareaRef}
              value={take}
              onChange={(event) => {
                setTake(event.target.value);
                if (error) {
                  setError(null);
                  setErrorAction(null);
                }
              }}
              rows={4}
              maxLength={1200}
              placeholder="Add your take — what you'd build, what you ran, or where you disagree."
              className="w-full resize-none rounded-2xl border border-white/[0.12] bg-black/30 px-3.5 py-3 text-[14px] leading-6 text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-white/25"
            />
            {error ? (
              <p className="text-[13px] leading-5 text-rose-400">
                {error}
                {errorAction ? (
                  <>
                    {" "}
                    <Link href={errorAction.href} className="font-medium underline">
                      {errorAction.label}
                    </Link>
                  </>
                ) : null}
              </p>
            ) : (
              <p className="text-[12px] leading-5 text-zinc-600">
                The quoted X post is attached as your proof — just add a concrete take.
              </p>
            )}
            <div className="flex items-center justify-between gap-3 pt-1">
              <Link
                href={createHref}
                className="text-[12px] text-zinc-500 transition-colors hover:text-zinc-200"
              >
                Add proof or open full editor →
              </Link>
              <button
                type="button"
                onClick={post}
                disabled={!take.trim() || isPending}
                className="inline-flex min-h-9 items-center rounded-full bg-[var(--trail-green)] px-5 text-[13px] font-semibold text-black transition-[filter,transform] hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isPending ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        )}
      </div>
    </dialog>,
    document.body,
  );
}
