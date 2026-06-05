"use client";

import {
  type GithubRepoDraft,
  importMyGithubRepos,
  importMyGithubShipments,
  publishImportedBuildPost,
} from "@/app/create/actions";
import { validateBuildPostQuality } from "@/lib/build-post-quality";
import Link from "next/link";
import { useState, useTransition } from "react";

const inputClassName =
  "min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-zinc-50 outline-2 outline-offset-2 outline-transparent transition-[background-color,border-color] placeholder:text-zinc-600 hover:border-white/15 focus:border-[var(--trail-green)] focus:outline-[var(--trail-green)]";

type Source = "shipment" | "repo";

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

const SOURCE_COPY: Record<
  Source,
  { tab: string; heading: string; blurb: string; cta: string; empty: string }
> = {
  shipment: {
    tab: "Recent shipments",
    heading: "Import your merged pull requests",
    blurb: "Each merged PR becomes a draft post — the real unit of what you shipped.",
    cta: "Fetch my merged PRs",
    empty: "No merged public PRs found. Try the backfill tab to post repos instead.",
  },
  repo: {
    tab: "Repos (backfill)",
    heading: "Backfill your profile with what you've built",
    blurb: "Turn your public repos into posts to fill out your builder profile.",
    cta: "Fetch my repos",
    empty: "No public, non-fork repos found to import.",
  },
};

export function ImportClient({ githubHandleHint }: { githubHandleHint: string | null }) {
  const [source, setSource] = useState<Source>("shipment");
  const [login, setLogin] = useState<string | null>(null);
  const [cards, setCards] = useState<CardState[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [isFetching, startFetch] = useTransition();
  const [publishingKey, setPublishingKey] = useState<string | null>(null);

  function selectSource(next: Source) {
    if (next === source) return;
    setSource(next);
    setCards([]);
    setFetched(false);
    setFetchError(null);
    setLogin(null);
  }

  function fetchRepos(which: Source = source) {
    setFetchError(null);
    startFetch(async () => {
      const result =
        which === "shipment" ? await importMyGithubShipments() : await importMyGithubRepos();
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
      current.map((card) => (card.draft.key === key ? { ...card, ...patch } : card)),
    );
  }

  function publish(card: CardState) {
    const key = card.draft.key;
    if (publishingKey || card.status === "published") return;

    // Give immediate, visible feedback instead of a silently-disabled button.
    const quality = validateBuildPostQuality({
      summary: card.summary,
      proofUrlCount: 1,
      proofNote: "",
      question: "",
    });
    if (!quality.ok) {
      updateCard(key, {
        status: "error",
        message:
          quality.issues[0]?.message ??
          "Add a line on what you shipped and why it matters before publishing.",
      });
      return;
    }

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
  const copy = SOURCE_COPY[source];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1 rounded-full bg-white/[0.04] p-1 text-[13px]">
        {(["shipment", "repo"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => selectSource(value)}
            className={`inline-flex min-h-8 items-center rounded-full px-3 transition-colors ${
              source === value
                ? "bg-zinc-100 font-medium text-zinc-950"
                : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            {SOURCE_COPY[value].tab}
          </button>
        ))}
      </div>

      {!fetched || cards.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="text-sm font-medium text-zinc-100">
            {copy.heading}
            {githubHandleHint ? (
              <span className="text-zinc-500"> · @{githubHandleHint}</span>
            ) : null}
          </div>
          <p className="mt-1 text-[13px] leading-5 text-zinc-500">{copy.blurb}</p>
          <button
            type="button"
            onClick={() => fetchRepos()}
            disabled={isFetching}
            className="mt-4 inline-flex min-h-10 items-center rounded-full bg-[var(--trail-green)] px-4 text-sm font-semibold text-black transition-[filter,transform] hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isFetching ? "Fetching…" : copy.cta}
          </button>
          {fetchError ? (
            <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-[13px] leading-5 text-red-100">
              {fetchError}
            </div>
          ) : null}
          {fetched && !fetchError && cards.length === 0 ? (
            <div className="mt-3 text-[13px] leading-5 text-zinc-500">{copy.empty}</div>
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
              {cards.length} {source === "shipment" ? "PR" : "repo"}
              {cards.length === 1 ? "" : "s"} · {publishedCount} posted
            </span>
            <button
              type="button"
              onClick={() => fetchRepos()}
              disabled={isFetching}
              className="rounded-full px-3 py-1.5 text-xs text-zinc-400 shadow-[var(--trail-shadow-border)] transition-colors hover:text-zinc-100 disabled:opacity-50"
            >
              {isFetching ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div className="space-y-4">
            {cards.map((card) => (
              <RepoCard
                key={card.draft.key}
                card={card}
                disabled={publishingKey !== null && publishingKey !== card.draft.key}
                onChange={(patch) => updateCard(card.draft.key, patch)}
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
            {card.draft.subtitle}
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
            onChange={(event) =>
              onChange({
                summary: event.target.value,
                ...(card.status === "error" ? { status: "idle", message: null } : {}),
              })
            }
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
            <span
              className={`text-[12px] leading-5 ${quality.ok ? "text-[var(--trail-green)]" : "text-amber-300/80"}`}
            >
              {quality.ok
                ? "Ready to post."
                : (quality.issues[0]?.message ?? "Add what you shipped and why it matters.")}
            </span>
            <button
              type="button"
              onClick={onPublish}
              disabled={disabled || publishing}
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
