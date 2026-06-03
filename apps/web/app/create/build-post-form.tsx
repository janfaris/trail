"use client";

import { type BuildPostInput, createBuildPostFromFeed } from "@/app/feed/actions";
import Link from "next/link";
import { useState, useTransition } from "react";

const inputClassName =
  "w-full border-0 border-b border-white/10 bg-transparent px-0 py-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-700 focus:border-[#a7f300]/60";

const emptyInput: BuildPostInput = {
  title: "",
  summary: "",
  tools: "",
  stack: "",
  githubUrl: "",
  xUrl: "",
  demoUrl: "",
  question: "",
};

export function BuildPostForm() {
  const [input, setInput] = useState<BuildPostInput>(emptyInput);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<{
    href: string;
    shareUrl: string;
    title: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const update = (key: keyof BuildPostInput, value: string) => {
    setInput((current) => ({ ...current, [key]: value }));
    setError(null);
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
      setInput(emptyInput);
    });
  };

  return (
    <div className="border-y border-white/10 bg-zinc-950">
      <div className="border-b border-white/10 px-5 py-4 sm:px-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
          No install needed
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-zinc-50 sm:text-3xl">
          Post a build
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
          Share what you built with AI, add proof links, and start the thread. Logs are optional.
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          publish();
        }}
        className="grid gap-0 divide-y divide-white/10 lg:grid-cols-[minmax(0,1fr)_280px] lg:divide-x lg:divide-y-0"
      >
        <div className="space-y-8 px-5 py-6 sm:px-6">
          <Field label="What did you build?" labelFor="build-title">
            <input
              id="build-title"
              value={input.title}
              onChange={(event) => update("title", event.target.value)}
              maxLength={120}
              placeholder="A Vercel cron monitor for AI Radar"
              className={`${inputClassName} text-lg font-semibold tracking-[-0.03em]`}
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
              className={`${inputClassName} resize-none leading-6`}
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

        <aside className="space-y-6 px-5 py-6 sm:px-6">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              Proof links
            </div>
            <p className="mt-2 text-xs leading-5 text-zinc-600">
              Add any public link. Trail labels these as proof, not fake social activity.
            </p>
          </div>

          <Field label="GitHub" labelFor="build-github">
            <input
              id="build-github"
              type="url"
              value={input.githubUrl}
              onChange={(event) => update("githubUrl", event.target.value)}
              placeholder="https://github.com/owner/repo/pull/12"
              className={`${inputClassName} font-mono text-xs`}
            />
          </Field>

          <Field label="X / Twitter" labelFor="build-x">
            <input
              id="build-x"
              type="url"
              value={input.xUrl}
              onChange={(event) => update("xUrl", event.target.value)}
              placeholder="https://x.com/..."
              className={`${inputClassName} font-mono text-xs`}
            />
          </Field>

          <Field label="Demo / deploy" labelFor="build-demo">
            <input
              id="build-demo"
              type="url"
              value={input.demoUrl}
              onChange={(event) => update("demoUrl", event.target.value)}
              placeholder="https://your-demo.vercel.app"
              className={`${inputClassName} font-mono text-xs`}
            />
          </Field>

          {error && (
            <div className="border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-200">
              {error}
            </div>
          )}

          {published && (
            <div className="space-y-3 border border-[#a7f300]/25 bg-[#a7f300]/10 px-4 py-3 text-sm leading-6 text-zinc-100">
              <div className="font-medium text-[#d8ff8f]">Published: {published.title}</div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={published.href}
                  className="text-[#d8ff8f] underline-offset-4 hover:underline"
                >
                  Open post
                </Link>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(published.shareUrl)}
                  className="text-zinc-300 underline-offset-4 hover:text-zinc-50 hover:underline"
                >
                  Copy link
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-zinc-100 px-5 text-sm font-semibold text-zinc-950 transition-[background-color,transform] hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
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
  children,
}: {
  label: string;
  labelFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={labelFor}
        className="block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500"
      >
        {label}
      </label>
      {children}
      {hint && <div className="mt-2 text-xs leading-5 text-zinc-600">{hint}</div>}
    </div>
  );
}
