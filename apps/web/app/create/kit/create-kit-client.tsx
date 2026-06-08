"use client";

import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Repo = {
  fullName: string;
  private: boolean;
  description: string | null;
  language: string | null;
  updatedAt: string | null;
  pushedAt: string | null;
};

export function CreateKitClient() {
  const router = useRouter();
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [prompts, setPrompts] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/github/repos")
      .then(async (r) => ({ ok: r.ok, body: (await r.json().catch(() => null)) as unknown }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok) {
          const code = (body as { error?: string } | null)?.error;
          setLoadError(
            code === "github_not_connected"
              ? "Connect GitHub to list your repos."
              : "Could not load your repos. Try again.",
          );
          return;
        }
        setRepos((body as { repos?: Repo[] } | null)?.repos ?? []);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load your repos. Try again.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!repos) return [];
    const q = query.trim().toLowerCase();
    if (!q) return repos.slice(0, 60);
    return repos.filter((r) => r.fullName.toLowerCase().includes(q)).slice(0, 60);
  }, [repos, query]);

  async function capture() {
    if (!selected || submitting) return;
    setSubmitting(true);
    setError(null);
    const promptList = prompts
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);
    try {
      const res = await fetch("/api/kit/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repo: selected, prompts: promptList }),
      });
      const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !body?.id) {
        setError(
          body?.error === "kit_storage_unavailable"
            ? "Kit storage isn't set up yet. Run db:push, then retry."
            : (body?.error ?? "Could not build the kit."),
        );
        setSubmitting(false);
        return;
      }
      router.push(`/kit/${body.id}`);
    } catch {
      setError("Could not build the kit. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="kit-repo-search" className="text-[13px] font-medium text-zinc-300">
          1. Pick a repo
        </label>
        <p className="mt-1 text-[12px] text-zinc-500">
          Trail reads its rules files (CLAUDE.md, .cursorrules…) and stack — server-side, with your
          GitHub token. No install.
        </p>
        <input
          id="kit-repo-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your repos…"
          className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-[14px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/25"
        />
        <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-white/[0.08]">
          {loadError ? (
            <div className="px-3 py-6 text-center text-[13px] text-zinc-500">{loadError}</div>
          ) : repos === null ? (
            <div className="px-3 py-6 text-center text-[13px] text-zinc-600">Loading repos…</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-[13px] text-zinc-600">No repos match.</div>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {filtered.map((repo) => (
                <li key={repo.fullName}>
                  <button
                    type="button"
                    onClick={() => setSelected(repo.fullName)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors",
                      selected === repo.fullName ? "bg-[#a7f300]/10" : "hover:bg-white/[0.03]",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-[13px] text-zinc-200">
                        {repo.fullName}
                      </span>
                      {repo.description ? (
                        <span className="block truncate text-[12px] text-zinc-600">
                          {repo.description}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                      {repo.private ? "private" : (repo.language ?? "")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="kit-prompts" className="text-[13px] font-medium text-zinc-300">
          2. Add the prompts that worked{" "}
          <span className="font-normal text-zinc-600">(optional, one per line)</span>
        </label>
        <textarea
          id="kit-prompts"
          value={prompts}
          onChange={(e) => setPrompts(e.target.value)}
          rows={4}
          placeholder={"Add GitHub OAuth with better-auth\nWire the session to a server component"}
          className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-[13px] leading-5 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/25"
        />
      </div>

      {error ? <p className="text-[13px] text-red-300">{error}</p> : null}

      <button
        type="button"
        disabled={!selected || submitting}
        onClick={capture}
        className={cn(
          "inline-flex min-h-10 items-center rounded-full px-4 text-[13px] font-medium transition-[background-color,transform] active:scale-[0.97]",
          !selected || submitting
            ? "cursor-not-allowed bg-zinc-800 text-zinc-500"
            : "bg-[#a7f300] text-black hover:bg-[#b6ff14]",
        )}
      >
        {submitting ? "Building kit…" : selected ? `Build kit from ${selected}` : "Pick a repo"}
      </button>
    </div>
  );
}
