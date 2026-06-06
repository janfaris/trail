"use client";

import {
  importGithubBuildDraft,
  importXBuildDraft,
  improveBuildPostDraft,
} from "@/app/create/actions";
import { QuoteRepostIcon, type QuotedPick, QuotedPickEmbed } from "@/app/create/quoted-pick-embed";
import { type BuildPostInput, createBuildPostFromFeed } from "@/app/feed/actions";
import { validateBuildPostQuality } from "@/lib/build-post-quality";
import { parseGithubBuildUrl } from "@/lib/github-url";
import { parseXPostUrl } from "@/lib/x-url";
import Link from "next/link";
import { type ReactNode, useState, useTransition } from "react";

const inputClassName =
  "min-h-12 w-full rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-zinc-50 outline-2 outline-offset-2 outline-transparent transition-[background-color,border-color,box-shadow] placeholder:text-zinc-600 hover:border-white/15 hover:bg-white/[0.055] focus:border-[var(--trail-green)] focus:outline-[var(--trail-green)]";

const textareaClassName = `${inputClassName} min-h-36 resize-y leading-7`;
const primaryButtonClassName =
  "inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-[var(--trail-green)] px-5 text-sm font-semibold text-black transition-[filter,transform] hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClassName =
  "inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-white/[0.08] px-4 text-xs font-semibold text-zinc-50 transition-[background-color,transform] hover:bg-white/[0.13] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45";
const ghostButtonClassName =
  "inline-flex min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3 text-xs font-medium text-zinc-300 shadow-[var(--trail-shadow-border)] transition-[color,transform] hover:text-zinc-50 active:translate-y-px";

function createEmptyInput(
  defaultCommunity = "",
  defaultQuestion = "",
  defaultXUrl = "",
): BuildPostInput {
  return {
    title: "",
    summary: "",
    tools: "",
    stack: "",
    githubUrl: "",
    xUrl: defaultXUrl,
    demoUrl: "",
    proofNote: "",
    question: defaultQuestion,
    community: defaultCommunity,
  };
}

