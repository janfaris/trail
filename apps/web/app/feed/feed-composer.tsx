"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  type FeedComposerOutcome,
  type FeedPublishResult,
  publishSessionFromFeed,
} from "./actions";

export type FeedComposerViewer = {
  id: string;
  name: string;
  handle: string | null;
  image: string | null;
};

export type FeedComposerDraft = {
  id: string;
  slug: string;
  title: string | null;
  summary: string | null;
  tool: string;
  repo: string | null;
  linkedRepo: string | null;
  outcome: FeedComposerOutcome;
  receiptStatus: string | null;
  eventCount: number;
  startedAt: string;
  endedAt: string | null;
  tags: string[];
};

type FeedComposerProps = {
  viewer: FeedComposerViewer | null;
  drafts: FeedComposerDraft[];
};

const OUTCOME_OPTIONS: Array<{ value: NonNullable<FeedComposerOutcome>; label: string }> = [
  { value: "shipped", label: "Shipped" },
  { value: "rabbithole", label: "Rabbit hole" },
  { value: "abandoned", label: "Abandoned" },
  { value: "unknown", label: "Exploring" },
];

function defaultTitle(draft: FeedComposerDraft): string {
  return draft.title ?? draft.repo ?? draft.linkedRepo ?? `Build post from ${draft.tool}`;
}

function defaultSummary(draft: FeedComposerDraft): string {
  if (draft.summary) return draft.summary;
  const scope = draft.repo ?? draft.linkedRepo ?? "a coding-agent session";
  return `Captured ${draft.eventCount.toLocaleString()} events from ${scope}. Add the punchline before publishing.`;
}

