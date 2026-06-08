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

type BulkResult = {
  repo: string;
  id?: string;
  skipped?: boolean;
  error?: string;
};

export function CreateKitClient() {
  const router = useRouter();
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [prompts, setPrompts] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BulkResult[] | null>(null);

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
    if (!q) return repos.slice(0, 80);
    return repos.filter((r) => r.fullName.toLowerCase().includes(q)).slice(0, 80);
  }, [repos, query]);

  function toggle(repo: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(repo)) next.delete(repo);
      else next.add(repo);
      return next;
    });
  }

  const count = selected.size;

  async function submit() {
    if (count === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    setResults(null);

    // Single repo → keep the focused flow (prompts apply, jump to the kit).
    if (count === 1) {
      const repo = [...selected][0];
      const promptList = prompts
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean);
      try {
        const res = await fetch("/api/kit/capture", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repo, prompts: promptList }),
        });
        const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
        if (!res.ok || !body?.id) {
          setError(
            body?.error === "kit_storage_unavailable"
              ? "Kit storage isn't set up yet."
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
      return;
    }

    // Multiple repos → bulk seed, show per-repo results inline.
    try {
      const res = await fetch("/api/kit/capture/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repos: [...selected] }),
      });
      const body = (await res.json().catch(() => null)) as {
        results?: BulkResult[];
        error?: string;
      } | null;
      if (!res.ok || !body?.results) {
        setError(
          body?.error === "kit_storage_unavailable"
            ? "Kit storage isn't set up yet."
            : (body?.error ?? "Could not build the kits."),
        );
        setSubmitting(false);
        return;
      }
      setResults(body.results);
      setSelected(new Set());
      setSubmitting(false);
    } catch {
      setError("Could not build the kits. Try again.");
      setSubmitting(false);
    }
  }

  if (results) {
    const ok = results.filter((r) => r.id);
    return (
      <div className="space-y-4">
        <div className="text-[13px] text-zinc-300">
          Built <span className="font-mono text-[var(--accent-text)]">{ok.length}</span> of{" "}
          {results.length} kits.
        </div>
        <ul className="divide-y divide-white/[0.08] overflow-hidden rounded-xl border border-white/[0.08]">
          {results.map((r) => (
            <li
              key={r.repo}
              className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]"
            >
              <span className="truncate font-mono text-zinc-300">{r.repo}</span>
              {r.id ? (
                <a
                  href={`/kit/${r.id}`}
                  className="shrink-0 font-mono text-[12px] text-[var(--accent-text)] hover:underline"
                >
                  {r.skipped ? "already a kit →" : "view kit →"}
                </a>
              ) : (
                <span className="shrink-0 font-mono text-[12px] text-red-300">
                  {r.error ?? "failed"}
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          <a
            href="/library"
            className="inline-flex min-h-9 items-center rounded-full bg-[var(--accent)] px-3.5 text-[13px] font-medium text-[var(--on-accent)] hover:bg-[var(--accent-bright)]"
          >
            Open your library →
          </a>
          <button
            type="button"
            onClick={() => setResults(null)}
            className="inline-flex min-h-9 items-center rounded-full px-3 text-[13px] text-zinc-400 hover:text-zinc-100"
          >
            Build more
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="kit-repo-search" className="text-[13px] font-medium text-zinc-300">
          1. Pick repos
        </label>
        <p className="mt-1 text-[12px] text-zinc-500">
          Select one — or several — and Trail reads each repo's rules files and stack server-side.
          No install.
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
              {filtered.map((repo) => {
                const isSel = selected.has(repo.fullName);
                return (
                  <li key={repo.fullName}>
                    <button
                      type="button"
                      onClick={() => toggle(repo.fullName)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                        isSel ? "bg-[var(--accent)]/10" : "hover:bg-white/[0.03]",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]",
                          isSel
                            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]"
                            : "border-white/20 text-transparent",
                        )}
                        aria-hidden
                      >
                        ✓
                      </span>
                      <span className="min-w-0 flex-1">
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
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {count <= 1 ? (
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
            placeholder={
              "Add GitHub OAuth with better-auth\nWire the session to a server component"
            }
            className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-[13px] leading-5 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/25"
          />
        </div>
      ) : (
        <p className="text-[12px] text-zinc-500">
          Building {count} kits — prompts are skipped in batch mode. You can add prompts per kit
          later.
        </p>
      )}

      {error ? <p className="text-[13px] text-red-300">{error}</p> : null}

      <button
        type="button"
        disabled={count === 0 || submitting}
        onClick={submit}
        className={cn(
          "inline-flex min-h-10 items-center rounded-full px-4 text-[13px] font-medium transition-[background-color,transform] active:scale-[0.97]",
          count === 0 || submitting
            ? "cursor-not-allowed bg-zinc-800 text-zinc-500"
            : "bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-bright)]",
        )}
      >
        {submitting
          ? count > 1
            ? `Building ${count} kits…`
            : "Building kit…"
          : count === 0
            ? "Pick repos"
            : count === 1
              ? `Build kit from ${[...selected][0]}`
              : `Build ${count} kits`}
      </button>
    </div>
  );
}