function mergeCsv(existing: string, incoming: string[]): string {
  const values = [
    ...existing
      .split(/[,\n]/)
      .map((value) => value.trim())
      .filter(Boolean),
    ...incoming,
  ];
  const seen = new Set<string>();
  return values
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

function deriveTitle(summary: string): string {
  const firstLine =
    summary
      .split(/\n+/)
      .map((line) => line.trim())
      .find(Boolean) ?? "";
  const firstSentence = firstLine.match(/^(.+?[.!?])(\s|$)/)?.[1] ?? firstLine;
  return firstSentence
    .replace(/^[-*#\d.)\s]+/, "")
    .slice(0, 120)
    .trim();
}

type ProofKind = "empty" | "github" | "x" | "demo";

function proofKindFromUrl(value: string): ProofKind {
  const url = value.trim().toLowerCase();
  if (!url) return "empty";
  if (url.includes("github.com/")) return "github";
  if (url.includes("x.com/") || url.includes("twitter.com/")) return "x";
  return "demo";
}

function proofUrlValue(input: BuildPostInput): string {
  return input.githubUrl || input.xUrl || input.demoUrl;
}

function isValidHttpUrl(value: string): boolean {
  if (!value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function proofUrlCount(input: BuildPostInput): number {
  return [
    input.githubUrl.trim() && parseGithubBuildUrl(input.githubUrl) ? input.githubUrl : "",
    input.xUrl.trim() && parseXPostUrl(input.xUrl) ? input.xUrl : "",
    input.demoUrl.trim() && isValidHttpUrl(input.demoUrl) ? input.demoUrl : "",
  ].filter(Boolean).length;
}

type BuildPostFormProps = {
  defaultCommunity?: string;
  defaultQuestion?: string;
  defaultXUrl?: string;
  quotedPick?: QuotedPick | null;
};

export function BuildPostForm({
  defaultCommunity = "",
  defaultQuestion = "",
  defaultXUrl = "",
  quotedPick = null,
}: BuildPostFormProps) {
  const [input, setInput] = useState<BuildPostInput>(() =>
    createEmptyInput(defaultCommunity, defaultQuestion, defaultXUrl),
  );
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [githubImportStatus, setGithubImportStatus] = useState<string | null>(null);
  const [githubImportError, setGithubImportError] = useState<string | null>(null);
  const [xImportStatus, setXImportStatus] = useState<string | null>(null);
  const [xImportError, setXImportError] = useState<string | null>(null);
  const [assistStatus, setAssistStatus] = useState<string | null>(null);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [published, setPublished] = useState<{
    href: string;
    shareUrl: string;
    title: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isImportPending, startImportTransition] = useTransition();
  const [isXImportPending, startXImportTransition] = useTransition();
  const [isAssistPending, startAssistTransition] = useTransition();

  const update = (key: keyof BuildPostInput, value: string) => {
    setInput((current) => ({ ...current, [key]: value }));
    setError(null);
    setCopyStatus(null);
    setGithubImportError(null);
    setGithubImportStatus(null);
    setXImportError(null);
    setXImportStatus(null);
    setAssistError(null);
    setAssistStatus(null);
  };

  const updateProofUrl = (value: string) => {
    const kind = proofKindFromUrl(value);
    setInput((current) => ({
      ...current,
      githubUrl: kind === "github" ? value : "",
      xUrl: kind === "x" ? value : "",
      demoUrl: kind === "demo" ? value : "",
    }));
    setError(null);
    setCopyStatus(null);
    setGithubImportError(null);
    setGithubImportStatus(null);
    setXImportError(null);
    setXImportStatus(null);
    setAssistError(null);
    setAssistStatus(null);
  };

  const publish = () => {
    startTransition(async () => {
      const summary = input.summary.trim();
      const title = input.title.trim() || deriveTitle(summary);
      if (!summary || !title) {
        setError("Write what shipped before publishing.");
        setPublished(null);
        return;
      }
      const quality = validateBuildPostQuality({
        summary,
        proofUrlCount: proofUrlCount(input),
        proofNote: input.proofNote,
        question: input.question,
      });
      if (!quality.ok) {
        setError(
          quality.issues[0]?.message ?? "Add a clear outcome, proof, and context before posting.",
        );
        setPublished(null);
        return;
      }

      const result = await createBuildPostFromFeed({
        ...input,
        summary,
        title,
      });
      if (!result.ok) {
        setError(result.error);
        setPublished(null);
        return;
      }
      setPublished({ href: result.href, shareUrl: result.shareUrl, title: result.title });
      setInput(createEmptyInput(defaultCommunity, defaultQuestion, defaultXUrl));
      setCopyStatus(null);
    });
  };

  const improveDraft = () => {
    setAssistError(null);
    setAssistStatus(null);
    startAssistTransition(async () => {
      const result = await improveBuildPostDraft(input);
      if (!result.ok) {
        setAssistError(result.error);
        return;
      }

      setInput((current) => ({
        ...current,
        title: result.draft.title || current.title,
        summary: result.draft.summary || current.summary,
        proofNote: result.draft.proofNote || current.proofNote,
        question: result.draft.question || current.question,
      }));
      setAssistStatus(
        result.missing.length > 0
          ? `Polished draft. Still needed: ${result.missing.join(" ")}`
          : "Polished draft. It now meets the minimum quality bar.",
      );
    });
  };

  async function copyShareUrl(shareUrl: string) {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyStatus("Copied link");
    } catch (error) {
      setCopyStatus(error instanceof Error ? `Copy failed: ${error.message}` : "Copy failed");
    }
  }

  const importFromGithub = () => {
    setGithubImportError(null);
    setGithubImportStatus(null);
    startImportTransition(async () => {
      const result = await importGithubBuildDraft(input.githubUrl);
      if (!result.ok) {
        setGithubImportError(result.error);
        return;
      }

      setInput((current) => ({
        ...current,
        title: current.title.trim() ? current.title : result.draft.title,
        summary: current.summary.trim() ? current.summary : result.draft.summary,
        stack: mergeCsv(current.stack, result.draft.stack),
        githubUrl: result.draft.githubUrl,
      }));
      setGithubImportStatus(
        `Drafted from ${result.sourceLabel}. Review the copy before publishing.`,
      );
    });
  };

  const importFromX = () => {
    setXImportError(null);
    setXImportStatus(null);
    startXImportTransition(async () => {
      const result = await importXBuildDraft(input.xUrl);
      if (!result.ok) {
        setXImportError(result.error);
        return;
      }

      setInput((current) => ({
        ...current,
        title: current.title.trim() ? current.title : result.draft.title,
        summary: current.summary.trim() ? current.summary : result.draft.summary,
        xUrl: result.draft.xUrl,
      }));
      setXImportStatus(`Drafted from ${result.sourceLabel}. Add your own take before publishing.`);
    });
  };

  const tweetHref = published
    ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(
        `I just posted a build on Trail: ${published.title}`,
      )}&url=${encodeURIComponent(published.shareUrl)}`
    : null;
  const generatedTitle = deriveTitle(input.summary);
  const publishTitle = input.title.trim() || generatedTitle;
  const proofUrl = proofUrlValue(input);
  const proofKind = proofKindFromUrl(proofUrl);
  const proofStatus = githubImportStatus ?? xImportStatus;
  const proofError = githubImportError ?? xImportError;
  const proofIsImportable = proofKind === "github" || proofKind === "x";
  const proofImportPending = proofKind === "github" ? isImportPending : isXImportPending;
  const proofLabel =
    proofKind === "github"
      ? "GitHub proof"
      : proofKind === "x"
        ? "X proof"
        : proofKind === "demo"
          ? "Demo proof"
          : "No proof yet";
  const proofCount = proofUrlCount(input);
  const quality = validateBuildPostQuality({
    summary: input.summary,
    proofUrlCount: proofCount,
    proofNote: input.proofNote,
    question: input.question,
  });
  const proofDetailLabel = proofCount > 0 ? proofLabel : "Proof note";
  const detailsCount = [input.tools, input.stack, input.question, input.community].filter(
    (value) => value.trim().length > 0,
  ).length;
  const hasStarterContext = Boolean(defaultQuestion.trim() || defaultXUrl.trim() || quotedPick);

  const canUseAssist = [
    input.title,
    input.summary,
    input.proofNote,
    input.question,
    input.githubUrl,
    input.xUrl,
    input.demoUrl,
  ].some((value) => value.trim().length > 0);
  const checklist = [
    {
      label: "Clear shipped outcome",
      status: quality.checks.outcome ? "complete" : "open",
      detail: quality.checks.outcome
        ? "The build is specific enough for the feed"
        : "Name what shipped and who it helps",
    },
    {
      label: "Credible proof",
      status: quality.checks.proof ? "complete" : "open",
      detail: quality.checks.proof ? proofDetailLabel : "Add a proof URL or public note",
    },
    {
      label: "Why it matters",
      status: quality.checks.context ? "complete" : "open",
      detail: quality.checks.context
        ? "Readers have a reason to reply"
        : "Add why it matters, a lesson, or a question",
    },
    {
      label: "Add details",
      status: detailsCount > 0 ? "complete" : "optional",
      detail:
        detailsCount > 0
          ? `${detailsCount} extra detail${detailsCount === 1 ? "" : "s"}`
          : "Tools, stack, question, community",
    },
  ] satisfies Array<{ label: string; status: "complete" | "open" | "optional"; detail: string }>;

  return (
    <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 text-zinc-50 shadow-[var(--trail-shadow-border)]">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          publish();
        }}
        className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]"
      >
        <div className="space-y-5 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),transparent_20rem)] px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <div className="grid gap-4 border-b border-white/10 pb-5 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--trail-green)]">
                60-second composer
              </div>
              <h1 className="mt-3 max-w-2xl font-display text-4xl leading-[0.95] tracking-[-0.06em] text-zinc-50 sm:text-6xl">
                Post a build worth reading.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400">
                Trail now asks for the useful minimum: what shipped, proof people can trust, and why
                another builder should care.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={improveDraft}
                  disabled={!canUseAssist || isAssistPending}
                  className={secondaryButtonClassName}
                >
                  {isAssistPending ? "Polishing..." : "Improve with GPT-5.4 mini"}
                </button>
                <span className="max-w-sm text-xs leading-5 text-zinc-500">
                  AI can tighten the draft, but the checklist still decides what can publish.
                </span>
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-4 text-sm leading-6 text-zinc-400">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Fast path
              </div>
              <ol className="mt-3 space-y-2">
                <li>1. Say what changed.</li>
                <li>2. Add proof link or note.</li>
                <li>3. Publish, then let the thread grow.</li>
              </ol>
            </div>
          </div>

          {assistStatus ? (
            <div
              aria-live="polite"
              className="rounded-3xl border border-[color:var(--trail-green-border)] bg-[var(--trail-green-soft)] p-4 text-sm leading-6 text-zinc-200"
            >
              {assistStatus}
            </div>
          ) : null}
          {assistError ? (
            <div
              aria-live="polite"
              className="rounded-3xl border border-red-500/25 bg-red-500/10 p-4 text-sm leading-6 text-red-100"
            >
              {assistError}
            </div>
          ) : null}

          {hasStarterContext && !quotedPick ? (
            <div className="rounded-3xl border border-[color:var(--trail-green-border)] bg-[var(--trail-green-soft)] p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--trail-green)]">
                {quotedPick ? "Quoting a Trail Pick" : "Trail Pick starter"}
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-300">
                The source link and discussion prompt are already here. Add your take in the big
                box, then publish it as your own Trail post.
              </p>
            </div>
          ) : null}

          <section className="space-y-4 rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-4 sm:p-5">
            <Field
              label={quotedPick ? "Your take" : "What did you ship?"}
              labelFor="build-summary"
              hint={
                quotedPick
                  ? "Add your take on the quoted post below — what you'd test, build, ship, or disagree with."
                  : "Lead with the outcome. Add why it matters or what feedback you want if you know it."
              }
              required
            >
              <textarea
                id="build-summary"
                value={input.summary}
                onChange={(event) => update("summary", event.target.value)}
                rows={7}
                maxLength={1200}
                placeholder={
                  quotedPick
                    ? "Here's my take — what I'd test, build, or push back on…"
                    : "I shipped a cleaner /create flow so builders can post proof-backed work without fighting a long form. It helps new builders share the actual outcome, then asks for feedback on the thread."
                }
                className={`${textareaClassName} text-base sm:text-lg`}
                required
                aria-required="true"
              />
            </Field>

            {quotedPick ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--trail-green)]">
                  <QuoteRepostIcon className="h-3 w-3" />
                  Quoting
                </div>
                <QuotedPickEmbed pick={quotedPick} />
              </div>
            ) : null}

            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-zinc-500">
              <span className="font-mono uppercase tracking-[0.18em] text-zinc-600">
                Feed title
              </span>
              <span className="mt-1 block text-sm font-medium text-zinc-300">
                {publishTitle || "Trail will use your first clear sentence."}
              </span>
            </div>

            <div className="grid gap-3 rounded-3xl border border-white/10 bg-black/25 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <Field
                label="Proof link"
                labelFor="build-proof"
                hint="Paste GitHub, X/Twitter, or a demo/deploy URL. If the link is private, use the public proof note below instead."
              >
                <input
                  id="build-proof"
                  type="url"
                  value={proofUrl}
                  onChange={(event) => updateProofUrl(event.target.value)}
                  placeholder="https://github.com/owner/repo/pull/12"
                  className={`${inputClassName} font-mono text-xs`}
                />
              </Field>
              {proofIsImportable ? (
                <button
                  type="button"
                  onClick={proofKind === "github" ? importFromGithub : importFromX}
                  disabled={!proofUrl.trim() || proofImportPending}
                  className={secondaryButtonClassName}
                >
                  {proofImportPending ? "Reading..." : "Draft from URL"}
                </button>
              ) : proofKind === "demo" ? (
                <div className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 px-4 text-xs font-medium text-zinc-400">
                  Demo attached
                </div>
              ) : null}
            </div>

            <Field
              label="Proof note"
              labelFor="build-proof-note"
              hint="This is public on the post. Use it when the repo or demo is private, but never include secrets or customer details."
            >
              <textarea
                id="build-proof-note"
                value={input.proofNote}
                onChange={(event) => update("proofNote", event.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Private repo. Demoed the flow to the support lead after deploy, and the rollout notes are in Linear."
                className={`${textareaClassName} min-h-24`}
              />
            </Field>

            {proofStatus ? (
              <div
                aria-live="polite"
                className="rounded-2xl border border-[color:var(--trail-green-border)] bg-[var(--trail-green-soft)] px-4 py-3 text-sm leading-6 text-zinc-200"
              >
                {proofStatus}
              </div>
            ) : null}
            {proofError ? (
              <div
                aria-live="polite"
                className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100"
              >
                {proofError}
              </div>
            ) : null}

            <details className="group rounded-3xl border border-white/10 bg-black/20 open:bg-black/25">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 text-sm font-semibold text-zinc-100 outline-none transition-colors hover:text-zinc-50 focus-visible:ring-2 focus-visible:ring-[var(--trail-green)]">
                <span>Add details</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  Optional
                </span>
              </summary>
              <div className="space-y-4 border-t border-white/10 px-4 pb-4 pt-4">
                <Field
                  label="Post title override"
                  labelFor="build-title"
                  hint="Leave blank to use the first sentence above."
                >
                  <input
                    id="build-title"
                    value={input.title}
                    onChange={(event) => update("title", event.target.value)}
                    maxLength={120}
                    placeholder={generatedTitle || "A concise feed title"}
                    className={inputClassName}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Tools used" labelFor="build-tools" hint="Comma-separated.">
                    <input
                      id="build-tools"
                      value={input.tools}
                      onChange={(event) => update("tools", event.target.value)}
                      placeholder="Claude Code, Cursor, v0"
                      className={inputClassName}
                    />
                  </Field>
                  <Field label="Stack / tags" labelFor="build-stack" hint="Comma-separated.">
                    <input
                      id="build-stack"
                      value={input.stack}
                      onChange={(event) => update("stack", event.target.value)}
                      placeholder="Next.js, Postgres, Vercel"
                      className={inputClassName}
                    />
                  </Field>
                </div>

                <Field label="Question for the community" labelFor="build-question">
                  <input
                    id="build-question"
                    value={input.question}
                    onChange={(event) => update("question", event.target.value)}
                    maxLength={260}
                    placeholder="What would you improve before I demo this?"
                    className={inputClassName}
                  />
                </Field>

                <label className="flex gap-3 rounded-3xl border border-white/10 bg-white/[0.035] p-4 text-sm leading-6 text-zinc-400">
                  <input
                    type="checkbox"
                    checked={input.community === "puerto-rico"}
                    onChange={(event) =>
                      update("community", event.target.checked ? "puerto-rico" : "")
                    }
                    className="mt-1 size-4 rounded border-white/20 bg-zinc-950 accent-[var(--trail-green)]"
                  />
                  <span>
                    <span className="block font-medium text-zinc-100">
                      Add to Puerto Rico AI builders
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-zinc-500">
                      Use this for local meetup demos, island-built projects, and PR/USA
                      collaboration posts.
                    </span>
                  </span>
                </label>
              </div>
            </details>
          </section>
        </div>

        <aside className="border-t border-white/10 bg-black/35 px-4 py-5 text-zinc-50 sm:px-6 lg:border-l lg:border-t-0 lg:px-6 lg:py-8">
          <div className="sticky top-24 space-y-5">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--trail-green)]">
                Publish check
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Complete the first three checks before publishing. Details stay optional, but thin
                posts do not enter the feed.
              </p>
            </div>

            <div className="space-y-2">
              {checklist.map((item) => (
                <ChecklistItem
                  detail={item.detail}
                  key={item.label}
                  label={item.label}
                  status={item.status}
                />
              ))}
            </div>

            {error ? (
              <div
                aria-live="polite"
                className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100"
              >
                {error}
              </div>
            ) : null}

            {published ? (
              <div
                aria-live="polite"
                className="space-y-4 rounded-3xl border border-[color:var(--trail-green-border)] bg-[var(--trail-green-soft)] px-4 py-4 text-sm leading-6 text-zinc-100"
              >
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--trail-green)]">
                    Build is live
                  </div>
                  <div className="mt-1 font-medium text-zinc-50">{published.title}</div>
                  <p className="mt-2 text-xs leading-5 text-zinc-400">
                    Share it, open the thread, or check where it landed in the feed.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={published.href} className={primaryButtonClassName}>
                    Open post
                  </Link>
                  <Link href="/feed" className={ghostButtonClassName}>
                    View feed
                  </Link>
                  <button
                    type="button"
                    onClick={() => copyShareUrl(published.shareUrl)}
                    className={ghostButtonClassName}
                  >
                    {copyStatus ?? "Copy link"}
                  </button>
                  {tweetHref ? (
                    <a
                      href={tweetHref}
                      target="_blank"
                      rel="noreferrer"
                      className={ghostButtonClassName}
                    >
                      Share on X
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isPending || !quality.ok}
              className={`${primaryButtonClassName} w-full`}
            >
              {isPending ? "Publishing..." : quality.ok ? "Publish build" : "Complete minimum"}
            </button>
            <p className="text-xs leading-5 text-zinc-600">
              Publishing creates a public post on your Trail profile. Proof links and proof notes
              stay labeled as proof, not fake activity.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}

function ChecklistItem({
  label,
  detail,
  status,
}: {
  label: string;
  detail: string;
  status: "complete" | "open" | "optional";
}) {
  const complete = status === "complete";
  const optional = status === "optional";
  return (
    <div className="flex gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3">
      <div
        className={
          complete
            ? "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--trail-green)] text-[11px] font-bold text-black"
            : optional
              ? "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-white/15 text-[10px] text-zinc-500"
              : "mt-0.5 size-5 shrink-0 rounded-full border border-white/15"
        }
        aria-hidden
      >
        {complete ? "✓" : optional ? "-" : null}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-zinc-100">{label}</div>
        <div className="mt-0.5 text-xs leading-5 text-zinc-600">{detail}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  labelFor,
  hint,
  required = false,
  children,
}: {
  label: string;
  labelFor: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={labelFor}
        className="block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500"
      >
        {label} {required ? <span className="text-zinc-300">Required</span> : null}
      </label>
      {children}
      {hint && <div className="mt-2 min-h-5 text-xs leading-5 text-zinc-500">{hint}</div>}
    </div>
  );
}
