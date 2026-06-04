"use client";

import { importGithubBuildDraft, importXBuildDraft } from "@/app/create/actions";
import { type BuildPostInput, createBuildPostFromFeed } from "@/app/feed/actions";
import Link from "next/link";
import { type ReactNode, useState, useTransition } from "react";

const inputClassName =
  "min-h-12 w-full rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm text-[var(--trail-ink)] outline-2 outline-transparent transition-[background-color,border-color,box-shadow] placeholder:text-black/35 hover:bg-white focus:border-black/25 focus:outline-[var(--trail-green)]";

const textareaClassName = `${inputClassName} min-h-36 resize-y leading-7`;
const primaryButtonClassName =
  "inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-[var(--trail-green)] px-5 text-sm font-semibold text-black transition-[background-color,transform] hover:bg-white active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClassName =
  "inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-zinc-950 px-4 text-xs font-semibold text-zinc-50 transition-[background-color,transform] hover:bg-black active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45";
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
  defaultXUrl?: string;
};

export function BuildPostForm({
  defaultCommunity = "",
  defaultQuestion = "",
  defaultXUrl = "",
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
      setInput(createEmptyInput(defaultCommunity, defaultQuestion, defaultXUrl));
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
  const hasTitle = input.title.trim().length > 0;
  const hasSummary = input.summary.trim().length > 0;
  const proofCount = [input.githubUrl, input.xUrl, input.demoUrl].filter(
    (value) => value.trim().length > 0,
  ).length;
  const hasCommunityQuestion = input.question.trim().length > 0;
  const hasStarterContext = Boolean(defaultQuestion.trim() || defaultXUrl.trim());
  const checklist = [
    {
      label: "Name the build",
      complete: hasTitle,
      detail: hasTitle ? "Title is ready" : "Short, outcome-first title",
    },
    {
      label: "Explain why it matters",
      complete: hasSummary,
      detail: hasSummary ? "Summary is ready" : "Who it helps, what changed, what you learned",
    },
    {
      label: "Attach proof",
      complete: proofCount > 0,
      detail:
        proofCount > 0
          ? `${proofCount} proof link${proofCount === 1 ? "" : "s"}`
          : "GitHub, X, or demo URL",
    },
    {
      label: "Invite replies",
      complete: hasCommunityQuestion,
      detail: hasCommunityQuestion ? "Question added" : "Optional, but it starts the thread",
    },
  ];

  return (
    <div className="overflow-hidden rounded-[2rem] bg-[var(--trail-paper)] text-[var(--trail-ink)] shadow-[var(--trail-shadow-border)]">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          publish();
        }}
        className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]"
      >
        <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <div className="grid gap-4 border-b border-black/10 pb-5 lg:grid-cols-[minmax(0,1fr)_240px]">
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-black/45">
                Workbench composer
              </div>
              <h1 className="mt-3 max-w-2xl font-display text-4xl leading-[0.95] tracking-[-0.06em] text-[var(--trail-ink)] sm:text-6xl">
                Make the ship obvious.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-black/60">
                Three moves: say what changed, attach proof, ask for the next useful reply. Logs
                stay optional.
              </p>
            </div>
            <div className="rounded-3xl border border-black/10 bg-black/[0.035] p-4 text-sm leading-6 text-black/60">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45">
                Good post shape
              </div>
              <ol className="mt-3 space-y-2">
                <li>1. Outcome, not a feature dump.</li>
                <li>2. One proof link if you have it.</li>
                <li>3. A question people can answer.</li>
              </ol>
            </div>
          </div>

          {hasStarterContext ? (
            <div className="rounded-3xl border border-[color:var(--trail-green-border)] bg-[var(--trail-green-soft)] p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45">
                Trail Pick starter
              </div>
              <p className="mt-2 text-sm leading-6 text-black/65">
                I carried the source link and discussion question into this draft. Rewrite it in
                your voice before publishing.
              </p>
            </div>
          ) : null}

          <StepBlock
            number="1"
            title="Tell the story"
            description="This becomes the top of the feed card, so lead with the outcome."
          >
            <Field
              label="Build title"
              labelFor="build-title"
              hint="Keep it specific enough that another builder knows what shipped."
              required
            >
              <input
                id="build-title"
                value={input.title}
                onChange={(event) => update("title", event.target.value)}
                maxLength={120}
                placeholder="A Vercel cron monitor for AI Radar"
                className={`${inputClassName} text-xl font-semibold tracking-[-0.04em] sm:text-2xl`}
                required
                aria-required="true"
              />
            </Field>

            <Field
              label="Why it matters"
              labelFor="build-summary"
              hint="Name the user, the change, the lesson, and the feedback you want."
              required
            >
              <textarea
                id="build-summary"
                value={input.summary}
                onChange={(event) => update("summary", event.target.value)}
                rows={6}
                maxLength={1200}
                placeholder="I built this because... The surprising part was... I want feedback on..."
                className={textareaClassName}
                required
                aria-required="true"
              />
            </Field>
          </StepBlock>

          <StepBlock
            number="2"
            title="Attach proof"
            description="One strong source is enough. Draft buttons read public links and fill the story only when your fields are empty."
          >
            <div className="grid gap-3">
              <ProofCard
                label="GitHub"
                description="Repo, PR, release, issue, discussion, or commit."
                status={githubImportStatus}
                error={githubImportError}
                control={
                  <input
                    id="build-github"
                    type="url"
                    value={input.githubUrl}
                    onChange={(event) => update("githubUrl", event.target.value)}
                    placeholder="https://github.com/owner/repo/pull/12"
                    className={`${inputClassName} font-mono text-xs`}
                  />
                }
                action={
                  <button
                    type="button"
                    onClick={importFromGithub}
                    disabled={!input.githubUrl.trim() || isImportPending}
                    className={secondaryButtonClassName}
                  >
                    {isImportPending ? "Reading..." : "Draft"}
                  </button>
                }
              />

              <ProofCard
                label="X / Twitter"
                description="Public status posts only. Great for a Trail Pick response."
                status={xImportStatus}
                error={xImportError}
                control={
                  <input
                    id="build-x"
                    type="url"
                    value={input.xUrl}
                    onChange={(event) => update("xUrl", event.target.value)}
                    placeholder="https://x.com/..."
                    className={`${inputClassName} font-mono text-xs`}
                  />
                }
                action={
                  <button
                    type="button"
                    onClick={importFromX}
                    disabled={!input.xUrl.trim() || isXImportPending}
                    className={secondaryButtonClassName}
                  >
                    {isXImportPending ? "Reading..." : "Draft"}
                  </button>
                }
              />

              <ProofCard
                label="Demo / deploy"
                description="Anything people can open to see the build."
                control={
                  <input
                    id="build-demo"
                    type="url"
                    value={input.demoUrl}
                    onChange={(event) => update("demoUrl", event.target.value)}
                    placeholder="https://your-demo.vercel.app"
                    className={`${inputClassName} font-mono text-xs`}
                  />
                }
              />
            </div>

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
          </StepBlock>

          <StepBlock
            number="3"
            title="Invite the right replies"
            description="A useful question turns a post into a thread."
          >
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

            <label className="flex gap-3 rounded-3xl border border-black/10 bg-black/[0.035] p-4 text-sm leading-6 text-black/65">
              <input
                type="checkbox"
                checked={input.community === "puerto-rico"}
                onChange={(event) => update("community", event.target.checked ? "puerto-rico" : "")}
                className="mt-1 size-4 rounded border-black/20 bg-white accent-[var(--trail-green)]"
              />
              <span>
                <span className="block font-medium text-[var(--trail-ink)]">
                  Add to Puerto Rico AI builders
                </span>
                <span className="mt-1 block text-xs leading-5 text-black/50">
                  Use this for local meetup demos, island-built projects, and PR/USA collaboration
                  posts.
                </span>
              </span>
            </label>
          </StepBlock>
        </div>

        <aside className="bg-[var(--trail-ink)] px-4 py-5 text-zinc-50 sm:px-6 lg:px-6 lg:py-8">
          <div className="sticky top-24 space-y-5">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--trail-green)]">
                Publish check
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                A build post can be lightweight. The checklist just helps it land in the feed with
                context.
              </p>
            </div>

            <div className="space-y-2">
              {checklist.map((item) => (
                <ChecklistItem
                  complete={item.complete}
                  detail={item.detail}
                  key={item.label}
                  label={item.label}
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
              disabled={isPending}
              className={`${primaryButtonClassName} w-full`}
            >
              {isPending ? "Publishing..." : "Publish build"}
            </button>
            <p className="text-xs leading-5 text-zinc-600">
              Publishing creates a public post on your Trail profile. Proof links stay labeled as
              proof, not fake activity.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}

function StepBlock({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 rounded-[1.75rem] border border-black/10 bg-white/45 p-4 sm:p-5 lg:grid-cols-[132px_minmax(0,1fr)]">
      <div>
        <div className="flex size-9 items-center justify-center rounded-full bg-[var(--trail-ink)] font-mono text-xs font-semibold text-[var(--trail-green)]">
          {number}
        </div>
        <h2 className="mt-4 font-display text-2xl leading-none tracking-[-0.05em] text-[var(--trail-ink)]">
          {title}
        </h2>
        <p className="mt-2 text-xs leading-5 text-black/50">{description}</p>
      </div>
      <div className="min-w-0 space-y-5">{children}</div>
    </section>
  );
}

function ProofCard({
  label,
  description,
  control,
  action,
  status,
  error,
}: {
  label: string;
  description: string;
  control: ReactNode;
  action?: ReactNode;
  status?: string | null;
  error?: string | null;
}) {
  return (
    <div className="rounded-3xl border border-black/10 bg-[var(--trail-paper)] p-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/45">
            {label}
          </div>
          <p className="mt-1 text-xs leading-5 text-black/50">{description}</p>
        </div>
        {action}
      </div>
      <div className="mt-3">{control}</div>
      {error ? <div className="mt-2 text-xs leading-5 text-red-700">{error}</div> : null}
      {status ? <div className="mt-2 text-xs leading-5 text-black/60">{status}</div> : null}
    </div>
  );
}

function ChecklistItem({
  label,
  detail,
  complete,
}: {
  label: string;
  detail: string;
  complete: boolean;
}) {
  return (
    <div className="flex gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3">
      <div
        className={
          complete
            ? "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--trail-green)] text-[11px] font-bold text-black"
            : "mt-0.5 size-5 shrink-0 rounded-full border border-white/15"
        }
        aria-hidden
      >
        {complete ? "✓" : null}
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
        className="block font-mono text-[10px] uppercase tracking-[0.2em] text-black/45"
      >
        {label} {required ? <span className="text-[var(--trail-ink)]">Required</span> : null}
      </label>
      {children}
      {hint && <div className="mt-2 min-h-5 text-xs leading-5 text-black/45">{hint}</div>}
    </div>
  );
}