function formatDraftDate(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function draftLabel(draft: FeedComposerDraft): string {
  const repo = draft.repo ?? draft.linkedRepo;
  return repo ? `${repo} - ${draft.tool}` : draft.tool;
}

export function FeedComposer({ viewer, drafts }: FeedComposerProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(drafts[0]?.id ?? "");
  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.id === selectedId) ?? drafts[0],
    [drafts, selectedId],
  );
  const [title, setTitle] = useState(selectedDraft ? defaultTitle(selectedDraft) : "");
  const [summary, setSummary] = useState(selectedDraft ? defaultSummary(selectedDraft) : "");
  const [outcome, setOutcome] = useState<FeedComposerOutcome>(selectedDraft?.outcome ?? "shipped");
  const [result, setResult] = useState<FeedPublishResult | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function selectDraft(draft: FeedComposerDraft) {
    setSelectedId(draft.id);
    setTitle(defaultTitle(draft));
    setSummary(defaultSummary(draft));
    setOutcome(draft.outcome ?? "shipped");
    setResult(null);
    setCopyStatus(null);
  }

  function publish() {
    if (!selectedDraft) return;
    setResult(null);
    setCopyStatus(null);
    startTransition(() => {
      void publishSessionFromFeed({
        sessionId: selectedDraft.id,
        title,
        summary,
        outcome,
      })
        .then((nextResult) => {
          setResult(nextResult);
          if (nextResult.ok) router.refresh();
        })
        .catch((error: unknown) => {
          setResult({
            ok: false,
            error:
              error instanceof Error ? error.message : "Trail could not publish this build post.",
          });
        });
    });
  }

  async function copyShareUrl(shareUrl: string) {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyStatus("Copied post link");
    } catch (error) {
      setCopyStatus(error instanceof Error ? `Copy failed: ${error.message}` : "Copy failed");
    }
  }

  if (!viewer) {
    return (
      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b0b0a]">
        <div className="border-b border-white/[0.08] px-4 py-4">
          <p className="text-[12px] text-zinc-600">Join the build feed</p>
          <h2 className="mt-1 text-lg font-medium tracking-[-0.02em] text-zinc-100">
            Sign in to post builds and follow other builders.
          </h2>
        </div>
        <div className="space-y-4 p-4 text-sm text-zinc-400">
          <p>
            Write manually, paste GitHub/X/demo links, or publish proof-backed agent runs when you
            have them.
          </p>
          <Link
            className="inline-flex rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-[#a7f300]"
            href="/api/auth/sign-in/github?callbackURL=%2Fcreate"
          >
            Sign in with GitHub
          </Link>
        </div>
      </section>
    );
  }

  if (!viewer.handle) {
    return (
      <section className="rounded-2xl border border-[#a7f300]/20 bg-[#a7f300]/[0.035] p-4">
        <p className="text-[12px] text-[#a7f300]">Finish your identity</p>
        <h2 className="mt-1 text-lg font-medium tracking-[-0.02em] text-zinc-100">
          Claim a Trail handle before publishing.
        </h2>
        <p className="mt-2 text-sm text-[#d9ff91]/75">
          Public build posts need a stable builder profile so people can follow, reply, and share
          your work.
        </p>
        <Link
          className="mt-4 inline-flex rounded-full border border-[#a7f300]/25 px-4 py-2 text-sm font-medium text-[#d9ff91] transition hover:bg-[#a7f300]/10"
          href="/settings"
        >
          Add public handle
        </Link>
      </section>
    );
  }

  if (!selectedDraft && result?.ok) {
    return (
      <section className="rounded-2xl border border-[#a7f300]/20 bg-[#a7f300]/[0.035] p-4">
        <p className="text-[12px] text-[#a7f300]">Published to the feed</p>
        <h2 className="mt-1 text-lg font-medium tracking-[-0.02em] text-zinc-100">
          {result.title}
        </h2>
        <p className="mt-2 text-sm text-[#d9ff91]/75">Now share the post while it is fresh.</p>
        {copyStatus ? <p className="mt-2 text-xs text-[#a7f300]">{copyStatus}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-[#a7f300]"
            href={result.href}
          >
            Open post
          </Link>
          <button
            className="rounded-full border border-[#a7f300]/25 px-4 py-2 text-sm font-medium text-[#d9ff91] transition hover:bg-[#a7f300]/10"
            onClick={() => void copyShareUrl(result.shareUrl)}
            type="button"
          >
            Copy link
          </button>
        </div>
      </section>
    );
  }

  if (!selectedDraft) {
    return (
      <section className="rounded-2xl border border-white/[0.08] bg-[#0b0b0a] p-4">
        <p className="text-[12px] text-zinc-600">No proof drafts ready</p>
        <h2 className="mt-1 text-lg font-medium tracking-[-0.02em] text-zinc-100">
          Post manually now, or import an agent run later.
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          Manual build posts do not need logs. Reviewed private sessions show up here as optional
          proof-backed drafts.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-[#a7f300]"
            href="/create"
          >
            Write a build post
          </Link>
          <Link
            className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/5"
            href="/dashboard"
          >
            Open Studio
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b0b0a]">
      <div className="border-b border-white/[0.08] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[12px] text-zinc-600">Proof-backed draft</p>
            <h2 className="mt-1 text-lg font-medium tracking-[-0.02em] text-zinc-100">
              Publish proof from your latest agent run.
            </h2>
          </div>
          <Link
            className="hidden rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/5 sm:inline-flex"
            href="/dashboard"
          >
            Studio
          </Link>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {drafts.map((draft) => (
            <button
              className={`min-w-[13rem] rounded-xl border p-3 text-left transition ${
                draft.id === selectedDraft.id
                  ? "border-[#a7f300]/45 bg-[#a7f300]/[0.045]"
                  : "border-white/10 bg-black/20 hover:border-white/25"
              }`}
              key={draft.id}
              onClick={() => selectDraft(draft)}
              type="button"
            >
              <span className="block text-[12px] text-zinc-600">
                {formatDraftDate(draft.startedAt)}
              </span>
              <span className="mt-1 line-clamp-1 block text-sm font-medium text-zinc-100">
                {draft.title ?? draft.slug}
              </span>
              <span className="mt-1 line-clamp-1 block text-xs text-zinc-400">
                {draftLabel(draft)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <form
        className="space-y-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          publish();
        }}
      >
        <label className="block">
          <span className="text-[12px] text-zinc-600">Outcome headline</span>
          <input
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-base font-medium text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-[#a7f300]/55"
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What did you ship, debug, or learn?"
            required
            value={title}
          />
        </label>

        <label className="block">
          <span className="text-[12px] text-zinc-600">Social caption</span>
          <textarea
            className="mt-2 min-h-28 w-full resize-y rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm leading-6 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-[#a7f300]/55"
            maxLength={700}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Add the context that makes this useful to other builders."
            value={summary}
          />
        </label>

        <div>
          <span className="text-[12px] text-zinc-600">Outcome</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {OUTCOME_OPTIONS.map((option) => (
              <button
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  outcome === option.value
                    ? "border-zinc-100 bg-zinc-100 text-zinc-950"
                    : "border-white/10 text-zinc-300 hover:bg-white/5"
                }`}
                key={option.value}
                onClick={() => setOutcome(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
          <span className="rounded-full border border-white/10 px-3 py-1">
            {selectedDraft.eventCount.toLocaleString()} events
          </span>
          <span className="rounded-full border border-white/10 px-3 py-1">
            {selectedDraft.tool}
          </span>
          {(selectedDraft.repo ?? selectedDraft.linkedRepo) ? (
            <span className="rounded-full border border-white/10 px-3 py-1">
              {selectedDraft.repo ?? selectedDraft.linkedRepo}
            </span>
          ) : null}
          {selectedDraft.tags.slice(0, 3).map((tag) => (
            <span className="rounded-full border border-white/10 px-3 py-1" key={tag}>
              #{tag}
            </span>
          ))}
        </div>

        {result ? (
          <div
            className={`rounded-xl border p-4 text-sm ${
              result.ok
                ? "border-[#a7f300]/30 bg-[#a7f300]/10 text-[#d9ff91]"
                : "border-red-400/25 bg-red-500/10 text-red-100"
            }`}
          >
            {result.ok ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">Published to the feed.</p>
                  <p className="text-[#d9ff91]/75">Now share the post while it is fresh.</p>
                  {copyStatus ? <p className="mt-1 text-xs text-[#a7f300]">{copyStatus}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    className="rounded-full bg-zinc-100 px-4 py-2 font-medium text-zinc-950"
                    href={result.href}
                  >
                    Open
                  </Link>
                  <button
                    className="rounded-full border border-[#a7f300]/25 px-4 py-2 font-medium text-[#d9ff91]"
                    onClick={() => void copyShareUrl(result.shareUrl)}
                    type="button"
                  >
                    Copy link
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-medium">{result.error}</p>
                {result.actionHref && result.actionLabel ? (
                  <Link
                    className="rounded-full border border-red-200/25 px-4 py-2 text-center font-medium text-red-50"
                    href={result.actionHref}
                  >
                    {result.actionLabel}
                  </Link>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-zinc-500">
            Private and reviewed only. Pending/redacted sessions stay locked until you clear them.
          </p>
          <button
            className="rounded-full bg-zinc-100 px-5 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-[#a7f300] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending || !title.trim()}
            type="submit"
          >
            {isPending ? "Publishing..." : "Publish proof"}
          </button>
        </div>
      </form>
    </section>
  );
}
