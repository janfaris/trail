"use client";

import { importGithubBuildDraft, importXBuildDraft } from "@/app/create/actions";
import { type BuildPostInput, createBuildPostFromFeed } from "@/app/feed/actions";
import Link from "next/link";
import { type ReactNode, useState, useTransition } from "react";

const inputClassName =
  "w-full border-0 border-b border-black/15 bg-transparent px-0 py-3 text-sm text-[var(--trail-ink)] outline-none transition-colors placeholder:text-black/35 focus:border-[color:var(--trail-green)]";

const railInputClassName =
  "w-full border-0 border-b border-white/15 bg-transparent px-0 py-3 text-sm text-zinc-50 outline-none transition-colors placeholder:text-zinc-600 focus:border-[color:var(--trail-green)]";

function createEmptyInput(defaultCommunity = "", defaultQuestion = ""): BuildPostInput {
  return {
    title: "",
    summary: "",
    tools: "",
    stack: "",
    githubUrl: "",
    xUrl: "",
    demoUrl: "",
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

type BuildPostFormProps = {
  defaultCommunity?: string;
  defaultQuestion?: string;
};

export function BuildPostForm({ defaultCommunity = "", defaultQuestion = "" }: BuildPostFormProps) {
  const [input, setInput] = useState<BuildPostInput>(() =>
    createEmptyInput(defaultCommunity, defaultQuestion),
  );
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [githubImportStatus, setGithubImportStatus] = useState<string | null>(null);
  const [githubImportError, setGithubImportError] = useState<string | null>(null);
  const [xImportStatus, setXImportStatus] = useState<string | null>(null);
  const [xImportError, setXImportError] = useState<string | null>(null);
  const [published, setPublished] = useState<{
    href: string;
    shareUrl: string;
    title: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isImportPending, startImportTransition] = useTransition();
  const [isXImportPending, startXImportTransition] = useTransition();

  const update = (key: keyof BuildPostInput, value: string) => {
    setInput((current) => ({ ...current, [key]: value }));
    setError(null);
    setCopyStatus(null);
    setGithubImportError(null);
    setGithubImportStatus(null);
    setXImportError(null);
    setXImportStatus(null);
  };

  const publish = () => {
    startTransition(async () => {
      const result = await createBuildPostFromFeed(input);
      if (!result.ok) {
        setError(result.error);
        setPublished(null);
        return;
      }
      setPublished({ href: result.href, shareUrl: result.shareUrl, title: result.title });
      setInput(createEmptyInput(defaultCommunity, defaultQuestion));
      setCopyStatus(null);
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

  return (
    <div className="overflow-hidden rounded-[2rem] bg-[var(--trail-paper)] text-[var(--trail-ink)] shadow-[var(--trail-shadow-border)]">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          publish();
        }}
        className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]"
      >
        <div className="space-y-8 px-5 py-6 sm:px-8 sm:py-8">
          <div className="border-b border-black/10 pb-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-black/45">
              No install needed
            </div>
            <h1 className="mt-3 max-w-2xl font-display text-4xl leading-[0.95] tracking-[-0.06em] text-[var(--trail-ink)] sm:text-6xl">
              Post the thing you just built.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-black/60">
              Write the outcome, attach proof links, and give other builders a useful thread to
              join. Logs stay optional.
            </p>
          </div>

          <Field label="What did you build?" labelFor="build-title">
            <input
              id="build-title"
              value={input.title}
              onChange={(event) => update("title", event.target.value)}
              maxLength={120}
              placeholder="A Vercel cron monitor for AI Radar"
              className={`${inputClassName} text-xl font-semibold tracking-[-0.04em] sm:text-2xl`}
              required
            />
          </Field>

          <Field label="Why does it matter?" labelFor="build-summary">
            <textarea
              id="build-summary"
              value={input.summary}
              onChange={(event) => update("summary", event.target.value)}
              rows={5}
              maxLength={1200}
              placeholder="What changed, who it helps, what you learned, and what feedback you want."
              className={`${inputClassName} resize-none leading-7`}
              required
            />
          </Field>

          <div className="grid gap-6 sm:grid-cols-2">
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
        </div>

        <aside className="space-y-6 bg-[var(--trail-ink)] px-5 py-6 text-zinc-50 sm:px-6 sm:py-8">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--trail-green)]">
              Proof links
            </div>
            <p className="mt-2 text-xs leading-5 text-zinc-400">
              Add any public link. Trail labels these as proof, never as fake social activity.
            </p>
          </div>

          <Field label="GitHub" labelFor="build-github" tone="rail">
            <input
              id="build-github"
              type="url"
              value={input.githubUrl}
              onChange={(event) => update("githubUrl", event.target.value)}
              placeholder="https://github.com/owner/repo/pull/12"
              className={`${railInputClassName} font-mono text-xs`}
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={importFromGithub}
                disabled={!input.githubUrl.trim() || isImportPending}
                className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition-[background-color,transform] hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isImportPending ? "Reading GitHub..." : "Draft from GitHub"}
              </button>
              <span className="text-[11px] leading-5 text-zinc-500">
                Repo, PR, release, issue, discussion, or commit
              </span>
            </div>
            {githubImportError ? (
              <div className="mt-3 text-xs leading-5 text-red-200">{githubImportError}</div>
            ) : null}
            {githubImportStatus ? (
              <div className="mt-3 text-xs leading-5 text-[var(--trail-green)]">
                {githubImportStatus}
              </div>
            ) : null}
          </Field>

          <Field label="X / Twitter" labelFor="build-x" tone="rail">
            <input
              id="build-x"
              type="url"
              value={input.xUrl}
              onChange={(event) => update("xUrl", event.target.value)}
              placeholder="https://x.com/..."
              className={`${railInputClassName} font-mono text-xs`}
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={importFromX}
                disabled={!input.xUrl.trim() || isXImportPending}
                className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition-[background-color,transform] hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isXImportPending ? "Reading X..." : "Draft from X"}
              </button>
              <span className="text-[11px] leading-5 text-zinc-500">Public status posts only</span>
            </div>
            {xImportError ? (
              <div className="mt-3 text-xs leading-5 text-red-200">{xImportError}</div>
            ) : null}
            {xImportStatus ? (
              <div className="mt-3 text-xs leading-5 text-[var(--trail-green)]">
                {xImportStatus}
              </div>
            ) : null}
          </Field>

          <Field label="Demo / deploy" labelFor="build-demo" tone="rail">
            <input
              id="build-demo"
              type="url"
              value={input.demoUrl}
              onChange={(event) => update("demoUrl", event.target.value)}
              placeholder="https://your-demo.vercel.app"
              className={`${railInputClassName} font-mono text-xs`}
            />
          </Field>

          <label className="flex gap-3 border-y border-white/10 py-4 text-sm leading-6 text-zinc-300">
            <input
              type="checkbox"
              checked={input.community === "puerto-rico"}
              onChange={(event) => update("community", event.target.checked ? "puerto-rico" : "")}
              className="mt-1 size-4 rounded border-white/20 bg-zinc-950 accent-[var(--trail-green)]"
            />
            <span>
              <span className="block font-medium text-zinc-100">
                Add to Puerto Rico AI builders
              </span>
              <span className="mt-1 block text-xs leading-5 text-zinc-600">
                Use this for local meetup demos, island-built projects, and PR/USA collaboration
                posts.
              </span>
            </span>
          </label>

          {error && (
            <div className="border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">
              {error}
            </div>
          )}

          {published && (
            <div className="space-y-4 border border-[color:var(--trail-green-border)] bg-[var(--trail-green-soft)] px-4 py-4 text-sm leading-6 text-zinc-100">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--trail-green)]">
                  Build is live
                </div>
                <div className="mt-1 font-medium text-zinc-50">{published.title}</div>
                <p className="mt-2 text-xs leading-5 text-zinc-400">
                  Now share it, open the thread, or check where it landed in the feed.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={published.href}
                  className="rounded-full bg-[var(--trail-green)] px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-white"
                >
                  Open post
                </Link>
                <Link
                  href="/feed"
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-200 shadow-[var(--trail-shadow-border)] transition-colors hover:text-zinc-50"
                >
                  View feed
                </Link>
                <button
                  type="button"
                  onClick={() => copyShareUrl(published.shareUrl)}
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-200 shadow-[var(--trail-shadow-border)] transition-colors hover:text-zinc-50"
                >
                  {copyStatus ?? "Copy link"}
                </button>
                {tweetHref ? (
                  <a
                    href={tweetHref}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-200 shadow-[var(--trail-shadow-border)] transition-colors hover:text-zinc-50"
                  >
                    Share on X
                  </a>
                ) : null}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[var(--trail-green)] px-5 text-sm font-semibold text-black transition-[background-color,transform] hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Posting..." : "Publish build"}
          </button>
        </aside>
      </form>
    </div>
  );
}

function Field({
  label,
  labelFor,
  hint,
  tone = "paper",
  children,
}: {
  label: string;
  labelFor: string;
  hint?: string;
  tone?: "paper" | "rail";
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={labelFor}
        className={
          tone === "rail"
            ? "block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500"
            : "block font-mono text-[10px] uppercase tracking-[0.2em] text-black/45"
        }
      >
        {label}
      </label>
      {children}
      {hint && (
        <div
          className={
            tone === "rail"
              ? "mt-2 text-xs leading-5 text-zinc-500"
              : "mt-2 text-xs leading-5 text-black/45"
          }
        >
          {hint}
        </div>
      )}
    </div>
  );
}
