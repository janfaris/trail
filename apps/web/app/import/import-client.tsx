"use client";

import {
  type GithubRepoDraft,
  importMyGithubRepos,
  publishImportedBuildPost,
} from "@/app/create/actions";
import { validateBuildPostQuality } from "@/lib/build-post-quality";
import Link from "next/link";
import { useState, useTransition } from "react";

const inputClassName =
  "min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-zinc-50 outline-2 outline-offset-2 outline-transparent transition-[background-color,border-color] placeholder:text-zinc-600 hover:border-white/15 focus:border-[var(--trail-green)] focus:outline-[var(--trail-green)]";

type CardState = {
  draft: GithubRepoDraft;
  title: string;
  summary: string;
  stack: string;
  status: "idle" | "publishing" | "published" | "error";
  message: string | null;
  href: string | null;
};

function toCard(draft: GithubRepoDraft): CardState {
  return {
    draft,
    title: draft.title,
    summary: draft.summary,
    stack: draft.stack.join(", "),
    status: "idle",
    message: null,
    href: null,
  };
}

export function ImportClient({ githubHandleHint }: { githubHandleHint: string | null }) {
  const [login, setLogin] = useState<string | null>(null);
  const [cards, setCards] = useState<CardState[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [isFetching, startFetch] = useTransition();
  const [publishingKey, setPublishingKey] = useState<string | null>(null);

  function fetchRepos() {
    setFetchError(null);
    startFetch(async () => {
      const result = await importMyGithubRepos();
      if (!result.ok) {
        setFetchError(result.error);
        setFetched(true);
        return;
      }
      setLogin(result.login);
      setCards(result.drafts.map(toCard));
      setFetched(true);
    });
  }

  function updateCard(key: string, patch: Partial<CardState>) {
    setCards((current) =>
      current.map((card) => (card.draft.repoFullName === key ? { ...card, ...patch } : card)),
    );
  }

  function publish(card: CardState) {
    const key = card.draft.repoFullName;
    if (publishingKey || card.status === "published") return;
    setPublishingKey(key);
    updateCard(key, { status: "publishing", message: null });
    void (async () => {
      const result = await publishImportedBuildPost({
        title: card.title.trim(),
        summary: card.summary,
        tools: "",
        stack: card.stack,
        githubUrl: card.draft.githubUrl,
        xUrl: "",
        demoUrl: "",
        proofNote: "",
        question: "",
        community: "",
      });
      if (result.ok) {
        updateCard(key, { status: "published", href: result.href, message: null });
      } else {
        updateCard(key, {
          status: result.actionHref ? "published" : "error",
          href: result.actionHref ?? null,
          message: result.error,
        });
      }
      setPublishingKey(null);
    })();
  }

  const publishedCount = cards.filter((c) => c.status === "published").length;

  return (
    <div className="space-y-5">
      {!fetched || cards.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="text-sm font-medium text-zinc-100">
            Import from {githubHandleHint ? `@${githubHandleHint}` : "your GitHub"}
          </div>
          <p className="mt-1 text-[13px] leading-5 text-zinc-500">
            Connects with your GitHub login and lists your public repos. You choose which to post.
          </p>
          <button
            type="button"
            onClick={fetchRepos}
            disabled={isFetching}
            className="mt-4 inline-flex min-h-10 items-center rounded-full bg-[var(--trail-green)] px-4 text-sm font-semibold text-black transition-[filter,transform] hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isFetching ? "Fetching repos…" : "Fetch my GitHub repos"}
          </button>
          {fetchError ? (
            <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-[13px] leading-5 text-red-100">
              {fetchError}
            </div>
          ) : null}
          {fetched && !fetchError && cards.length === 0 ? (
            <div className="mt-3 text-[13px] leading-5 text-zinc-500">
              No public, non-fork repos found to import.
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-zinc-500">
            <span>
              {login ? (
                <>
                  Importing as <span className="font-mono text-zinc-300">@{login}</span> ·{" "}
                </>
              ) : null}
              {cards.length} repo{cards.length === 1 ? "" : "s"} · {publishedCount} posted
            </span>
            <button
              type="button"
              onClick={fetchRepos}
              disabled={isFetching}
              className="rounded-full px-3 py-1.5 text-xs text-zinc-400 shadow-[var(--trail-shadow-border)] transition-colors hover:text-zinc-100 disabled:opacity-50"
            >
              {isFetching ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div className="space-y-4">
            {cards.map((card) => (
              <RepoCard
                key={card.draft.repoFullName}
                card={card}
                disabled={publishingKey !== null && publishingKey !== card.draft.repoFullName}
                onChange={(patch) => updateCard(card.draft.repoFullName, patch)}
                onPublish={() => publish(card)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RepoCard({
  card,
  disabled,
  onChange,
  onPublish,
}: {
  card: CardState;
  disabled: boolean;
  onChange: (patch: Partial<CardState>) => void;
  onPublish: () => void;
}) {
  const quality = validateBuildPostQuality({
    summary: card.summary,
    proofUrlCount: 1,
    proofNote: "",
    question: "",
  });
  const published = card.status === "published";
  const publishing = card.status === "publishing";

  return (
    <article
      className={`rounded-2xl border p-4 transition-colors ${
        published
          ? "border-[color:var(--trail-green-border)] bg-[var(--trail-green-soft)]"
          : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <input
            value={card.title}
            onChange={(event) => onChange({ title: event.target.value })}
            maxLength={120}
            disabled={published}
            className="w-full bg-transparent text-[15px] font-medium tracking-[-0.01em] text-zinc-100 outline-none disabled:opacity-70"
          />
          <a
            href={card.draft.githubUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-0.5 block truncate font-mono text-[11px] text-zinc-600 hover:text-zinc-400"
          >
            {card.draft.repoFullName}
          </a>
        </div>
        {published ? (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--trail-green)]">
            Posted
          </span>
        ) : null}
      </div>

      {!published ? (
        <>
          <textarea
            value={card.summary}
            onChange={(event) => onChange({ summary: event.target.value })}
            rows={3}
            maxLength={1200}
            placeholder="What did you ship in this repo, who is it for, and what did you learn?"
            className={`${inputClassName} mt-3 min-h-20 resize-y leading-6`}
          />
          <input
            value={card.stack}
            onChange={(event) => onChange({ stack: event.target.value })}
            placeholder="Stack / tags (comma-separated)"
            className={`${inputClassName} mt-2 font-mono text-xs`}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12px] leading-5 text-zinc-600">
              {quality.ok ? "Ready to post." : (quality.issues[0]?.message ?? "Add more detail.")}
            </span>
            <button
              type="button"
              onClick={onPublish}
              disabled={disabled || publishing || !quality.ok}
              className="inline-flex min-h-9 items-center rounded-full bg-zinc-100 px-4 text-sm font-semibold text-zinc-950 transition-[background-color,transform] hover:bg-[var(--trail-green)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publishing ? "Publishing…" : "Publish"}
            </button>
          </div>
        </>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-zinc-300">
          {card.message ? <span className="text-zinc-400">{card.message}</span> : null}
          {card.href ? (
            <Link href={card.href} className="font-medium text-zinc-950 underline-offset-4">
              <span className="rounded-full bg-[var(--trail-green)] px-3 py-1 text-xs font-semibold">
                Open post
              </span>
            </Link>
          ) : null}
        </div>
      )}

      {card.status === "error" && card.message ? (
        <div className="mt-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-[13px] leading-5 text-red-100">
          {card.message}
        </div>
      ) : null}
    </article>
  );
}
