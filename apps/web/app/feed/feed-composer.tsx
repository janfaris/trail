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
  return draft.title ?? draft.repo ?? draft.linkedRepo ?? `Receipt from ${draft.tool}`;
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
            error: error instanceof Error ? error.message : "Trail could not publish this receipt.",
          });
        });
    });
  }

  async function copyShareUrl(shareUrl: string) {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyStatus("Copied receipt link");
    } catch (error) {
      setCopyStatus(error instanceof Error ? `Copy failed: ${error.message}` : "Copy failed");
    }
  }

  if (!viewer) {
    return (
      <section className="overflow-hidden rounded-[2rem] border border-[#1f2a23] bg-[#07110c]/92 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(167,243,0,0.16),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent)] px-5 py-4">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.26em] text-[#a7f300]">
            Broadcast your proof
          </p>
          <h2 className="mt-2 text-xl font-black text-white">
            Import a coding-agent session and post it here.
          </h2>
        </div>
        <div className="space-y-4 p-5 text-sm text-zinc-300">
          <p>
            Trail turns your agent logs into receipts with outcomes, files, tools, and proof
            metrics. Sign in to publish directly into the feed.
          </p>
          <Link
            className="inline-flex rounded-full bg-[#a7f300] px-5 py-2 text-sm font-black text-zinc-950 shadow-[0_0_24px_rgba(167,243,0,0.28)] transition hover:bg-[#c7ff4a]"
            href="/api/auth/sign-in/github?callbackURL=%2Ffeed"
          >
            Sign in with GitHub
          </Link>
        </div>
      </section>
    );
  }

  if (!viewer.handle) {
    return (
      <section className="rounded-[2rem] border border-amber-400/25 bg-amber-400/10 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.25)]">
        <p className="text-[0.68rem] font-black uppercase tracking-[0.26em] text-amber-200">
          Finish your identity
        </p>
        <h2 className="mt-2 text-xl font-black text-white">
          Claim a Trail handle before publishing.
        </h2>
        <p className="mt-2 text-sm text-amber-50/75">
          Public receipts need a stable builder profile so people can follow, reply, and share your
          work.
        </p>
        <Link
          className="mt-4 inline-flex rounded-full border border-amber-200/30 px-5 py-2 text-sm font-black text-amber-50 transition hover:bg-amber-200/10"
          href="/settings"
        >
          Add public handle
        </Link>
      </section>
    );
  }

  if (!selectedDraft && result?.ok) {
    return (
      <section className="rounded-[2rem] border border-[#a7f300]/30 bg-[#a7f300]/10 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
        <p className="text-[0.68rem] font-black uppercase tracking-[0.26em] text-[#a7f300]">
          Published to the feed
        </p>
        <h2 className="mt-2 text-xl font-black text-white">{result.title}</h2>
        <p className="mt-2 text-sm text-[#d9ff91]/75">Now share the proof while it is fresh.</p>
        {copyStatus ? <p className="mt-2 text-xs text-[#a7f300]">{copyStatus}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            className="rounded-full bg-[#a7f300] px-5 py-2 text-sm font-black text-zinc-950 transition hover:bg-[#c7ff4a]"
            href={result.href}
          >
            Open receipt
          </Link>
          <button
            className="rounded-full border border-[#a7f300]/30 px-5 py-2 text-sm font-black text-[#d9ff91] transition hover:bg-[#a7f300]/10"
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
      <section className="rounded-[2rem] border border-[#223126] bg-[#07110c] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
        <p className="text-[0.68rem] font-black uppercase tracking-[0.26em] text-[#a7f300]">
          Nothing private is ready
        </p>
        <h2 className="mt-2 text-xl font-black text-white">
          Import your latest agent run, then publish from here.
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          Reviewed private sessions show up as feed drafts. Pending or redacted logs stay out of the
          composer until you clear their review state.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            className="rounded-full bg-[#a7f300] px-5 py-2 text-sm font-black text-zinc-950 transition hover:bg-[#c7ff4a]"
            href="/dashboard"
          >
            Import a session
          </Link>
          <Link
            className="rounded-full border border-white/10 px-5 py-2 text-sm font-bold text-zinc-200 transition hover:bg-white/5"
            href={`/u/${viewer.handle}`}
          >
            View profile
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-[#223126] bg-[#06100b]/95 shadow-[0_26px_90px_rgba(0,0,0,0.32)]">
      <div className="border-b border-white/10 bg-[radial-gradient(circle_at_12%_0%,rgba(167,243,0,0.2),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.68rem] font-black uppercase tracking-[0.28em] text-[#a7f300]">
              Compose receipt
            </p>
            <h2 className="mt-2 text-xl font-black text-white">
              Post proof from your latest agent run.
            </h2>
          </div>
          <Link
            className="hidden rounded-full border border-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-zinc-300 transition hover:bg-white/5 sm:inline-flex"
            href="/dashboard"
          >
            Import
          </Link>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {drafts.map((draft) => (
            <button
              className={`min-w-[13rem] rounded-2xl border p-3 text-left transition ${
                draft.id === selectedDraft.id
                  ? "border-[#a7f300]/70 bg-[#a7f300]/12"
                  : "border-white/10 bg-black/20 hover:border-white/25"
              }`}
              key={draft.id}
              onClick={() => selectDraft(draft)}
              type="button"
            >
              <span className="block text-[0.65rem] font-black uppercase tracking-[0.2em] text-zinc-500">
                {formatDraftDate(draft.startedAt)}
              </span>
              <span className="mt-1 line-clamp-1 block text-sm font-black text-white">
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
        className="space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          publish();
        }}
      >
        <label className="block">
          <span className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-zinc-500">
            Outcome headline
          </span>
          <input
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-base font-black text-white outline-none transition placeholder:text-zinc-600 focus:border-[#a7f300]/70"
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What did you ship, debug, or learn?"
            required
            value={title}
          />
        </label>

        <label className="block">
          <span className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-zinc-500">
            Social caption
          </span>
          <textarea
            className="mt-2 min-h-28 w-full resize-y rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm leading-6 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-[#a7f300]/70"
            maxLength={700}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Add the context that makes this useful to other builders."
            value={summary}
          />
        </label>

        <div>
          <span className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-zinc-500">
            Receipt status
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {OUTCOME_OPTIONS.map((option) => (
              <button
                className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                  outcome === option.value
                    ? "border-[#a7f300]/70 bg-[#a7f300] text-zinc-950"
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
            className={`rounded-2xl border p-4 text-sm ${
              result.ok
                ? "border-[#a7f300]/30 bg-[#a7f300]/10 text-[#d9ff91]"
                : "border-red-400/25 bg-red-500/10 text-red-100"
            }`}
          >
            {result.ok ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-black">Published to the feed.</p>
                  <p className="text-[#d9ff91]/75">Now share the proof while it is fresh.</p>
                  {copyStatus ? <p className="mt-1 text-xs text-[#a7f300]">{copyStatus}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    className="rounded-full bg-[#a7f300] px-4 py-2 font-black text-zinc-950"
                    href={result.href}
                  >
                    Open
                  </Link>
                  <button
                    className="rounded-full border border-[#a7f300]/30 px-4 py-2 font-black text-[#d9ff91]"
                    onClick={() => void copyShareUrl(result.shareUrl)}
                    type="button"
                  >
                    Copy link
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-semibold">{result.error}</p>
                {result.actionHref && result.actionLabel ? (
                  <Link
                    className="rounded-full border border-red-200/25 px-4 py-2 text-center font-black text-red-50"
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
            className="rounded-full bg-[#a7f300] px-6 py-3 text-sm font-black text-zinc-950 shadow-[0_0_28px_rgba(167,243,0,0.26)] transition hover:bg-[#c7ff4a] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending || !title.trim()}
            type="submit"
          >
            {isPending ? "Publishing..." : "Publish receipt"}
          </button>
        </div>
      </form>
    </section>
  );
}
